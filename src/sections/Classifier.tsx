import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type RefObject,
} from "react";
import {
  AlertCircle,
  ArrowRight,
  AudioLines,
  BadgeCheck,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  Database,
  Download,
  ExternalLink,
  FileAudio,
  FileCheck2,
  FileInput,
  FileOutput,
  FolderDown,
  Info,
  ListFilter,
  ListMusic,
  LoaderCircle,
  LockKeyhole,
  Music2,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  WandSparkles,
  X,
} from "lucide-react";
import { trpc } from "@/providers/trpc-client";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import {
  getInitialChapter,
  parseSavedAnalysis,
  type SavedAnalysis,
} from "@/lib/session";
import {
  analysisRequestErrorMessage,
  incompleteAnalysisMessage,
} from "@/lib/analysisErrors";
import { keepFocusInside } from "@/lib/focus";
import type { Chapter } from "@/sections/Guide";

const Guide = lazy(() => import("@/sections/Guide"));

const CHUNK_SIZE = 12;
const STORAGE_KEY = "tonalizador-analysis-v2";
const PROVIDER_PAUSE_KEY = "tonalizador-provider-pause-until-v2";
const PROVIDER_RETRY_DELAY_MS = 23_501 * 1000;
const TUNEMY_MUSIC_EXPORT_URL =
  "https://www.tunemymusic.com/transfer/youtube-music-to-file";
const TUNEMY_MUSIC_IMPORT_URL =
  "https://www.tunemymusic.com/transfer/file-to-youtube-music";

type ReviewFilter = "needs_attention" | "all" | "manual";
type DeliveryState = "ready" | "downloaded" | "finished";
type SourceMode = "playlist" | "audio";

function readProviderPauseUntil(): number | null {
  try {
    const value = Number(localStorage.getItem(PROVIDER_PAUSE_KEY));
    return Number.isFinite(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

function retryWaitLabel(seconds: number): string {
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.ceil((seconds % 3_600) / 60);
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${Math.max(1, minutes)} min`;
}
type AcousticJob = {
  state: "analyzing" | "complete" | "error";
  progress: number;
  error?: string;
  algorithm?: string;
  analyzedSeconds?: number;
  segments?: number;
  windows?: Array<{
    startSeconds: number;
    endSeconds: number;
    keySpanish: string;
    confidence: number;
  }>;
};
type AcousticJobs = Record<string, AcousticJob>;

type ResultCounts = {
  classified: number;
  review: number;
  not_found: number;
  error: number;
  manual: number;
  catalogue: number;
};

function createLocalSong(file: File): SongInput {
  const title =
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/_/g, " ")
      .trim() || "Canción del dispositivo";
  const uniquePart =
    typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${file.size}`;

  return {
    id: `audio-${uniquePart}`,
    title,
    artists: ["Archivo de audio local"],
    position: 0,
  };
}

function columnExample(
  parsed: ParsedCsv,
  column: string | null
): string | null {
  if (!column) return null;
  for (const row of parsed.rows) {
    const value = row[column]?.trim();
    if (value) return value;
  }
  return null;
}

function columnMappingWarning(
  parsed: ParsedCsv,
  columns: SongColumns
): string | null {
  if (!columns.title || !columns.artist) return null;
  if (columns.title === columns.artist) {
    return "La canción y el artista no pueden estar en la misma columna. Elige una columna distinta en cada menú.";
  }

  const titleHeader = columns.title.toLocaleLowerCase("es");
  const artistHeader = columns.artist.toLocaleLowerCase("es");
  if (/playlist|lista de reproducción/.test(titleHeader)) {
    return `«${columns.title}» contiene el nombre de la playlist, no el título de cada canción. En el primer menú busca una columna como «Track name», «Song» o «Title».`;
  }
  if (/url|uri|enlace|link/.test(titleHeader)) {
    return `«${columns.title}» parece contener enlaces. En el primer menú elige la columna que muestra los títulos de las canciones.`;
  }
  if (/artist|artista|performer/.test(titleHeader)) {
    return `«${columns.title}» parece ser una columna de artistas. En el primer menú elige la columna con los títulos de las canciones.`;
  }
  if (/playlist|lista de reproducción/.test(artistHeader)) {
    return `«${columns.artist}» contiene el nombre de la playlist. En el segundo menú busca una columna como «Artist name» o «Artist».`;
  }
  if (/url|uri|enlace|link/.test(artistHeader)) {
    return `«${columns.artist}» parece contener enlaces. En el segundo menú elige la columna con el cantante o grupo.`;
  }

  const titleValues = parsed.rows
    .map(row => row[columns.title!]?.trim())
    .filter(Boolean);
  if (
    titleValues.length >= 3 &&
    new Set(titleValues.map(value => value.toLocaleLowerCase("es"))).size === 1
  ) {
    return `Todos los valores de «${columns.title}» son iguales. Probablemente esa no sea la columna de canciones: busca una que muestre un título diferente en cada fila.`;
  }
  return null;
}

const STATUS_LABELS: Record<ClassificationStatus, string> = {
  classified: "Lista",
  review: "Confirma esta",
  not_found: "No la encontramos",
  error: "Lo intentamos luego",
};

const REASON_LABELS: Record<string, string> = {
  spotify_id_exact: "Coincidencia exacta",
  isrc_exact: "Coincidencia exacta",
  metadata_exact_title_artist:
    "El título y el artista principal coinciden exactamente",
  metadata_remaster_equivalent:
    "La única diferencia es que el catálogo identifica una remasterización",
  metadata_high_confidence: "Título y artista coinciden",
  ambiguous_catalogue_match: "Hay más de una versión posible",
  title_below_threshold: "El título es algo distinto",
  artist_below_threshold: "El artista es algo distinto",
  runner_up_too_close: "Encontramos dos versiones parecidas",
  version_marker_removed: "Puede ser otra versión",
  tonal_features_missing: "Falta información de esta canción",
  no_catalogue_candidate: "No aparece en nuestra búsqueda",
  provider_temporarily_unavailable: "La búsqueda no respondió esta vez",
  provider_rate_limited: "Spotify ha respondido QUOTA_EXCEEDED",
  reccobeats_fallback_no_exact_match:
    "ReccoBeats no pudo confirmar esa grabación exacta",
  reccobeats_fallback_unavailable:
    "ReccoBeats no respondió en el intento alternativo",
  spotify_not_configured: "La búsqueda no está disponible ahora",
  catalogue_fallback_exact_match: "ReccoBeats confirmó exactamente la canción",
  spotify_audio_features_forbidden: "Spotify identificó la canción",
  spotify_audio_features_circuit_open: "Spotify identificó la canción",
  spotify_audio_features_unauthorized: "Spotify identificó la canción",
  spotify_audio_features_not_found:
    "Spotify no dispone de datos tonales para esta grabación",
  spotify_audio_features_invalid: "Spotify no devolvió key y mode válidos",
  spotify_audio_features_unavailable:
    "Spotify Audio Features no respondió esta vez",
  reccobeats_direct_id_match:
    "ReccoBeats encontró exactamente el mismo identificador",
  reccobeats_direct_id_not_found:
    "ReccoBeats no encontró ese identificador y buscó después por metadatos",
  reccobeats_direct_id_unavailable:
    "La consulta directa a ReccoBeats no respondió",
  reccobeats_direct_features_missing:
    "La ficha directa de ReccoBeats no tenía una tonalidad válida",
  reccobeats_direct_features_unavailable:
    "Los datos tonales directos de ReccoBeats no respondieron",
  reccobeats_search_exact_spotify_id:
    "La búsqueda de ReccoBeats confirmó el mismo identificador de Spotify",
  reccobeats_search_exact_isrc:
    "La búsqueda de ReccoBeats confirmó el mismo ISRC",
  reccobeats_search_exact_metadata:
    "La búsqueda de ReccoBeats confirmó título, artista y duración",
  reccobeats_search_no_exact_match:
    "ReccoBeats no encontró una grabación inequívoca",
  reccobeats_search_features_missing:
    "La coincidencia de ReccoBeats no tenía key y mode válidos",
  reccobeats_search_unavailable:
    "La búsqueda alternativa de ReccoBeats no respondió",
  reccobeats_not_found: "ReccoBeats no dispone de datos para esta grabación",
  reccobeats_invalid: "ReccoBeats no devolvió key y mode válidos",
  reccobeats_unavailable: "ReccoBeats no respondió esta vez",
  tonal_source_spotify_audio_features:
    "La tonalidad procede de Spotify Audio Features",
  tonal_source_reccobeats: "Tonalidad obtenida de ReccoBeats",
  invalid_cached_classification:
    "La caché antigua no contenía una tonalidad válida y se ha descartado",
  invalid_classification_not_cached:
    "El resultado incompleto no se ha guardado como clasificado",
  manual_override: "Tonalidad añadida por ti",
  local_acoustic_analysis: "Calculada a partir del audio elegido por ti",
  acoustic_low_confidence: "El audio no ha dado un resultado concluyente",
};

const SOURCE_LABELS: Record<string, string> = {
  spotify_audio_features: "Spotify Audio Features",
  reccobeats: "ReccoBeats",
  local_acoustic: "Análisis acústico local",
  manual: "Corrección manual",
};

function getTonalConfidence(result: KeyLookupResult): number | null {
  return result.tonalConfidence ?? null;
}

function needsAcousticAnalysis(result: KeyLookupResult): boolean {
  const tonalConfidence = getTonalConfidence(result);
  return (
    !result.keyOf ||
    result.status !== "classified" ||
    (tonalConfidence !== null && tonalConfidence < 0.68)
  );
}

function describeResultSource(result: KeyLookupResult): string {
  const source = result.source ? SOURCE_LABELS[result.source] : null;
  if (result.cached && source) return `Caché válida · ${source}`;
  if (result.cached) return "Caché válida";
  return source ?? "Todavía sin fuente tonal";
}

function describeResultProcess(result: KeyLookupResult): string {
  if (result.source === "local_acoustic") {
    return "Calculada en este navegador con el archivo de audio elegido. El audio no se ha subido.";
  }
  if (result.source === "spotify_audio_features") {
    return "Spotify identificó la grabación y proporcionó sus datos tonales.";
  }
  if (result.source === "reccobeats") {
    if (result.reasonCodes.includes("catalogue_fallback_exact_match")) {
      return "Spotify pidió una pausa. ReccoBeats identificó exactamente la canción por sus datos y obtuvo la tonalidad.";
    }
    return "Spotify identificó la canción. Tonalidad obtenida de ReccoBeats.";
  }
  if (result.source === "manual") {
    return "Esta tonalidad es una corrección explícita, no un resultado automático.";
  }
  if (result.reasonCodes.includes("reccobeats_fallback_no_exact_match")) {
    return "Spotify respondió QUOTA_EXCEEDED. ReccoBeats sí se consultó, pero no pudo confirmar esta grabación exacta.";
  }
  if (result.reasonCodes.includes("reccobeats_fallback_unavailable")) {
    return "Spotify respondió QUOTA_EXCEEDED y ReccoBeats no respondió en el intento alternativo.";
  }
  return "La búsqueda automática no obtuvo una tonalidad suficientemente fiable.";
}

function visibleResultReasons(
  result: KeyLookupResult,
  fallback: string
): string[] {
  return result.reasonCodes
    .filter(reason => {
      if (result.source !== "reccobeats") return true;
      return (
        !reason.startsWith("spotify_audio_features_") &&
        !reason.startsWith("reccobeats_") &&
        reason !== "tonal_source_reccobeats"
      );
    })
    .map(reason => REASON_LABELS[reason] ?? fallback);
}

const NAV_ITEMS: Array<{
  id: Chapter;
  label: string;
  description: string;
  icon: typeof FileOutput;
}> = [
  {
    id: "export",
    label: "Importar",
    description: "Trae tus canciones",
    icon: FileOutput,
  },
  {
    id: "analyze",
    label: "Analizar",
    description: "Las ordenamos",
    icon: AudioLines,
  },
  {
    id: "download",
    label: "Descargar",
    description: "Recoge tus listas",
    icon: Download,
  },
];

const TONE_COLORS = ["#8b5cf6", "#3b82f6", "#22c55e", "#ec4899", "#f59e0b"];

function readSavedAnalysis(): SavedAnalysis | null {
  try {
    return parseSavedAnalysis(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

function orderedResults(songs: SongInput[], map: Map<string, KeyLookupResult>) {
  return songs
    .map(song => map.get(song.id))
    .filter((result): result is KeyLookupResult => Boolean(result));
}

function AppLogo({ onHome }: { onHome: () => void }) {
  return (
    <button
      type="button"
      className="app-brand"
      aria-label="Volver a la portada"
      onClick={onHome}
    >
      <span className="app-brand-mark" aria-hidden="true">
        <AudioLines />
      </span>
      <span className="app-brand-copy">
        <strong>
          tonalizador<span>.</span>
        </strong>
        <small>para Estrella</small>
      </span>
    </button>
  );
}

function HomeHero({
  chapter,
  onSelect,
}: {
  chapter: Chapter;
  onSelect: (chapter: Chapter) => void;
}) {
  return (
    <main className="home-screen">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="ambient-grid" aria-hidden="true" />

      <a
        className="home-tutorial-link"
        href="/tutorial/"
        target="_blank"
        rel="noopener"
      >
        <BookOpen aria-hidden="true" />
        Tutorial
        <ExternalLink aria-hidden="true" />
      </a>

      <section className="home-artwork" aria-labelledby="home-title">
        <h1 id="home-title" className="sr-only">
          Tonalizador. Tu música, ordenada por tonalidad.
        </h1>
        <picture>
          <source
            media="(min-width: 621px)"
            srcSet="/cover.webp"
            type="image/webp"
          />
          <img
            src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
            alt="Tonalizador. Tu música, ordenada por tonalidad."
            width="1734"
            height="907"
            loading="eager"
            fetchPriority="high"
          />
        </picture>
        <nav className="home-step-nav" aria-label="Pasos principales">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              type="button"
              className={[
                "home-step-button",
                `is-${item.id}`,
                chapter === item.id ? "is-active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-label={`Ir a ${item.label}`}
              aria-current={chapter === item.id ? "step" : undefined}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </nav>

        <div className="home-mobile-hero">
          <div className="home-mobile-brand" aria-hidden="true">
            <span>
              <AudioLines />
            </span>
            <strong>
              tonalizador<i>.</i>
            </strong>
          </div>

          <div className="home-mobile-copy" aria-hidden="true">
            <p>Tu música,</p>
            <strong>ordenada por tonalidad.</strong>
          </div>

          <nav className="home-mobile-step-nav" aria-label="Pasos principales">
            {NAV_ITEMS.map(item => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    "home-mobile-step",
                    `is-${item.id}`,
                    chapter === item.id ? "is-active" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  aria-label={`Ir a ${item.label}`}
                  aria-current={chapter === item.id ? "step" : undefined}
                  onClick={() => onSelect(item.id)}
                >
                  <span aria-hidden="true">
                    <Icon />
                  </span>
                  <strong>{item.label}</strong>
                </button>
              );
            })}
          </nav>

          <p className="home-mobile-hint">
            Elige un paso para empezar
            <ArrowRight aria-hidden="true" />
          </p>
        </div>
      </section>
    </main>
  );
}

function WorkspaceHeader({
  chapter,
  hasSongs,
  analysisComplete,
  analyzing,
  deliveryState,
  saveWarning,
  onSelect,
  onHome,
  onHelp,
}: {
  chapter: Chapter;
  hasSongs: boolean;
  analysisComplete: boolean;
  analyzing: boolean;
  deliveryState: DeliveryState;
  saveWarning: boolean;
  onSelect: (chapter: Chapter) => void;
  onHome: () => void;
  onHelp: () => void;
}) {
  return (
    <header className="workspace-header">
      <AppLogo onHome={onHome} />

      <nav className="header-step-nav" aria-label="Pasos principales">
        {NAV_ITEMS.map((item, index) => {
          const Icon = item.icon;
          const complete =
            item.id === "export"
              ? hasSongs
              : item.id === "analyze"
                ? analysisComplete
                : deliveryState === "finished";
          const inProgress = item.id === "analyze" && analyzing;

          return (
            <button
              key={item.id}
              type="button"
              className={[
                "header-step-button",
                chapter === item.id ? "is-active" : "",
                complete ? "is-complete" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              aria-current={chapter === item.id ? "step" : undefined}
              aria-label={`${item.label}${complete ? ", completado" : ""}`}
              onClick={() => onSelect(item.id)}
            >
              <span className="header-step-icon" aria-hidden="true">
                {complete ? (
                  <Check />
                ) : inProgress ? (
                  <LoaderCircle className="is-spinning" />
                ) : (
                  <Icon />
                )}
              </span>
              <span className="header-step-copy">
                <strong>{item.label}</strong>
                <small>
                  {String(index + 1).padStart(2, "0")} · {item.description}
                </small>
              </span>
            </button>
          );
        })}
      </nav>

      <div className="workspace-header-actions">
        <span className={`save-status ${saveWarning ? "is-warning" : ""}`}>
          {saveWarning ? (
            <AlertCircle aria-hidden="true" />
          ) : analyzing ? (
            <LoaderCircle className="is-spinning" aria-hidden="true" />
          ) : (
            <Check aria-hidden="true" />
          )}
          {saveWarning
            ? "Sin guardado automático"
            : analyzing
              ? "Procesando y guardando"
              : "Se guarda automáticamente"}
        </span>
        <button type="button" className="help-button" onClick={onHelp}>
          <CircleHelp aria-hidden="true" />
          Ayuda
        </button>
      </div>
    </header>
  );
}

function ExportChapter({
  onChooseCsv,
  onChooseAudio,
}: {
  onChooseCsv: () => void;
  onChooseAudio: () => void;
}) {
  return (
    <section
      className="chapter-stage export-stage"
      aria-labelledby="export-title"
    >
      <div className="stage-copy">
        <p className="stage-kicker">
          <Sparkles aria-hidden="true" />
          Empezamos por aquí
        </p>
        <h2 id="export-title">Vamos a buscar tus canciones.</h2>
        <p className="stage-description">
          Primero crea un archivo CSV con tu playlist de YouTube Music. Te
          llevamos al sitio que lo prepara.
        </p>

        <div className="stage-actions">
          <Button size="lg" asChild>
            <a
              href={TUNEMY_MUSIC_EXPORT_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir TuneMyMusic
              <ExternalLink aria-hidden="true" />
            </a>
          </Button>
          <button type="button" className="text-action" onClick={onChooseCsv}>
            Ya tengo el archivo CSV
            <ArrowRight aria-hidden="true" />
          </button>
        </div>

        <button
          type="button"
          className="direct-audio-action"
          onClick={onChooseAudio}
        >
          <span className="direct-audio-icon" aria-hidden="true">
            <FileAudio />
          </span>
          <span>
            <strong>Analizar una canción de mi dispositivo</strong>
            <small>
              Elige un MP3, M4A, WAV, FLAC, OGG o AAC. No necesitas un CSV.
            </small>
          </span>
          <ArrowRight aria-hidden="true" />
        </button>

        <div className="calm-note">
          <ShieldCheck aria-hidden="true" />
          <span>
            <strong>No necesitas configurar nada.</strong>
            TuneMyMusic te guiará para guardar la playlist como archivo CSV.
          </span>
        </div>
      </div>

      <div
        className="export-visual"
        aria-label="Del servicio de música a Tonalizador"
      >
        <div className="visual-halo" aria-hidden="true" />
        <div className="journey-card">
          <div className="journey-card-top">
            <span>Tu playlist</span>
            <small>3 movimientos</small>
          </div>

          <div className="journey-flow">
            <div className="journey-node">
              <span className="journey-node-icon is-pink">
                <Music2 aria-hidden="true" />
              </span>
              <div>
                <strong>YouTube Music</strong>
                <small>Tus canciones</small>
              </div>
              <span className="journey-state">
                <Check />
              </span>
            </div>
            <span className="journey-line" aria-hidden="true">
              <i />
            </span>
            <div className="journey-node is-current">
              <span className="journey-node-icon is-blue">
                <FileOutput aria-hidden="true" />
              </span>
              <div>
                <strong>Un archivo CSV</strong>
                <small>Fácil de traer</small>
              </div>
              <span className="journey-number">01</span>
            </div>
            <span className="journey-line is-muted" aria-hidden="true">
              <i />
            </span>
            <div className="journey-node is-muted">
              <span className="journey-node-icon is-purple">
                <WandSparkles aria-hidden="true" />
              </span>
              <div>
                <strong>Tonalizador</strong>
                <small>Nos ocupamos del resto</small>
              </div>
              <span className="journey-state">
                <Sparkles />
              </span>
            </div>
          </div>

          <div className="journey-footer">
            <span className="avatar-dot">E</span>
            <p>
              <strong>Estrella</strong>, solo tendrás que volver con el archivo.
            </p>
          </div>
        </div>

        <div className="floating-chip floating-chip-one">
          <FileCheck2 aria-hidden="true" />
          <span>
            <strong>playlist</strong>
            <small>lista para traer</small>
          </span>
        </div>
        <div className="floating-chip floating-chip-two">
          <LockKeyhole aria-hidden="true" />
          <span>
            <strong>Privado</strong>
            <small>en tu navegador</small>
          </span>
        </div>
      </div>
    </section>
  );
}

function AnalysisProcess() {
  return (
    <div className="analysis-process" aria-label="Cómo buscamos la tonalidad">
      <div className="analysis-process-heading">
        <Info aria-hidden="true" />
        <div>
          <strong>Qué hemos hecho con cada canción</strong>
          <span>
            Spotify identifica la canción y ReccoBeats busca sus datos tonales.
          </span>
        </div>
      </div>
      <ol>
        <li>
          <span>1</span>
          <div>
            <strong>Caché válida</strong>
            <small>
              Reutilizamos un resultado vigente si ya lo calculamos.
            </small>
          </div>
        </li>
        <li>
          <span>2</span>
          <div>
            <strong>Identificación con Spotify</strong>
            <small>Confirmamos que es la canción y la versión correctas.</small>
          </div>
        </li>
        <li>
          <span>3</span>
          <div>
            <strong>Tonalidad con ReccoBeats</strong>
            <small>Obtenemos la tonalidad y los BPM de la grabación.</small>
          </div>
        </li>
        <li className="is-optional">
          <span>4</span>
          <div>
            <strong>Audio, solo si tú lo decides</strong>
            <small>
              Si falta la tonalidad o es dudosa, puedes analizar un archivo
              local para esa canción.
            </small>
          </div>
        </li>
      </ol>
    </div>
  );
}

function SpotifyPauseNotice({
  reccoStatus,
}: {
  reccoStatus: "not_attempted" | "no_exact_match" | "unavailable";
}) {
  return (
    <section
      className="spotify-pause-notice"
      role="alert"
      aria-labelledby="spotify-pause-title"
    >
      <div className="spotify-pause-heading">
        <span aria-hidden="true">
          <Clock3 />
        </span>
        <div>
          <small>QUOTA_EXCEEDED · NO SE HA PERDIDO NADA</small>
          <h3 id="spotify-pause-title">Estrella, no has hecho nada mal.</h3>
          <p>
            Spotify ha respondido <strong>QUOTA_EXCEEDED</strong>.{" "}
            {reccoStatus === "not_attempted"
              ? "Mientras dure esta restricción, Tonalizador no puede iniciar otra búsqueda automática y no ha enviado estas canciones."
              : reccoStatus === "unavailable"
                ? "Tonalizador sí ha probado después con ReccoBeats, pero ese servicio tampoco ha respondido."
                : "Tonalizador sí ha probado después con ReccoBeats, pero no ha encontrado una coincidencia exacta y ha preferido no darte la tonalidad de otra grabación."}
          </p>
        </div>
      </div>
      <div className="spotify-pause-guidance">
        <div>
          <strong>Qué debes hacer ahora</strong>
          <p>
            Spotify exige respetar el <strong>Retry-After completo</strong>:
            23.501 segundos, unas 6 horas y 32 minutos. Cuando se active el
            botón, pulsa «Reintentar» una sola vez. Si alguna canción sigue
            pendiente, usa «Analizar audio».
          </p>
        </div>
        <div className="is-warning">
          <strong>Lo que nadie debe hacer</strong>
          <p>
            No pulses «Reintentar» varias veces, no recargues la página y no
            vuelvas a importar el CSV para forzar la búsqueda. Cada nuevo
            intento puede alargar la pausa; la lista ya está guardada.
          </p>
        </div>
      </div>
    </section>
  );
}

function AnalysisSongRow({
  index,
  song,
  result,
  job,
  onAnalyzeAudio,
}: {
  index: number;
  song: SongInput;
  result: KeyLookupResult | null;
  job?: AcousticJob;
  onAnalyzeAudio: (
    song: SongInput,
    result: KeyLookupResult | null,
    file: File
  ) => void;
}) {
  const tonalConfidence = result ? getTonalConfidence(result) : null;
  const showAcoustic =
    job?.state === "analyzing" ||
    job?.state === "error" ||
    (result ? needsAcousticAnalysis(result) : false);
  const analyzingAudio = job?.state === "analyzing";
  const reasons = result
    ? visibleResultReasons(result, "Resultado que conviene comprobar")
    : [];

  return (
    <article
      className={[
        "analysis-song-row",
        result ? `is-${result.status}` : "is-pending",
      ].join(" ")}
    >
      <div className="analysis-song-summary">
        <span className="analysis-song-index" aria-hidden="true">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="analysis-song-title">
          <strong>{song.title}</strong>
          <small>{song.artists.join(", ")}</small>
        </div>
        <div
          className={`analysis-song-key ${result?.keySpanish ? "" : "is-empty"}`}
        >
          <strong>{result?.keySpanish ?? "Sin tonalidad"}</strong>
          <small>
            {result?.keyOf ?? "—"}
            {result?.camelot ? ` · Camelot ${result.camelot}` : ""}
            {result?.bpm ? ` · ${Math.round(result.bpm)} BPM` : ""}
          </small>
        </div>
      </div>

      <div className="analysis-song-details">
        <div className="analysis-song-trace">
          <span className={`result-status is-${result?.status ?? "pending"}`}>
            {result ? STATUS_LABELS[result.status] : "Pendiente"}
          </span>
          <span className="analysis-source">
            <Database aria-hidden="true" />
            {result ? describeResultSource(result) : "Aún no consultada"}
          </span>
          {tonalConfidence !== null ? (
            <span className="analysis-confidence">
              Confianza tonal {Math.round(tonalConfidence * 100)}%
            </span>
          ) : null}
          <p>
            {result
              ? describeResultProcess(result)
              : "La búsqueda automática todavía no ha terminado para esta canción."}
            {reasons.length > 0 ? ` ${reasons.join(" · ")}.` : ""}
          </p>
          {job?.state === "complete" && job.algorithm ? (
            <small className="acoustic-method">
              Método: perfil cromático local ({job.algorithm})
              {job.analyzedSeconds
                ? ` · ${Math.round(job.analyzedSeconds)} s analizados`
                : ""}
              {job.segments
                ? ` · Canción completa en ${job.segments} tramos`
                : ""}
              {job.windows?.length
                ? ` · Tramos: ${job.windows
                    .map(
                      window =>
                        `${Math.round(window.startSeconds)}–${Math.round(
                          window.endSeconds
                        )} s (${window.keySpanish}, ${Math.round(
                          window.confidence * 100
                        )} %)`
                    )
                    .join("; ")}`
                : ""}
            </small>
          ) : null}
        </div>

        {showAcoustic ? (
          <div className="acoustic-choice">
            <label
              className={`acoustic-file-button ${analyzingAudio ? "is-busy" : ""}`}
            >
              <input
                type="file"
                accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
                disabled={analyzingAudio}
                onChange={event => {
                  const file = event.target.files?.[0];
                  if (file) onAnalyzeAudio(song, result, file);
                  event.target.value = "";
                }}
              />
              {analyzingAudio ? (
                <LoaderCircle className="is-spinning" aria-hidden="true" />
              ) : (
                <FileAudio aria-hidden="true" />
              )}
              <span>
                <strong>
                  {analyzingAudio
                    ? `Analizando… ${Math.round(job.progress * 100)}%`
                    : result?.source === "local_acoustic"
                      ? "Analizar otro archivo"
                      : "Analizar audio"}
                </strong>
                <small>Elige el MP3 o archivo de esta canción</small>
              </span>
            </label>
            <p>
              <Clock3 aria-hidden="true" />
              Analiza la canción completa. Puede tardar varios minutos y el
              audio no sale del navegador.
            </p>
            {job?.state === "error" ? (
              <span className="acoustic-error" role="alert">
                <AlertCircle aria-hidden="true" />
                {job.error}
              </span>
            ) : null}
          </div>
        ) : (
          <span className="automatic-result">
            <CheckCircle2 aria-hidden="true" />
            Tonalidad automática disponible
          </span>
        )}
      </div>
    </article>
  );
}

type AnalyzeChapterProps = {
  sourceMode: SourceMode;
  parsed: ParsedCsv | null;
  columns: SongColumns | null;
  songs: SongInput[] | null;
  fileName: string;
  results: KeyLookupResult[];
  duplicateCount: number;
  progress: { done: number; total: number } | null;
  readingFile: boolean;
  error: string | null;
  dragOver: boolean;
  pendingCount: number;
  retryWaitSeconds: number;
  showProviderPauseNotice: boolean;
  analysisComplete: boolean;
  acousticJobs: AcousticJobs;
  fileInput: RefObject<HTMLInputElement | null>;
  onDragOver: (event: DragEvent<HTMLButtonElement>) => void;
  onDragLeave: () => void;
  onDrop: (event: DragEvent<HTMLButtonElement>) => void;
  onColumns: (columns: SongColumns) => void;
  onConfirmColumns: () => void;
  onAnalyze: () => void;
  onAnalyzeAudio: (
    song: SongInput,
    result: KeyLookupResult | null,
    file: File
  ) => void;
  onChooseAudio: () => void;
  onOpenCorrections: () => void;
  onChangeFile: () => void;
  onDownload: () => void;
};

function AnalyzeChapter({
  sourceMode,
  parsed,
  columns,
  songs,
  fileName,
  results,
  duplicateCount,
  progress,
  readingFile,
  error,
  dragOver,
  pendingCount,
  retryWaitSeconds,
  showProviderPauseNotice,
  analysisComplete,
  acousticJobs,
  fileInput,
  onDragOver,
  onDragLeave,
  onDrop,
  onColumns,
  onConfirmColumns,
  onAnalyze,
  onAnalyzeAudio,
  onChooseAudio,
  onOpenCorrections,
  onChangeFile,
  onDownload,
}: AnalyzeChapterProps) {
  const analyzing = progress !== null;

  if (readingFile) {
    return (
      <section
        className="chapter-stage analysis-status-stage"
        aria-live="polite"
      >
        <div className="status-illustration is-reading" aria-hidden="true">
          <LoaderCircle className="is-spinning" />
        </div>
        <div className="status-copy">
          <p className="stage-kicker">
            <FileInput aria-hidden="true" /> Un momento
          </p>
          <h2>Estamos leyendo tu archivo.</h2>
          <p>Enseguida te diremos cuántas canciones hemos encontrado.</p>
        </div>
      </section>
    );
  }

  if (analyzing && progress) {
    const percentage = Math.round((progress.done / progress.total) * 100);
    return (
      <section className="chapter-stage analysis-running" aria-live="polite">
        <div className="analysis-orbit" aria-hidden="true">
          <span className="orbit-ring orbit-ring-one" />
          <span className="orbit-ring orbit-ring-two" />
          <span className="analysis-core">
            <AudioLines />
          </span>
          <i className="orbit-particle particle-one" />
          <i className="orbit-particle particle-two" />
          <i className="orbit-particle particle-three" />
        </div>
        <div className="analysis-copy">
          <p className="stage-kicker">
            <Sparkles aria-hidden="true" /> Todo va bien
          </p>
          <h2>Estamos buscando la tonalidad real.</h2>
          <p>
            Para cada grabación comprobamos una caché vigente. Si no hay un
            resultado guardado, Spotify identifica la canción y ReccoBeats busca
            su tonalidad. En esta fase no enviamos ningún archivo de audio.
          </p>
          <div className="progress-block">
            <div className="progress-copy">
              <span>
                {progress.done} de {progress.total} preparadas
              </span>
              <strong>{percentage}%</strong>
            </div>
            <Progress
              value={percentage}
              aria-label={`Progreso: ${percentage}%`}
            />
            <small>
              Guardamos cada parte al terminarla y mostraremos la fuente de cada
              resultado.
            </small>
          </div>
        </div>
      </section>
    );
  }

  if (sourceMode === "audio" && songs?.length) {
    const song = songs[0];
    const result =
      results.find(candidate => candidate.inputId === song.id) ?? null;
    const job = acousticJobs[song.id];
    const analyzingAudio = job?.state === "analyzing";
    const failed = job?.state === "error";
    const reliable =
      result?.status === "classified" && result.source === "local_acoustic";

    return (
      <section className="chapter-stage analysis-results-stage standalone-audio-stage">
        <div className="analysis-results-shell">
          <header className="analysis-results-header">
            <div>
              <p
                className={`stage-kicker ${failed || result?.status === "review" ? "is-warm" : ""}`}
              >
                {analyzingAudio ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : reliable ? (
                  <BadgeCheck aria-hidden="true" />
                ) : (
                  <FileAudio aria-hidden="true" />
                )}
                {analyzingAudio
                  ? "Analizando el audio"
                  : reliable
                    ? "Análisis terminado"
                    : failed
                      ? "Necesitamos intentarlo de nuevo"
                      : "Análisis de una canción"}
              </p>
              <h2>
                {analyzingAudio
                  ? "Estamos escuchando tu canción."
                  : reliable
                    ? "Esta es su tonalidad."
                    : failed
                      ? "No hemos podido leer este audio."
                      : "Conviene comprobar el resultado."}
              </h2>
              <p>
                {analyzingAudio
                  ? "Analizamos el archivo completo de principio a fin para calcular la tonalidad y los BPM. En móvil puede tardar varios minutos."
                  : reliable
                    ? "El resultado se ha calculado directamente a partir del archivo de tu dispositivo."
                    : failed
                      ? "Puedes volver a elegir el mismo archivo o probar con otro formato compatible."
                      : "El cálculo no ha sido suficientemente claro. Puedes probar con otro archivo o corregir la tonalidad manualmente."}
              </p>
            </div>
            <div className="analysis-results-actions">
              <Button
                size="sm"
                variant="outline"
                onClick={onChooseAudio}
                disabled={analyzingAudio}
              >
                <FileAudio aria-hidden="true" />
                Elegir otra canción
              </Button>
              {result ? (
                <button
                  type="button"
                  className="analysis-correction-link"
                  onClick={onOpenCorrections}
                >
                  Corrección manual opcional
                </button>
              ) : null}
            </div>
          </header>

          <div className="standalone-audio-explainer">
            <LockKeyhole aria-hidden="true" />
            <p>
              <strong>Tu MP3 no sale del dispositivo.</strong> Se decodifica y
              analiza únicamente en este navegador; no se sube ni se conserva.
            </p>
          </div>

          <div className="analysis-song-list" aria-label="Canción analizada">
            <AnalysisSongRow
              index={0}
              song={song}
              result={result}
              job={job}
              onAnalyzeAudio={onAnalyzeAudio}
            />
          </div>
        </div>
      </section>
    );
  }

  if (results.length > 0) {
    const preparedCount = results.filter(
      result => result.status !== "error"
    ).length;
    const resultMap = new Map(results.map(result => [result.inputId, result]));
    const displayedSongs =
      songs ??
      results.map((result, index) => ({
        id: result.inputId,
        title: result.title,
        artists: result.artists,
        position: index,
      }));
    const needsAudioCount = results.filter(needsAcousticAnalysis).length;
    const spotifyPaused = results.some(result =>
      result.reasonCodes.includes("provider_rate_limited")
    );
    const reccoFallbackUnavailable = results.some(result =>
      result.reasonCodes.includes("reccobeats_fallback_unavailable")
    );

    return (
      <section className="chapter-stage analysis-results-stage">
        <div className="analysis-results-shell">
          <header className="analysis-results-header">
            <div>
              <p
                className={`stage-kicker ${pendingCount > 0 ? "is-warm" : ""}`}
              >
                {pendingCount > 0 ? (
                  <AlertCircle aria-hidden="true" />
                ) : (
                  <BadgeCheck aria-hidden="true" />
                )}
                {pendingCount > 0
                  ? "No se ha perdido nada"
                  : "Búsqueda automática terminada"}
              </p>
              <h2>Tu lista completa.</h2>
              <p>
                La tonalidad aparece junto a cada canción. También puedes ver de
                dónde ha salido y pedir un análisis acústico solo cuando haga
                falta.
              </p>
            </div>
            <div className="analysis-results-actions">
              <div>
                <strong>
                  {preparedCount} de {displayedSongs.length}
                </strong>
                <span>canciones consultadas</span>
              </div>
              {needsAudioCount > 0 ? (
                <span className="needs-audio-count">
                  <AudioLines aria-hidden="true" />
                  {needsAudioCount}{" "}
                  {needsAudioCount === 1
                    ? "puede analizarse"
                    : "pueden analizarse"}{" "}
                  con audio
                </span>
              ) : null}
              {pendingCount > 0 ? (
                <Button
                  size="sm"
                  onClick={onAnalyze}
                  disabled={spotifyPaused && retryWaitSeconds > 0}
                >
                  <RefreshCw aria-hidden="true" />
                  {spotifyPaused && retryWaitSeconds > 0
                    ? `Espera ${retryWaitLabel(retryWaitSeconds)}`
                    : spotifyPaused
                      ? "Reintentar una sola vez"
                      : `Reintentar las ${pendingCount} pendientes`}
                </Button>
              ) : analysisComplete ? (
                <Button size="sm" onClick={onDownload}>
                  Ir a Descargar
                  <ArrowRight aria-hidden="true" />
                </Button>
              ) : null}
              <button
                type="button"
                className="analysis-correction-link"
                onClick={onOpenCorrections}
              >
                Corrección manual opcional
              </button>
            </div>
          </header>

          {spotifyPaused ? (
            <SpotifyPauseNotice
              reccoStatus={
                reccoFallbackUnavailable ? "unavailable" : "no_exact_match"
              }
            />
          ) : error ? (
            <div className="friendly-error analysis-results-error" role="alert">
              <AlertCircle aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <AnalysisProcess />

          <div className="analysis-song-list" aria-label="Lista de canciones">
            {displayedSongs.map((song, index) => (
              <AnalysisSongRow
                key={song.id}
                index={index}
                song={song}
                result={resultMap.get(song.id) ?? null}
                job={acousticJobs[song.id]}
                onAnalyzeAudio={onAnalyzeAudio}
              />
            ))}
          </div>

          <footer className="analysis-results-footer">
            <LockKeyhole aria-hidden="true" />
            <p>
              <strong>Transparencia y privacidad:</strong> para la búsqueda
              automática enviamos título y artista. Si eliges “Analizar audio”,
              ese archivo se procesa en este navegador, no se sube y no se
              conserva.
            </p>
          </footer>
        </div>
      </section>
    );
  }

  if (songs?.length) {
    return (
      <section className="chapter-stage analyze-ready-stage">
        <div className="ready-summary">
          <p className="stage-kicker">
            <BadgeCheck aria-hidden="true" /> Archivo preparado
          </p>
          <h2>Perfecto, Estrella.</h2>
          <p className="ready-count">
            Encontramos <strong>{songs.length}</strong> canciones.
          </p>
          <p className="ready-subcopy">
            {duplicateCount > 0
              ? `${duplicateCount} repetidas se han apartado para no crear copias.`
              : "No necesitas revisar nada antes de continuar."}
          </p>
          {showProviderPauseNotice ? (
            <SpotifyPauseNotice reccoStatus="not_attempted" />
          ) : error ? (
            <div className="friendly-error ready-error" role="alert">
              <AlertCircle aria-hidden="true" />
              {error}
            </div>
          ) : null}

          <div className="stage-actions">
            <Button
              size="lg"
              onClick={onAnalyze}
              disabled={showProviderPauseNotice && retryWaitSeconds > 0}
            >
              {error || showProviderPauseNotice ? (
                <RefreshCw aria-hidden="true" />
              ) : (
                <Sparkles aria-hidden="true" />
              )}
              {showProviderPauseNotice && retryWaitSeconds > 0
                ? `Espera ${retryWaitLabel(retryWaitSeconds)}`
                : error
                  ? "Volver a intentarlo"
                  : "Analizar mis canciones"}
            </Button>
            <button
              type="button"
              className="text-action is-quiet"
              onClick={onChangeFile}
            >
              Elegir otro archivo
            </button>
          </div>
        </div>

        <div className="song-preview-card">
          <div className="song-preview-header">
            <span>
              <ListMusic aria-hidden="true" /> Un vistazo
            </span>
            <small>{fileName}</small>
          </div>
          <div className="song-preview-list">
            {songs.slice(0, 5).map((song, index) => (
              <div className="song-preview-row" key={song.id}>
                <span className="song-order">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="mini-wave" aria-hidden="true">
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  <strong>{song.title}</strong>
                  <small>{song.artists.join(", ")}</small>
                </span>
                <Check aria-hidden="true" />
              </div>
            ))}
          </div>
          {songs.length > 5 ? (
            <p className="song-preview-more">
              y {songs.length - 5} canciones más
            </p>
          ) : null}
          <div className="song-preview-footer">
            <ShieldCheck aria-hidden="true" />
            El archivo no se sube. Al analizar, enviamos solo título y artista.
          </div>
        </div>
      </section>
    );
  }

  if (parsed && columns) {
    const titleExample = columnExample(parsed, columns.title);
    const artistExample = columnExample(parsed, columns.artist);
    const mappingWarning = columnMappingWarning(parsed, columns);
    const canContinue =
      Boolean(columns.title && columns.artist) && mappingWarning === null;

    return (
      <section className="chapter-stage mapping-stage">
        <div className="mapping-copy">
          <span className="mapping-icon" aria-hidden="true">
            <FileInput />
          </span>
          <p className="stage-kicker">Un pequeño ajuste</p>
          <h2>Ayúdanos a leer este archivo.</h2>
          <p>
            El archivo está bien, pero sus encabezados tienen nombres que no
            reconocemos. Solo tienes que indicarnos qué columna contiene cada
            dato; no necesitas editar el CSV.
          </p>
        </div>
        <div className="mapping-panel">
          <div className="mapping-guidance">
            <strong>Haz estas dos elecciones</strong>
            <span>
              Después podrás comprobar un ejemplo real antes de continuar.
            </span>
          </div>

          <div className="mapping-field">
            <label>
              <span className="mapping-field-copy">
                <b>1</b>
                <span>
                  <strong>Título de la canción</strong>
                  <small>Suele llamarse «Track name», «Song» o «Title».</small>
                </span>
              </span>
              <Select
                value={columns.title ?? ""}
                onValueChange={value => onColumns({ ...columns, title: value })}
              >
                <SelectTrigger aria-label="Columna del nombre de la canción">
                  <SelectValue placeholder="Elegir columna" />
                </SelectTrigger>
                <SelectContent>
                  {parsed.headers.map(header => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {titleExample ? (
              <div className="mapping-example">
                <span>Ejemplo encontrado en esa columna</span>
                <strong>«{titleExample}»</strong>
                <small>¿Esto es el título de una canción?</small>
              </div>
            ) : null}
          </div>

          <div className="mapping-field">
            <label>
              <span className="mapping-field-copy">
                <b>2</b>
                <span>
                  <strong>Cantante o grupo</strong>
                  <small>Suele llamarse «Artist name» o «Artist».</small>
                </span>
              </span>
              <Select
                value={columns.artist ?? ""}
                onValueChange={value =>
                  onColumns({ ...columns, artist: value })
                }
              >
                <SelectTrigger aria-label="Columna del artista">
                  <SelectValue placeholder="Elegir columna" />
                </SelectTrigger>
                <SelectContent>
                  {parsed.headers.map(header => (
                    <SelectItem key={header} value={header}>
                      {header}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            {artistExample ? (
              <div className="mapping-example">
                <span>Ejemplo encontrado en esa columna</span>
                <strong>«{artistExample}»</strong>
                <small>¿Esto es el nombre de un cantante o grupo?</small>
              </div>
            ) : null}
          </div>

          {mappingWarning ? (
            <div className="mapping-warning" role="alert">
              <AlertCircle aria-hidden="true" />
              <span>
                <strong>Revisa estas elecciones.</strong>
                {mappingWarning}
              </span>
            </div>
          ) : null}

          <Button size="lg" onClick={onConfirmColumns} disabled={!canContinue}>
            <Check aria-hidden="true" />
            Continuar con estas columnas
          </Button>
          <p>
            No cambiaremos el archivo. Solo usaremos estas dos columnas para
            preparar las canciones.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="chapter-stage upload-stage">
      <div className="upload-copy">
        <p className="stage-kicker">
          <FileInput aria-hidden="true" /> Ya estamos en el segundo paso
        </p>
        <h2>Ahora trae el archivo CSV aquí.</h2>
        <p>
          Elige el archivo CSV que acabas de guardar y nosotros nos ocupamos de
          entenderlo.
        </p>
        <div className="upload-assurances">
          <span>
            <Check aria-hidden="true" /> Reconocemos el formato por ti
          </span>
          <span>
            <Check aria-hidden="true" /> Puedes continuar más tarde
          </span>
        </div>
      </div>

      <div className="upload-zone-wrap">
        <button
          type="button"
          className={`upload-zone ${dragOver ? "is-dragging" : ""}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        >
          <span className="upload-zone-icon">
            <Upload aria-hidden="true" />
          </span>
          <strong>Elegir el archivo CSV de mi playlist</strong>
          <span>También puedes arrastrarlo hasta aquí</span>
          <small>Debe ser un archivo terminado en .csv</small>
        </button>
        {error ? (
          <div className="friendly-error upload-error" role="alert">
            <AlertCircle aria-hidden="true" />
            {error}
          </div>
        ) : (
          <p className="upload-privacy">
            <LockKeyhole aria-hidden="true" /> El archivo no se sube. Enviaremos
            título y artista solo cuando pulses Analizar.
          </p>
        )}
        <div className="upload-alternative" aria-label="Otra forma de analizar">
          <span>o, si solo quieres conocer la tonalidad de una canción</span>
          <button
            type="button"
            className="direct-audio-action is-compact"
            onClick={onChooseAudio}
          >
            <span className="direct-audio-icon" aria-hidden="true">
              <FileAudio />
            </span>
            <span>
              <strong>Elegir un MP3 de mi dispositivo</strong>
              <small>También admite M4A, WAV, FLAC, OGG y AAC</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </section>
  );
}

type DownloadChapterProps = {
  results: KeyLookupResult[];
  groups: Map<string, KeyLookupResult[]>;
  counts: ResultCounts;
  totalSongs: number;
  pendingCount: number;
  analysisComplete: boolean;
  deliveryState: DeliveryState;
  downloading: boolean;
  downloadError: string | null;
  onGoAnalyze: () => void;
  onDownloadAll: () => void;
  onOpenGroups: () => void;
  onOpenReview: () => void;
  onImported: () => void;
  onStartAgain: () => void;
};

function DownloadChapter({
  results,
  groups,
  counts,
  totalSongs,
  pendingCount,
  analysisComplete,
  deliveryState,
  downloading,
  downloadError,
  onGoAnalyze,
  onDownloadAll,
  onOpenGroups,
  onOpenReview,
  onImported,
  onStartAgain,
}: DownloadChapterProps) {
  if (!analysisComplete) {
    return (
      <section className="chapter-stage empty-download-stage">
        <div className="empty-download-visual" aria-hidden="true">
          <FolderDown />
          <span />
        </div>
        <div className="status-copy">
          <p className="stage-kicker">
            {results.length > 0
              ? "Seguimos trabajando"
              : "Aún no hemos llegado aquí"}
          </p>
          <h2>
            {results.length > 0
              ? "Todavía estamos preparando tus canciones."
              : "Primero necesitamos ordenar tus canciones."}
          </h2>
          <p>
            {results.length > 0
              ? `Ya hay ${results.length} preparadas y quedan ${pendingCount}. No descargaremos nada hasta tener el resultado completo.`
              : "Cuando termine el análisis, encontrarás todas tus listas en esta pantalla."}
          </p>
          <Button size="lg" onClick={onGoAnalyze}>
            {results.length > 0 ? "Volver al análisis" : "Ir a Analizar"}
            <ArrowRight aria-hidden="true" />
          </Button>
        </div>
      </section>
    );
  }

  const needsAttention = counts.review + counts.not_found + counts.error;
  const completion = totalSongs
    ? Math.round((counts.classified / totalSongs) * 100)
    : 0;
  const needsReviewBeforeDownload = groups.size === 0;

  if (deliveryState === "finished") {
    return (
      <section className="chapter-stage finished-stage">
        <div className="celebration-visual" aria-hidden="true">
          <span className="celebration-orb">
            <BadgeCheck />
          </span>
          <i />
          <i />
          <i />
          <i />
          <i />
        </div>
        <div className="status-copy">
          <p className="stage-kicker">
            <Sparkles aria-hidden="true" /> Recorrido completado
          </p>
          <h2>Ya lo tienes, Estrella.</h2>
          <p>
            Tus playlists están de nuevo en YouTube Music, ahora ordenadas por
            tonalidad.
          </p>
          <Button size="lg" onClick={onStartAgain}>
            <RefreshCw aria-hidden="true" />
            Ordenar otra playlist
          </Button>
        </div>
      </section>
    );
  }

  return (
    <section className="chapter-stage download-ready-stage">
      <div className="download-summary">
        <p className="stage-kicker">
          <Sparkles aria-hidden="true" /> Ya casi lo tenemos
        </p>
        <h2>
          {deliveryState === "ready" && needsReviewBeforeDownload
            ? "Hay canciones que necesitan tu ayuda."
            : deliveryState === "ready"
              ? `Hemos preparado ${groups.size} ${groups.size === 1 ? "archivo" : "archivos"} para tus playlists.`
              : "La descarga está lista."}
        </h2>
        <p>
          {deliveryState === "ready" && needsReviewBeforeDownload
            ? "Aún no podemos crear las listas. Vuelve a Analizar y, solo para las canciones pendientes, puedes elegir un archivo de audio local."
            : deliveryState === "ready"
              ? `${counts.classified} canciones están ordenadas por tonalidad y listas para descargar.`
              : "Primero descomprime el archivo. Después abre TuneMyMusic y añade cada lista a YouTube Music."}
        </p>

        <div className="download-primary-action">
          {deliveryState === "ready" ? (
            needsReviewBeforeDownload ? (
              <Button size="lg" onClick={onOpenReview}>
                <ListFilter aria-hidden="true" />
                Ver lista completa
              </Button>
            ) : (
              <Button size="lg" onClick={onDownloadAll} disabled={downloading}>
                {downloading ? (
                  <LoaderCircle className="is-spinning" aria-hidden="true" />
                ) : (
                  <FolderDown aria-hidden="true" />
                )}
                {downloading
                  ? "Preparando la descarga…"
                  : "Descargar todas las listas"}
              </Button>
            )
          ) : (
            <>
              <Button size="lg" asChild>
                <a
                  href={TUNEMY_MUSIC_IMPORT_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir TuneMyMusic
                  <ExternalLink aria-hidden="true" />
                </a>
              </Button>
              <button
                type="button"
                className="text-action"
                onClick={onImported}
              >
                Ya están añadidas
                <Check aria-hidden="true" />
              </button>
            </>
          )}
        </div>

        {downloadError ? (
          <div className="friendly-error download-error" role="alert">
            <AlertCircle aria-hidden="true" />
            {downloadError}
          </div>
        ) : null}

        {needsAttention > 0 ? (
          <div className="review-note">
            <AlertCircle aria-hidden="true" />
            <p>
              <strong>
                {needsAttention}{" "}
                {needsAttention === 1
                  ? "canción necesita"
                  : "canciones necesitan"}{" "}
                una mirada.
              </strong>
              En Analizar puedes pedir un análisis acústico individual. Solo se
              hará si tú eliges el archivo de esa canción.
            </p>
          </div>
        ) : (
          <div className="review-note is-clear">
            <CheckCircle2 aria-hidden="true" />
            <p>
              <strong>Todo está claro.</strong> No hay canciones pendientes de
              revisar.
            </p>
          </div>
        )}
      </div>

      <div className="download-dashboard">
        <div className="result-score">
          <div
            className="score-ring"
            style={{ "--result-progress": `${completion}%` } as CSSProperties}
          >
            <span>
              <strong>{completion}%</strong>
              <small>ordenado</small>
            </span>
          </div>
          <div>
            <p>Resumen</p>
            <strong>{counts.classified} canciones listas</strong>
            <small>{groups.size} tonalidades distintas</small>
          </div>
        </div>

        <div className="group-preview">
          <div className="group-preview-header">
            <span>Tus nuevas listas</span>
            <button type="button" onClick={onOpenGroups}>
              Ver todas <ChevronRight aria-hidden="true" />
            </button>
          </div>
          <div className="group-preview-list">
            {[...groups.entries()].slice(0, 4).map(([key, songs], index) => (
              <button
                key={key}
                type="button"
                className="group-preview-row"
                style={
                  {
                    "--tone-color": TONE_COLORS[index % TONE_COLORS.length],
                  } as CSSProperties
                }
                onClick={onOpenGroups}
              >
                <span className="tone-swatch" aria-hidden="true">
                  <AudioLines />
                </span>
                <span>
                  <strong>{key}</strong>
                  <small>{songs.length} canciones</small>
                </span>
                <ChevronRight aria-hidden="true" />
              </button>
            ))}
            {groups.size === 0 ? (
              <div className="group-preview-empty">
                <AlertCircle aria-hidden="true" />
                <span>
                  Las listas aparecerán cuando obtengamos una tonalidad válida.
                </span>
              </div>
            ) : null}
          </div>
          <div className="download-secondary-actions">
            {groups.size > 0 ? (
              <button type="button" onClick={onOpenGroups}>
                <ListMusic aria-hidden="true" />
                Ver listas
              </button>
            ) : null}
            <button type="button" onClick={onOpenReview}>
              <ListFilter aria-hidden="true" />
              Ver lista completa
              {needsAttention > 0 ? <span>{needsAttention}</span> : null}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function DetailDrawer({
  open,
  title,
  eyebrow,
  wide = false,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  eyebrow: string;
  wide?: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      else keepFocusInside(event, drawerRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={onClose}>
      <section
        ref={drawerRef}
        className={`detail-drawer ${wide ? "is-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="detail-drawer-title"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <header className="detail-drawer-header">
          <div>
            <p>{eyebrow}</p>
            <h2 id="detail-drawer-title">{title}</h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            className="icon-button"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <X aria-hidden="true" />
          </button>
        </header>
        <div className="detail-drawer-body">{children}</div>
      </section>
    </div>
  );
}

function ResetDialog({
  open,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      else keepFocusInside(event, dialogRef.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [onCancel, open]);

  if (!open) return null;

  return (
    <div
      className="dialog-layer is-centered"
      role="presentation"
      onMouseDown={onCancel}
    >
      <section
        ref={dialogRef}
        className="reset-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="reset-title"
        aria-describedby="reset-description"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <span className="reset-dialog-icon" aria-hidden="true">
          <Trash2 />
        </span>
        <h2 id="reset-title">¿Empezamos con otra playlist?</h2>
        <p id="reset-description">
          Borraremos el progreso guardado de esta playlist, pero los archivos
          que ya descargaste seguirán contigo.
        </p>
        <div>
          <Button ref={cancelRef} variant="outline" onClick={onCancel}>
            Seguir aquí
          </Button>
          <Button variant="destructive" onClick={onConfirm}>
            Sí, empezar de nuevo
          </Button>
        </div>
      </section>
    </div>
  );
}

export default function Classifier() {
  const [savedInitial] = useState<SavedAnalysis | null>(() =>
    readSavedAnalysis()
  );
  const [view, setView] = useState<"home" | "workspace">("home");
  const [chapter, setChapter] = useState<Chapter>(() =>
    getInitialChapter(savedInitial)
  );
  const [sourceMode, setSourceMode] = useState<SourceMode>(
    () => savedInitial?.sourceMode ?? "playlist"
  );
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [columns, setColumns] = useState<SongColumns | null>(null);
  const [songs, setSongs] = useState<SongInput[] | null>(
    () => savedInitial?.songs ?? null
  );
  const [fileName, setFileName] = useState(() => savedInitial?.fileName ?? "");
  const [results, setResults] = useState<KeyLookupResult[]>(
    () => savedInitial?.results ?? []
  );
  const [duplicateCount, setDuplicateCount] = useState(
    () => savedInitial?.duplicateCount ?? 0
  );
  const [duplicateSongs, setDuplicateSongs] = useState<
    Array<{ title: string; artist: string }>
  >(() => savedInitial?.duplicateSongs ?? []);
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [readingFile, setReadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [providerPauseUntil, setProviderPauseUntil] = useState<number | null>(
    () =>
      readProviderPauseUntil() ??
      (savedInitial?.results.some(result =>
        result.reasonCodes.includes("provider_rate_limited")
      )
        ? Date.now() + PROVIDER_RETRY_DELAY_MS
        : null)
  );
  const [pauseClock, setPauseClock] = useState(Date.now);
  const [pauseNoticeVisible, setPauseNoticeVisible] = useState(false);
  const [saveWarning, setSaveWarning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>("all");
  const [deliveryState, setDeliveryState] = useState<DeliveryState>("ready");
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [acousticJobs, setAcousticJobs] = useState<AcousticJobs>({});
  const fileInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const fileReadId = useRef(0);
  const stageRef = useRef<HTMLDivElement>(null);

  const lookup = trpc.music.lookupBatch.useMutation();
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  const closeGroups = useCallback(() => setGroupsOpen(false), []);
  const closeReview = useCallback(() => setReviewOpen(false), []);
  const closeReset = useCallback(() => setResetOpen(false), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  const openGroups = useCallback(() => setGroupsOpen(true), []);
  const openReview = useCallback(() => setReviewOpen(true), []);

  useEffect(() => {
    if (!songs?.length || (sourceMode === "audio" && results.length === 0))
      return;
    const saved: SavedAnalysis = {
      version: 2,
      sourceMode,
      fileName,
      songs,
      results,
      duplicateCount,
      duplicateSongs,
    };
    const saveProgress = window.setTimeout(() => {
      let storageUnavailable = false;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      } catch {
        storageUnavailable = true;
      }
      setSaveWarning(storageUnavailable);
    }, 180);
    return () => window.clearTimeout(saveProgress);
  }, [duplicateCount, duplicateSongs, fileName, results, songs, sourceMode]);

  useEffect(() => {
    if (view !== "workspace") return;
    const focusStage = window.requestAnimationFrame(() =>
      stageRef.current?.focus({ preventScroll: true })
    );
    return () => window.cancelAnimationFrame(focusStage);
  }, [chapter, view]);

  useEffect(() => {
    if (!providerPauseUntil) return;
    try {
      localStorage.setItem(PROVIDER_PAUSE_KEY, String(providerPauseUntil));
    } catch {
      // La espera visual sigue funcionando aunque no se pueda guardar.
    }
    const updateClock = () => setPauseClock(Date.now());
    updateClock();
    const timer = window.setInterval(updateClock, 1_000);
    return () => window.clearInterval(timer);
  }, [providerPauseUntil]);

  useEffect(() => {
    if (!providerPauseUntil || pauseClock < providerPauseUntil) return;
    setProviderPauseUntil(null);
    setPauseNoticeVisible(false);
    // Conservamos la marca vencida para que una recarga no reinicie la espera.
  }, [pauseClock, providerPauseUntil]);

  useEffect(() => {
    const background = document.querySelector<HTMLElement>(".app-main");
    const modalOpen = helpOpen || groupsOpen || reviewOpen || resetOpen;
    if (modalOpen) background?.setAttribute("inert", "");
    else background?.removeAttribute("inert");
    return () => background?.removeAttribute("inert");
  }, [groupsOpen, helpOpen, resetOpen, reviewOpen]);

  const noSongsMessage = (skippedArtists: number) =>
    skippedArtists > 0
      ? "Este archivo contiene canales o artistas, pero no una playlist de canciones. Vuelve a exportar una playlist y lo intentamos otra vez."
      : "No hemos encontrado canciones con título y artista. Prueba con el archivo exportado de nuevo.";

  const applyExtractedSongs = useCallback(
    (nextParsed: ParsedCsv, nextColumns: SongColumns) => {
      const extracted = extractSongs(nextParsed.rows, nextColumns);
      setDuplicateCount(extracted.duplicateCount);
      setDuplicateSongs(extracted.duplicateSongs);
      setResults([]);
      setDeliveryState("ready");
      if (extracted.songs.length > 0) {
        setSongs(extracted.songs);
        setError(null);
      } else {
        setSongs(null);
        setError(noSongsMessage(extracted.skippedArtists));
      }
    },
    []
  );

  const handleFile = useCallback(
    async (file: File) => {
      const requestId = ++fileReadId.current;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // The new file can still replace the in-memory session.
      }
      setParsed(null);
      setColumns(null);
      setSourceMode("playlist");
      setSongs(null);
      setResults([]);
      setDuplicateCount(0);
      setDuplicateSongs([]);
      setProgress(null);
      setError(null);
      setSaveWarning(false);
      setFileName(file.name);
      setDeliveryState("ready");
      setDownloading(false);
      setDownloadError(null);
      setAcousticJobs({});
      setReviewFilter("all");
      setChapter("analyze");
      setReadingFile(true);
      try {
        const next = await parseCsvFile(file);
        if (requestId !== fileReadId.current) return;
        setParsed(next);
        setColumns(next.columns);
        if (
          next.columns.title &&
          next.columns.artist &&
          columnMappingWarning(next, next.columns) === null
        ) {
          applyExtractedSongs(next, next.columns);
        } else {
          setSongs(null);
          setResults([]);
        }
      } catch {
        if (requestId !== fileReadId.current) return;
        setParsed(null);
        setColumns(null);
        setSongs(null);
        setError(
          "No hemos podido leer ese archivo. Vuelve a exportarlo y lo intentamos otra vez."
        );
      } finally {
        if (requestId === fileReadId.current) setReadingFile(false);
      }
    },
    [applyExtractedSongs]
  );

  const applyColumns = (nextColumns: SongColumns) => {
    setColumns(nextColumns);
  };

  const confirmColumns = () => {
    if (
      parsed &&
      columns?.title &&
      columns.artist &&
      columnMappingWarning(parsed, columns) === null
    ) {
      applyExtractedSongs(parsed, columns);
    }
  };

  const reset = useCallback(() => {
    fileReadId.current += 1;
    try {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PROVIDER_PAUSE_KEY);
    } catch {
      // The in-memory state can still be cleared when storage is unavailable.
    }
    setParsed(null);
    setColumns(null);
    setSourceMode("playlist");
    setSongs(null);
    setResults([]);
    setDuplicateCount(0);
    setDuplicateSongs([]);
    setProgress(null);
    setReadingFile(false);
    setError(null);
    setSaveWarning(false);
    setFileName("");
    setDeliveryState("ready");
    setDownloading(false);
    setDownloadError(null);
    setAcousticJobs({});
    setReviewFilter("all");
    setResetOpen(false);
    setProviderPauseUntil(null);
    setPauseNoticeVisible(false);
    setChapter("export");
  }, []);

  const changeFile = useCallback(() => {
    reset();
    setChapter("analyze");
  }, [reset]);

  const pendingSongs = useMemo(() => {
    if (!songs) return [];
    const resultMap = new Map(results.map(result => [result.inputId, result]));
    return songs.filter(song => {
      const result = resultMap.get(song.id);
      return !result || result.status === "error";
    });
  }, [results, songs]);

  const analyze = async () => {
    if (!songs || pendingSongs.length === 0) return;
    if (providerPauseUntil && providerPauseUntil > Date.now()) {
      setPauseNoticeVisible(true);
      return;
    }
    setPauseNoticeVisible(false);
    setError(null);
    setProgress({ done: 0, total: pendingSongs.length });
    const resultMap = new Map(results.map(result => [result.inputId, result]));
    let done = 0;
    try {
      for (let index = 0; index < pendingSongs.length; index += CHUNK_SIZE) {
        const chunk = pendingSongs.slice(index, index + CHUNK_SIZE);
        const response = await lookup.mutateAsync({ songs: chunk });
        response.results.forEach(result =>
          resultMap.set(result.inputId, result)
        );
        done += chunk.length;
        setResults(orderedResults(songs, resultMap));
        setProgress({ done, total: pendingSongs.length });
      }

      const remaining = songs.filter(song => {
        const result = resultMap.get(song.id);
        return !result || result.status === "error";
      });
      if (remaining.length > 0) {
        const remainingResults = remaining.flatMap(song => {
          const result = resultMap.get(song.id);
          return result ? [result] : [];
        });
        setError(incompleteAnalysisMessage(remaining.length, remainingResults));
        if (
          remainingResults.some(result =>
            result.reasonCodes.includes("provider_rate_limited")
          )
        ) {
          const pauseUntil = Date.now() + PROVIDER_RETRY_DELAY_MS;
          setProviderPauseUntil(pauseUntil);
          setPauseClock(Date.now());
          try {
            localStorage.setItem(PROVIDER_PAUSE_KEY, String(pauseUntil));
          } catch {
            // La espera visual sigue funcionando aunque no se pueda guardar.
          }
        }
      }
    } catch (analysisError) {
      console.error("[analysis_request_failed]", analysisError);
      setError(analysisRequestErrorMessage(analysisError));
    } finally {
      setProgress(null);
    }
  };

  const setTone = (song: SongInput, keyOf: (typeof KEY_OPTIONS)[number]) => {
    setError(null);
    setDeliveryState("ready");
    setDownloadError(null);
    setResults(current =>
      current.map(result =>
        result.inputId === song.id
          ? {
              ...result,
              status: "classified",
              keyOf,
              keySpanish: keyToSpanish(keyOf),
              camelot: keyToCamelot(keyOf),
              tonalConfidence: null,
              source: "manual",
              reasonCodes: ["manual_override"],
              cached: false,
            }
          : result
      )
    );
  };

  const analyzeLocalAudio = useCallback(
    async (
      song: SongInput,
      existingResult: KeyLookupResult | null,
      file: File,
      targetSongs: SongInput[] | null = songs
    ) => {
      setError(null);
      setAcousticJobs(current => ({
        ...current,
        [song.id]: { state: "analyzing", progress: 0 },
      }));

      try {
        const { analyzeAudioFile } = await import("@/lib/acousticAnalysis");
        const analysis = await analyzeAudioFile(file, {
          onProgress: progress => {
            const safeProgress = Math.min(1, Math.max(0, progress));
            setAcousticJobs(current => ({
              ...current,
              [song.id]: { state: "analyzing", progress: safeProgress },
            }));
          },
        });

        if (
          !KEY_OPTIONS.includes(
            analysis.keyOf as (typeof KEY_OPTIONS)[number]
          ) ||
          (analysis.mode !== 0 && analysis.mode !== 1)
        ) {
          throw new Error("El análisis no devolvió una tonalidad válida.");
        }

        setResults(current => {
          const resultMap = new Map(
            current.map(result => [result.inputId, result])
          );
          const previous = resultMap.get(song.id) ?? existingResult;
          const nextResult: KeyLookupResult = {
            inputId: song.id,
            title: song.title,
            artists: song.artists,
            status: analysis.isReliable ? "classified" : "review",
            keyOf: analysis.keyOf,
            keySpanish: analysis.keySpanish,
            camelot: analysis.camelot,
            bpm: analysis.bpm,
            confidence: previous?.confidence ?? null,
            tonalConfidence: analysis.confidence,
            source: "local_acoustic",
            matchedTrack: previous?.matchedTrack ?? null,
            reasonCodes: analysis.isReliable
              ? ["local_acoustic_analysis"]
              : ["local_acoustic_analysis", "acoustic_low_confidence"],
            cached: false,
          };
          resultMap.set(song.id, nextResult);
          return targetSongs
            ? orderedResults(targetSongs, resultMap)
            : [...current, nextResult];
        });

        setAcousticJobs(current => ({
          ...current,
          [song.id]: {
            state: "complete",
            progress: 1,
            algorithm: analysis.algorithm,
            analyzedSeconds: analysis.analyzedSeconds,
            segments: analysis.segments,
            windows: analysis.windows.map(window => ({
              startSeconds: window.startSeconds,
              endSeconds: window.endSeconds,
              keySpanish: window.keySpanish,
              confidence: window.confidence,
            })),
          },
        }));
        setDeliveryState("ready");
        setDownloadError(null);
      } catch (analysisError) {
        console.error("[local_acoustic_analysis_failed]", analysisError);
        setAcousticJobs(current => ({
          ...current,
          [song.id]: {
            state: "error",
            progress: 0,
            error:
              analysisError instanceof Error
                ? analysisError.message
                : "No hemos podido analizar este archivo de audio.",
          },
        }));
      }
    },
    [songs]
  );

  const handleStandaloneAudio = useCallback(
    (file: File) => {
      const song = createLocalSong(file);
      fileReadId.current += 1;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // El análisis puede continuar aunque no haya almacenamiento local.
      }
      setParsed(null);
      setColumns(null);
      setSourceMode("audio");
      setSongs([song]);
      setResults([]);
      setDuplicateCount(0);
      setDuplicateSongs([]);
      setProgress(null);
      setReadingFile(false);
      setError(null);
      setSaveWarning(false);
      setFileName(file.name);
      setDeliveryState("ready");
      setDownloading(false);
      setDownloadError(null);
      setAcousticJobs({});
      setReviewFilter("all");
      setChapter("analyze");
      setView("workspace");
      void analyzeLocalAudio(song, null, file, [song]);
    },
    [analyzeLocalAudio]
  );

  const groups = useMemo(() => groupByKey(results), [results]);
  const counts = useMemo(
    () =>
      results.reduce<ResultCounts>(
        (summary, result) => {
          summary[result.status]++;
          if (result.source === "manual") summary.manual++;
          if (result.source === "reccobeats") summary.catalogue++;
          return summary;
        },
        {
          classified: 0,
          review: 0,
          not_found: 0,
          error: 0,
          manual: 0,
          catalogue: 0,
        }
      ),
    [results]
  );
  const localAudioBusy = Object.values(acousticJobs).some(
    job => job.state === "analyzing"
  );
  const analysisComplete =
    Boolean(songs?.length) &&
    results.length === songs?.length &&
    pendingSongs.length === 0 &&
    !localAudioBusy;
  const analyzing = progress !== null || localAudioBusy;
  const songById = useMemo(
    () => new Map((songs ?? []).map(song => [song.id, song])),
    [songs]
  );
  const filteredResults = useMemo(() => {
    if (reviewFilter === "manual")
      return results.filter(result => result.source === "manual");
    if (reviewFilter === "needs_attention") {
      return results.filter(result => result.status !== "classified");
    }
    return results;
  }, [results, reviewFilter]);

  const handleDownloadAll = async () => {
    if (downloading || groups.size === 0) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadAllAsZip(groups, results);
      setDeliveryState("downloaded");
    } catch {
      setDownloadError(
        "No hemos podido preparar la descarga esta vez. Puedes volver a intentarlo."
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDrop = (event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  };

  if (view === "home") {
    return (
      <HomeHero
        chapter={chapter}
        onSelect={nextChapter => {
          setChapter(nextChapter);
          setView("workspace");
        }}
      />
    );
  }

  return (
    <div className="tonalizer-app">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="ambient-grid" aria-hidden="true" />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv,application/csv,application/vnd.ms-excel"
        className="sr-only"
        aria-label="Elegir el archivo CSV exportado"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = "";
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*,.mp3,.m4a,.wav,.flac,.ogg,.aac"
        className="sr-only"
        aria-label="Elegir una canción en MP3 u otro formato de audio"
        onChange={event => {
          const file = event.target.files?.[0];
          if (file) handleStandaloneAudio(file);
          event.target.value = "";
        }}
      />

      <main className="app-main">
        <WorkspaceHeader
          chapter={chapter}
          hasSongs={Boolean(songs?.length)}
          analysisComplete={analysisComplete}
          analyzing={analyzing}
          deliveryState={deliveryState}
          saveWarning={saveWarning}
          onSelect={setChapter}
          onHome={() => setView("home")}
          onHelp={openHelp}
        />

        <div
          ref={stageRef}
          className="stage-viewport"
          tabIndex={-1}
          aria-live="polite"
        >
          <div className="stage-transition" key={chapter}>
            {chapter === "export" ? (
              <ExportChapter
                onChooseCsv={() => fileInput.current?.click()}
                onChooseAudio={() => audioInput.current?.click()}
              />
            ) : chapter === "analyze" ? (
              <AnalyzeChapter
                sourceMode={sourceMode}
                parsed={parsed}
                columns={columns}
                songs={songs}
                fileName={fileName}
                results={results}
                duplicateCount={duplicateCount}
                progress={progress}
                readingFile={readingFile}
                error={error}
                dragOver={dragOver}
                pendingCount={pendingSongs.length}
                retryWaitSeconds={
                  providerPauseUntil
                    ? Math.max(
                        0,
                        Math.ceil((providerPauseUntil - pauseClock) / 1_000)
                      )
                    : 0
                }
                showProviderPauseNotice={pauseNoticeVisible}
                analysisComplete={analysisComplete}
                acousticJobs={acousticJobs}
                fileInput={fileInput}
                onDragOver={event => {
                  event.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
                onColumns={applyColumns}
                onConfirmColumns={confirmColumns}
                onAnalyze={() => void analyze()}
                onAnalyzeAudio={(song, result, file) =>
                  void analyzeLocalAudio(song, result, file)
                }
                onChooseAudio={() => audioInput.current?.click()}
                onOpenCorrections={openReview}
                onChangeFile={changeFile}
                onDownload={() => setChapter("download")}
              />
            ) : (
              <DownloadChapter
                results={results}
                groups={groups}
                counts={counts}
                totalSongs={songs?.length ?? 0}
                pendingCount={pendingSongs.length}
                analysisComplete={analysisComplete}
                deliveryState={deliveryState}
                downloading={downloading}
                downloadError={downloadError}
                onGoAnalyze={() => setChapter("analyze")}
                onDownloadAll={() => void handleDownloadAll()}
                onOpenGroups={openGroups}
                onOpenReview={() => setChapter("analyze")}
                onImported={() => setDeliveryState("finished")}
                onStartAgain={() => setResetOpen(true)}
              />
            )}
          </div>
        </div>
      </main>

      <Suspense fallback={null}>
        <Guide open={helpOpen} chapter={chapter} onClose={closeHelp} />
      </Suspense>

      <DetailDrawer
        open={groupsOpen}
        eyebrow="Tus listas"
        title={`${groups.size} tonalidades preparadas`}
        onClose={closeGroups}
      >
        <div className="tone-list">
          {[...groups.entries()].map(([key, list], index) => (
            <div
              className="tone-list-item"
              key={key}
              style={
                {
                  "--tone-color": TONE_COLORS[index % TONE_COLORS.length],
                } as CSSProperties
              }
            >
              <span className="tone-list-icon" aria-hidden="true">
                <AudioLines />
              </span>
              <div>
                <strong>{key}</strong>
                <small>{list.length} canciones</small>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadBlob(`${key}.csv`, buildPlaylistCsv(list))
                }
              >
                <Download aria-hidden="true" />
                Descargar
              </Button>
            </div>
          ))}
        </div>
      </DetailDrawer>

      <DetailDrawer
        open={reviewOpen}
        eyebrow="Opcional"
        title="Correcciones manuales"
        wide
        onClose={closeReview}
      >
        <p className="manual-correction-intro">
          La tonalidad automática y su fuente se conservan hasta que tú elijas
          cambiar una canción expresamente. Corregir aquí no sustituye el
          análisis automático.
        </p>
        <div
          className="review-toolbar"
          role="group"
          aria-label="Filtrar canciones"
        >
          {(
            [
              ["all", "Todas", results.length],
              [
                "needs_attention",
                "Pendientes",
                counts.review + counts.not_found + counts.error,
              ],
              ["manual", "Corregidas", counts.manual],
            ] as Array<[ReviewFilter, string, number]>
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              className={reviewFilter === value ? "is-active" : ""}
              aria-pressed={reviewFilter === value}
              onClick={() => setReviewFilter(value)}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
          {counts.review + counts.not_found + counts.error > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                downloadBlob(
                  "canciones-para-revisar.csv",
                  buildReviewCsv(results)
                )
              }
            >
              <Download aria-hidden="true" />
              Guardar lista aparte
            </Button>
          ) : null}
        </div>

        <div className="review-table-wrap">
          <table className="review-table">
            <thead>
              <tr>
                <th scope="col">Tu canción</th>
                <th scope="col">Lo que encontramos</th>
                <th scope="col">Fuente y tonalidad</th>
                <th scope="col">Corrección opcional</th>
              </tr>
            </thead>
            <tbody>
              {filteredResults.map(result => {
                const song = songById.get(result.inputId);
                const reasons = visibleResultReasons(
                  result,
                  "Necesita una mirada"
                );
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
                          <small>
                            {result.matchedTrack.artists.join(", ")}
                          </small>
                        </>
                      ) : (
                        <span className="empty-value">
                          Todavía sin coincidencia
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={`result-status is-${result.status}`}>
                        {STATUS_LABELS[result.status]}
                      </span>
                      <small>{reasons.join(" · ")}</small>
                      <small>{describeResultProcess(result)}</small>
                      {result.keySpanish ? (
                        <em>
                          {result.keySpanish}
                          {result.camelot ? ` · ${result.camelot}` : ""}
                          {result.bpm ? ` · ${result.bpm} BPM` : ""}
                        </em>
                      ) : null}
                    </td>
                    <td>
                      {song ? (
                        <details className="manual-correction">
                          <summary>Corregir manualmente</summary>
                          <Select
                            value={result.keyOf ?? ""}
                            onValueChange={value =>
                              setTone(
                                song,
                                value as (typeof KEY_OPTIONS)[number]
                              )
                            }
                          >
                            <SelectTrigger
                              aria-label={`Corregir manualmente la tonalidad de ${result.title}`}
                            >
                              <SelectValue placeholder="Elegir tonalidad" />
                            </SelectTrigger>
                            <SelectContent>
                              {KEY_OPTIONS.map(key => (
                                <SelectItem key={key} value={key}>
                                  {keyToSpanish(key)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </details>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredResults.length === 0 ? (
            <div className="review-empty">
              <CheckCircle2 aria-hidden="true" />
              <strong>No hay canciones en este grupo.</strong>
              <span>Puedes elegir otro filtro.</span>
            </div>
          ) : null}
        </div>
      </DetailDrawer>

      <ResetDialog open={resetOpen} onCancel={closeReset} onConfirm={reset} />
    </div>
  );
}
