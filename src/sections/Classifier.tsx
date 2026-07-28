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
  ExternalLink,
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
    <div className="space-y-5">
      {!songs && !parsed && (
        <Card
          className={`rounded-2xl border-2 border-dashed transition-colors ${
            dragOver ? "border-[#1c1c1e] bg-[#f2f2f7]" : "border-[#d1d1d6] hover:bg-[#fafafa]"
          }`}
        >
          <button
            type="button"
            className="block cursor-pointer rounded-2xl p-8 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1e] focus-visible:ring-offset-2"
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
            <Upload className="mx-auto mb-3 h-9 w-9 text-[#6e6e73]" aria-hidden="true" />
            <span className="block text-[15px] font-medium">Arrastra aquí tu archivo CSV</span>
            <span className="mt-1 block text-sm text-[#6e6e73]">
              o pulsa para elegirlo · TuneMyMusic o Google Takeout
            </span>
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
        </Card>
      )}

      {parsed && !songs && columns && (
        <Card className="rounded-2xl border-[#e5e5ea] p-5 shadow-sm">
          <h2 className="text-[15px] font-semibold">¿Qué columnas debo usar?</h2>
          <p className="mb-4 mt-1 text-sm text-[#3a3a3c]">
            No he reconocido automáticamente el título y el artista de <em>{fileName}</em>.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Select
              value={columns.title ?? ""}
              onValueChange={(value) => applyColumns({ ...columns, title: value })}
            >
              <SelectTrigger aria-label="Columna del título"><SelectValue placeholder="Columna del título" /></SelectTrigger>
              <SelectContent>
                {parsed.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select
              value={columns.artist ?? ""}
              onValueChange={(value) => applyColumns({ ...columns, artist: value })}
            >
              <SelectTrigger aria-label="Columna del artista"><SelectValue placeholder="Columna del artista" /></SelectTrigger>
              <SelectContent>
                {parsed.headers.map((header) => <SelectItem key={header} value={header}>{header}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {songs && results.length === 0 && !analyzing && (
        <Card className="rounded-2xl border-[#e5e5ea] p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                <Music className="h-5 w-5" aria-hidden="true" /> {songs.length} canciones listas
              </h2>
              <p className="mt-1 text-sm text-[#6e6e73]">
                {fileName}{duplicateCount > 0 ? ` · ${duplicateCount} duplicadas apartadas` : ""}
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={reset}>
              <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Cambiar
            </Button>
          </div>
          {duplicateSongs.length > 0 && (
            <details className="mt-3 rounded-xl bg-[#fff9e6] p-3 text-sm">
              <summary className="cursor-pointer font-medium">Ver duplicadas detectadas</summary>
              <ul className="mt-2 max-h-28 overflow-y-auto">
                {duplicateSongs.map((song, index) => (
                  <li key={`${song.artist}-${song.title}-${index}`}>{song.artist} — {song.title}</li>
                ))}
              </ul>
            </details>
          )}
          <div className="mt-3 max-h-36 overflow-y-auto rounded-xl bg-[#f5f5f7] p-3 text-sm">
            {songs.slice(0, 50).map((song) => (
              <div key={song.id} className="truncate">{song.artists.join(", ")} — {song.title}</div>
            ))}
            {songs.length > 50 && <div className="mt-1 text-[#8e8e93]">…y {songs.length - 50} más</div>}
          </div>
          <div className="mt-3 flex items-start gap-2 rounded-xl bg-[#eef7ff] p-3 text-xs text-[#315b7d]">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>El CSV se lee en este navegador. Solo se envían metadatos musicales para identificar cada canción; nunca se sube el archivo completo.</p>
          </div>
          <Button onClick={() => void analyze()} className="mt-4 w-full sm:w-auto">
            Analizar {songs.length} canciones
          </Button>
        </Card>
      )}

      {analyzing && progress && (
        <Card className="rounded-2xl border-[#e5e5ea] p-5 shadow-sm" aria-live="polite">
          <p className="mb-2 text-sm font-medium">Analizando… {progress.done} de {progress.total}</p>
          <Progress value={(progress.done / progress.total) * 100} aria-label={`Progreso: ${progress.done} de ${progress.total}`} />
          <p className="mt-2 text-xs text-[#8e8e93]">Cada canción se guarda por separado. Si se interrumpe, podrás reanudar.</p>
        </Card>
      )}

      {error && (
        <div role="alert" className="flex gap-2 rounded-r-xl border-l-4 border-[#ff3b30] bg-[#fff0f0] p-4 text-sm text-[#8a1f1a]">
          <AlertTriangle className="h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {results.length > 0 && (
        <>
          <Card className="rounded-2xl border-[#e5e5ea] p-5 shadow-sm">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
              <div>
                <h2 className="flex items-center gap-2 text-[15px] font-semibold">
                  <CheckCircle2 className="h-5 w-5 text-[#34c759]" aria-hidden="true" />
                  {classifiedCount} clasificadas · {reviewCount + notFoundCount} por revisar
                </h2>
                <p className="mt-1 text-sm text-[#6e6e73]">
                  Catálogo con confianza alta: {classifiedCount - manualCount} · Manuales: {manualCount} · Errores: {errorCount}
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={reset}>
                <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" /> Nuevo archivo
              </Button>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void downloadAllAsZip(groups, results)} disabled={groups.size === 0}>
                <FolderDown className="mr-2 h-4 w-4" aria-hidden="true" /> Descargar ZIP
              </Button>
              {pendingSongs.length > 0 && !analyzing && (
                <Button variant="outline" onClick={() => void analyze()}>
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Reanudar {pendingSongs.length}
                </Button>
              )}
              {(reviewCount + notFoundCount + errorCount) > 0 && (
                <Button
                  variant="outline"
                  onClick={() => downloadBlob("revisar.csv", buildReviewCsv(results))}
                >
                  <Download className="mr-2 h-4 w-4" aria-hidden="true" /> Lista para revisar
                </Button>
              )}
            </div>
          </Card>

          <Card className="overflow-hidden rounded-2xl border-[#e5e5ea] shadow-sm">
            <div className="border-b border-[#e5e5ea] p-4">
              <h2 className="font-semibold">Revisión canción por canción</h2>
              <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filtrar resultados">
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
                    className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                      filter === value
                        ? "border-[#1c1c1e] bg-[#1c1c1e] text-white"
                        : "border-[#d1d1d6] bg-white text-[#3a3a3c] hover:bg-[#f5f5f7]"
                    }`}
                  >
                    {label} {count}
                  </button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-sm">
                <thead className="bg-[#f5f5f7] text-xs text-[#6e6e73]">
                  <tr>
                    <th scope="col" className="px-4 py-3 font-medium">Canción original</th>
                    <th scope="col" className="px-4 py-3 font-medium">Coincidencia</th>
                    <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                    <th scope="col" className="px-4 py-3 font-medium">Tonalidad</th>
                    <th scope="col" className="px-4 py-3 font-medium">Corregir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#e5e5ea]">
                  {filteredResults.map((result) => {
                    const song = songById.get(result.inputId);
                    const reasons = result.reasonCodes.map((reason) => REASON_LABELS[reason] ?? reason);
                    return (
                      <tr key={result.inputId} className="align-top">
                        <td className="max-w-[220px] px-4 py-3">
                          <p className="font-medium">{result.title}</p>
                          <p className="truncate text-xs text-[#6e6e73]">{result.artists.join(", ")}</p>
                        </td>
                        <td className="max-w-[230px] px-4 py-3">
                          {result.matchedTrack ? (
                            <>
                              <p>{result.matchedTrack.title}</p>
                              <p className="truncate text-xs text-[#6e6e73]">{result.matchedTrack.artists.join(", ")}</p>
                              {result.confidence !== null && (
                                <p className="mt-1 text-xs text-[#8e8e93]">Confianza de coincidencia: {Math.round(result.confidence * 100)} %</p>
                              )}
                            </>
                          ) : <span className="text-[#8e8e93]">Sin coincidencia</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            result.status === "classified"
                              ? "bg-[#e8f5e9] text-[#1b5e20]"
                              : result.status === "error"
                                ? "bg-[#fff0f0] text-[#8a1f1a]"
                                : "bg-[#fff9e6] text-[#5c4b00]"
                          }`}>
                            {STATUS_LABELS[result.status]}
                          </span>
                          <p className="mt-1 max-w-[190px] text-xs text-[#8e8e93]">{reasons.join(" · ")}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-medium">{result.keySpanish ?? "—"}</p>
                          <p className="text-xs text-[#6e6e73]">
                            {[result.camelot, result.bpm ? `${result.bpm} BPM` : null, result.source === "manual" ? "manual" : result.source === "reccobeats" ? "catálogo" : null]
                              .filter(Boolean).join(" · ")}
                          </p>
                        </td>
                        <td className="w-[180px] px-4 py-3">
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
                                  <SelectItem key={key} value={key}>
                                    {keyToSpanish(key)} · {key}
                                  </SelectItem>
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[...groups.entries()].map(([key, list]) => (
              <Card key={key} className="flex items-center justify-between gap-3 rounded-2xl border-[#e5e5ea] p-4 shadow-sm">
                <div>
                  <p className="font-semibold">{key}</p>
                  <p className="text-xs text-[#6e6e73]">{list.length} canciones · {list[0].camelot}</p>
                </div>
                <Button variant="outline" size="sm" onClick={() => downloadBlob(`${key}.csv`, buildPlaylistCsv(list))}>
                  <Download className="mr-1 h-4 w-4" aria-hidden="true" /> CSV
                </Button>
              </Card>
            ))}
          </div>

          {(reviewCount + notFoundCount) > 0 && (
            <Card className="rounded-2xl border-[#ffcc00] bg-[#fff9e6] p-5 shadow-sm">
              <h2 className="font-semibold text-[#5c4b00]">Revisión manual pendiente</h2>
              <p className="mt-1 text-sm text-[#5c4b00]">
                La herramienta prefiere dejar una canción pendiente antes que asignarla a una versión equivocada. Puedes elegir su tonalidad en la tabla.
              </p>
              <a
                href="https://tunebat.com/Analyzer"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex items-center gap-1 text-sm font-medium underline underline-offset-4"
              >
                Abrir Tunebat Analyzer <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
