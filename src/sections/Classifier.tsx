import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/providers/trpc-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Upload,
  Music,
  Download,
  FolderDown,
  AlertTriangle,
  CheckCircle2,
  CircleCheck,
  ExternalLink,
  FileSpreadsheet,
  Gauge,
  Layers3,
  ListFilter,
  LockKeyhole,
  Sparkles,
  Trash2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import { KEY_OPTIONS, keyToCamelot, keyToSpanish } from "@contracts/keyMap";
import type {
  ClassificationStatus,
  KeyLookupResult,
  SongInput,
} from "@contracts/types";
import {
  parseCsvFile,
  extractSongs,
  buildPlaylistCsv,
  buildReviewCsv,
  downloadBlob,
  groupByKey,
  downloadAllAsZip,
  type ParsedCsv,
  type SongColumns,
} from "@/lib/songs";

const CHUNK_SIZE = 12;
const STORAGE_KEY = "tonalizador-analysis-v2";

type ResultFilter =
  | "all"
  | "classified"
  | "catalogue"
  | "manual"
  | "review"
  | "not_found"
  | "error";

type SavedAnalysis = {
  version: 2;
  fileName: string;
  songs: SongInput[];
  results: KeyLookupResult[];
  duplicateCount: number;
  duplicateSongs?: Array<{ title: string; artist: string }>;
};

const STATUS_LABELS: Record<ClassificationStatus, string> = {
  classified: "Clasificada",
  review: "Revisar",
  not_found: "No encontrada",
  error: "Error temporal",
};

const REASON_LABELS: Record<string, string> = {
  spotify_id_exact: "ID de Spotify exacto",
  isrc_exact: "ISRC exacto",
  metadata_high_confidence: "Metadatos con confianza alta",
  ambiguous_catalogue_match: "Coincidencia ambigua",
  title_below_threshold: "Título poco parecido",
  artist_below_threshold: "Artista poco parecido",
  runner_up_too_close: "Hay otra coincidencia casi igual",
  version_marker_removed: "La versión podría ser distinta",
  tonal_features_missing: "Sin datos tonales",
  no_catalogue_candidate: "Sin candidato de catálogo",
  provider_temporarily_unavailable: "Proveedor temporalmente no disponible",
  spotify_not_configured: "Spotify no está configurado",
  manual_override: "Corrección manual",
};

function readSavedAnalysis(): SavedAnalysis | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as SavedAnalysis | null;
    return parsed?.version === 2 && Array.isArray(parsed.songs) && Array.isArray(parsed.results)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function orderedResults(songs: SongInput[], map: Map<string, KeyLookupResult>) {
  return songs.map((song) => map.get(song.id)).filter((result): result is KeyLookupResult => Boolean(result));
}

export default function Classifier() {
  const [savedInitial] = useState<SavedAnalysis | null>(() => readSavedAnalysis());
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [columns, setColumns] = useState<SongColumns | null>(null);
  const [songs, setSongs] = useState<SongInput[] | null>(() => savedInitial?.songs ?? null);
  const [fileName, setFileName] = useState(() => savedInitial?.fileName ?? "");
  const [results, setResults] = useState<KeyLookupResult[]>(() => savedInitial?.results ?? []);
  const [duplicateCount, setDuplicateCount] = useState(() => savedInitial?.duplicateCount ?? 0);
  const [duplicateSongs, setDuplicateSongs] = useState<Array<{ title: string; artist: string }>>(
    () => savedInitial?.duplicateSongs ?? [],
  );
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [filter, setFilter] = useState<ResultFilter>("all");
  const fileInput = useRef<HTMLInputElement>(null);

  const lookup = trpc.music.lookupBatch.useMutation();

  useEffect(() => {
    if (!songs) return;
    const saved: SavedAnalysis = {
      version: 2,
      fileName,
      songs,
      results,
      duplicateCount,
      duplicateSongs,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
  }, [duplicateCount, duplicateSongs, fileName, results, songs]);

  const noSongsMessage = (skippedArtists: number) =>
    skippedArtists > 0
      ? `Este archivo contiene ${skippedArtists} suscripciones a artistas o canales, pero ninguna canción. Exporta una playlist de canciones.`
      : "No he encontrado canciones con título y artista. Revisa las columnas o el archivo exportado.";

  const applyExtractedSongs = useCallback(
    (p: ParsedCsv, nextColumns: SongColumns) => {
      const extracted = extractSongs(p.rows, nextColumns);
      setSongs(extracted.songs);
      setDuplicateCount(extracted.duplicateCount);
      setDuplicateSongs(extracted.duplicateSongs);
      setResults([]);
      setError(extracted.songs.length ? null : noSongsMessage(extracted.skippedArtists));
    },
    [],
  );

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    try {
      const next = await parseCsvFile(file);
      setParsed(next);
      setColumns(next.columns);
      setFileName(file.name);
      if (next.columns.title && next.columns.artist) {
        applyExtractedSongs(next, next.columns);
      } else {
        setSongs(null);
        setResults([]);
      }
    } catch {
      setError("No he podido leer el archivo. Comprueba que sea un CSV válido de TuneMyMusic o Google Takeout.");
    }
  }, [applyExtractedSongs]);

  const applyColumns = (nextColumns: SongColumns) => {
    setColumns(nextColumns);
    if (parsed && nextColumns.title && nextColumns.artist && nextColumns.title !== nextColumns.artist) {
      applyExtractedSongs(parsed, nextColumns);
    }
  };

  const reset = () => {
    localStorage.removeItem(STORAGE_KEY);
    setParsed(null);
    setColumns(null);
    setSongs(null);
    setResults([]);
    setDuplicateCount(0);
    setDuplicateSongs([]);
    setProgress(null);
    setError(null);
    setFileName("");
  };

  const pendingSongs = useMemo(() => {
    if (!songs) return [];
    const resultMap = new Map(results.map((result) => [result.inputId, result]));
    return songs.filter((song) => {
      const result = resultMap.get(song.id);
      return !result || result.status === "error";
    });
  }, [results, songs]);

  const analyze = async () => {
    if (!songs || pendingSongs.length === 0) return;
    setError(null);
    setProgress({ done: 0, total: pendingSongs.length });
    const resultMap = new Map(results.map((result) => [result.inputId, result]));
    let done = 0;
    try {
      for (let index = 0; index < pendingSongs.length; index += CHUNK_SIZE) {
        const chunk = pendingSongs.slice(index, index + CHUNK_SIZE);
        const response = await lookup.mutateAsync({ songs: chunk });
        response.results.forEach((result) => resultMap.set(result.inputId, result));
        done += chunk.length;
        setResults(orderedResults(songs, resultMap));
        setProgress({ done, total: pendingSongs.length });
      }
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Error desconocido";
      setError(`El análisis se ha pausado: ${message}. Lo completado queda guardado; puedes reanudarlo.`);
    } finally {
      setProgress(null);
    }
  };

  const setTone = (song: SongInput, keyOf: (typeof KEY_OPTIONS)[number]) => {
    setError(null);
    setResults((current) =>
      current.map((result) =>
        result.inputId === song.id
          ? {
              ...result,
              status: "classified",
              keyOf,
              keySpanish: keyToSpanish(keyOf),
              camelot: keyToCamelot(keyOf),
              source: "manual",
              reasonCodes: ["manual_override"],
              cached: false,
            }
          : result,
      ),
    );
  };

  const groups = useMemo(() => groupByKey(results), [results]);
  const counts = useMemo(
    () => results.reduce(
      (summary, result) => {
        summary[result.status]++;
        if (result.source === "manual") summary.manual++;
        if (result.source === "reccobeats") summary.catalogue++;
        return summary;
      },
      { classified: 0, review: 0, not_found: 0, error: 0, manual: 0, catalogue: 0 },
    ),
    [results],
  );
  const classifiedCount = counts.classified;
  const reviewCount = counts.review;
  const notFoundCount = counts.not_found;
  const errorCount = counts.error;
  const manualCount = counts.manual;
  const analyzing = progress !== null;

  const filteredResults = useMemo(
    () => results.filter((result) => {
      if (filter === "all") return true;
      if (filter === "catalogue") return result.source === "reccobeats";
      if (filter === "manual") return result.source === "manual";
      return result.status === filter;
    }),
    [filter, results],
  );

  const songById = useMemo(
    () => new Map((songs ?? []).map((song) => [song.id, song])),
    [songs],
  );

  return (
    <div className="classifier-shell">
      {!songs && !parsed && (
        <Card className={`upload-card ${dragOver ? "is-dragging" : ""}`}>
          <div className="upload-card-heading">
            <span className="upload-step">01</span>
            <div>
              <p>Importar biblioteca</p>
              <h3>Tu playlist empieza aquí</h3>
            </div>
            <span className="local-badge"><LockKeyhole aria-hidden="true" /> Lectura local</span>
          </div>

          <button
            type="button"
            className="upload-dropzone"
            onClick={() => fileInput.current?.click()}
            onDragOver={(event) => {
              event.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void handleFile(file);
            }}
          >
            <span className="upload-icon"><Upload aria-hidden="true" /></span>
            <strong>Arrastra tu archivo CSV</strong>
            <span>o pulsa para buscarlo en tu ordenador</span>
            <small>TuneMyMusic · Google Takeout</small>
          </button>
          <input
            ref={fileInput}
            id="playlist-file"
            type="file"
            accept=".csv,.txt,text/csv"
            className="hidden"
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
              event.target.value = "";
            }}
          />

          <div className="upload-benefits" aria-label="Qué ocurre después">
            <span><Sparkles aria-hidden="true" /><strong>Identificación precisa</strong><small>Versión y artista verificados</small></span>
            <span><Gauge aria-hidden="true" /><strong>Tono y BPM</strong><small>Datos listos para mezclar</small></span>
            <span><Layers3 aria-hidden="true" /><strong>Listas ordenadas</strong><small>Un CSV por tonalidad</small></span>
          </div>
        </Card>
      )}

      {parsed && !songs && columns && (
        <Card className="mapping-card">
          <div className="state-heading">
            <span className="state-icon"><FileSpreadsheet aria-hidden="true" /></span>
            <div>
              <p>Un pequeño ajuste</p>
              <h3>Indica dónde están el título y el artista</h3>
              <span>No hemos reconocido automáticamente las columnas de <em>{fileName}</em>.</span>
            </div>
          </div>
          <div className="mapping-grid">
            <label>
              <span>Título de la canción</span>
              <Select value={columns.title ?? ""} onValueChange={(value) => applyColumns({ ...columns, title: value })}>
                <SelectTrigger aria-label="Columna del título"><SelectValue placeholder="Elegir columna" /></SelectTrigger>
                <SelectContent>
                  {parsed.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
            <label>
              <span>Artista</span>
              <Select value={columns.artist ?? ""} onValueChange={(value) => applyColumns({ ...columns, artist: value })}>
                <SelectTrigger aria-label="Columna del artista"><SelectValue placeholder="Elegir columna" /></SelectTrigger>
                <SelectContent>
                  {parsed.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
                </SelectContent>
              </Select>
            </label>
          </div>
        </Card>
      )}

      {songs && results.length === 0 && !analyzing && (
        <Card className="ready-card">
          <div className="ready-topline">
            <div className="state-heading">
              <span className="state-icon is-success"><CircleCheck aria-hidden="true" /></span>
              <div>
                <p>Archivo preparado</p>
                <h3>{songs.length} canciones listas para analizar</h3>
                <span>{fileName}{duplicateCount > 0 ? ` · ${duplicateCount} duplicadas apartadas` : ""}</span>
              </div>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 aria-hidden="true" /> Cambiar archivo
            </Button>
          </div>

          {duplicateSongs.length > 0 && (
            <details className="duplicates-panel">
              <summary>Ver {duplicateSongs.length} duplicadas detectadas</summary>
              <ul>
                {duplicateSongs.map((song, index) => (
                  <li key={`${song.artist}-${song.title}-${index}`}>{song.artist} — {song.title}</li>
                ))}
              </ul>
            </details>
          )}

          <div className="song-preview">
            <div className="song-preview-head">
              <span>Vista previa</span>
              <span>{Math.min(songs.length, 50)} de {songs.length}</span>
            </div>
            {songs.slice(0, 50).map((song, index) => (
              <div className="preview-song" key={song.id}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{song.title}</strong>
                <small>{song.artists.join(", ")}</small>
              </div>
            ))}
            {songs.length > 50 && <div className="preview-more">y {songs.length - 50} canciones más</div>}
          </div>

          <div className="privacy-strip">
            <ShieldCheck aria-hidden="true" />
            <p><strong>Tu archivo no sale del navegador.</strong> Solo enviamos los metadatos musicales necesarios para identificar cada tema.</p>
          </div>
          <div className="ready-actions">
            <Button size="lg" onClick={() => void analyze()}>
              <Sparkles aria-hidden="true" />
              Analizar {songs.length} canciones
            </Button>
            <span>Podrás cerrar o recargar sin perder el progreso.</span>
          </div>
        </Card>
      )}

      {analyzing && progress && (
        <Card className="analysis-card" aria-live="polite">
          <div className="analysis-heading">
            <span className="analysis-orb"><Music aria-hidden="true" /></span>
            <div>
              <p>Análisis en curso</p>
              <h3>Escuchando los datos de tu biblioteca</h3>
            </div>
            <strong>{Math.round((progress.done / progress.total) * 100)}%</strong>
          </div>
          <Progress
            value={(progress.done / progress.total) * 100}
            aria-label={`Progreso: ${progress.done} de ${progress.total}`}
          />
          <div className="analysis-meta">
            <span>{progress.done} completadas</span>
            <span>{progress.total - progress.done} pendientes</span>
          </div>
          <p className="analysis-note">Guardamos cada canción por separado para que puedas reanudar en cualquier momento.</p>
        </Card>
      )}

      {error && (
        <div role="alert" className="error-banner">
          <span><AlertTriangle aria-hidden="true" /></span>
          <div><strong>Necesitamos tu atención</strong><p>{error}</p></div>
        </div>
      )}

      {results.length > 0 && (
        <>
          <Card className="results-overview">
            <div className="results-heading">
              <div className="state-heading">
                <span className="state-icon is-success"><CheckCircle2 aria-hidden="true" /></span>
                <div>
                  <p>Análisis completado</p>
                  <h3>Tu biblioteca ya está ordenada</h3>
                  <span>{classifiedCount} clasificadas · {reviewCount + notFoundCount} requieren una mirada</span>
                </div>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trash2 aria-hidden="true" /> Nuevo archivo
              </Button>
            </div>

            <div className="result-metrics">
              <div><span>Clasificadas</span><strong>{classifiedCount}</strong><small>listas para exportar</small></div>
              <div><span>Con confianza alta</span><strong>{classifiedCount - manualCount}</strong><small>desde catálogo</small></div>
              <div><span>Revisión</span><strong>{reviewCount + notFoundCount}</strong><small>casos pendientes</small></div>
              <div><span>Grupos</span><strong>{groups.size}</strong><small>tonalidades distintas</small></div>
            </div>

            <div className="results-actions">
              <Button size="lg" onClick={() => void downloadAllAsZip(groups, results)} disabled={groups.size === 0}>
                <FolderDown aria-hidden="true" /> Descargar todo en ZIP
              </Button>
              {pendingSongs.length > 0 && !analyzing && (
                <Button variant="outline" onClick={() => void analyze()}>
                  <RotateCcw aria-hidden="true" /> Reanudar {pendingSongs.length}
                </Button>
              )}
              {(reviewCount + notFoundCount + errorCount) > 0 && (
                <Button variant="outline" onClick={() => downloadBlob("revisar.csv", buildReviewCsv(results))}>
                  <Download aria-hidden="true" /> Lista para revisar
                </Button>
              )}
            </div>
          </Card>

          <Card className="review-card">
            <div className="review-header">
              <div>
                <p><ListFilter aria-hidden="true" /> Revisión detallada</p>
                <h3>Canción por canción</h3>
              </div>
              <span>{filteredResults.length} resultados</span>
            </div>
            <div className="filter-row" role="group" aria-label="Filtrar resultados">
              {([
                ["all", "Todas", results.length],
                ["classified", "Clasificadas", classifiedCount],
                ["catalogue", "Catálogo", counts.catalogue],
                ["manual", "Manuales", manualCount],
                ["review", "Dudosas", reviewCount],
                ["not_found", "No encontradas", notFoundCount],
                ["error", "Errores", errorCount],
              ] as Array<[ResultFilter, string, number]>).map(([value, label, count]) => (
                <button
                  key={value}
                  type="button"
                  aria-pressed={filter === value}
                  onClick={() => setFilter(value)}
                  className={filter === value ? "is-active" : ""}
                >
                  {label}<span>{count}</span>
                </button>
              ))}
            </div>

            <div className="results-table-wrap">
              <table className="results-table">
                <thead>
                  <tr>
                    <th scope="col">Canción original</th>
                    <th scope="col">Coincidencia</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Tonalidad</th>
                    <th scope="col">Corregir</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResults.map((result) => {
                    const song = songById.get(result.inputId);
                    const reasons = result.reasonCodes.map((reason) => REASON_LABELS[reason] ?? reason);
                    return (
                      <tr key={result.inputId}>
                        <td>
                          <strong>{result.title}</strong>
                          <small>{result.artists.join(", ")}</small>
                        </td>
                        <td>
                          {result.matchedTrack ? (
                            <>
                              <strong>{result.matchedTrack.title}</strong>
                              <small>{result.matchedTrack.artists.join(", ")}</small>
                              {result.confidence !== null && <em>{Math.round(result.confidence * 100)}% de confianza</em>}
                            </>
                          ) : <span className="empty-value">Sin coincidencia</span>}
                        </td>
                        <td>
                          <span className={`status-pill is-${result.status}`}>{STATUS_LABELS[result.status]}</span>
                          <small>{reasons.join(" · ")}</small>
                        </td>
                        <td>
                          <strong className="tone-value">{result.keySpanish ?? "—"}</strong>
                          <small>
                            {[result.camelot, result.bpm ? `${result.bpm} BPM` : null, result.source === "manual" ? "manual" : result.source === "reccobeats" ? "catálogo" : null]
                              .filter(Boolean).join(" · ")}
                          </small>
                        </td>
                        <td>
                          {song && (
                            <Select
                              value={result.keyOf ?? ""}
                              onValueChange={(value) => setTone(song, value as (typeof KEY_OPTIONS)[number])}
                            >
                              <SelectTrigger aria-label={`Corregir tonalidad de ${result.title}`}>
                                <SelectValue placeholder="Elegir tono" />
                              </SelectTrigger>
                              <SelectContent>
                                {KEY_OPTIONS.map((key) => (
                                  <SelectItem key={key} value={key}>{keyToSpanish(key)} · {key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          <section className="tone-groups" aria-labelledby="tone-groups-title">
            <div className="tone-groups-heading">
              <div>
                <p>Playlists generadas</p>
                <h3 id="tone-groups-title">Descarga por tonalidad</h3>
              </div>
              <span>{groups.size} colecciones</span>
            </div>
            <div className="tone-groups-grid">
              {[...groups.entries()].map(([key, list], index) => (
                <Card key={key} className="tone-card">
                  <span className="tone-index">{String(index + 1).padStart(2, "0")}</span>
                  <div><strong>{key}</strong><small>{list.length} canciones · {list[0].camelot}</small></div>
                  <Button variant="outline" size="sm" onClick={() => downloadBlob(`${key}.csv`, buildPlaylistCsv(list))}>
                    <Download aria-hidden="true" /> CSV
                  </Button>
                </Card>
              ))}
            </div>
          </section>

          {(reviewCount + notFoundCount) > 0 && (
            <Card className="manual-review-card">
              <span className="manual-review-icon"><AlertTriangle aria-hidden="true" /></span>
              <div>
                <p>Revisión manual</p>
                <h3>Solo quedan los casos menos claros</h3>
                <span>Preferimos dejar una canción pendiente antes que asignarla a una versión equivocada.</span>
              </div>
              <Button asChild variant="outline">
                <a href="https://tunebat.com/Analyzer" target="_blank" rel="noopener noreferrer">
                  Abrir Tunebat <ExternalLink aria-hidden="true" />
                </a>
              </Button>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
