import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioLines,
  Download,
  FileOutput,
  Lightbulb,
  ListChecks,
  X,
} from "lucide-react";
import { keepFocusInside } from "@/lib/focus";

export type Chapter = "export" | "analyze" | "download";

type HelpMode = "instructions" | "reason";

type ChapterHelp = {
  eyebrow: string;
  title: string;
  instructions: string[];
  reason: string;
  analogy: string;
};

const HELP: Record<Chapter, ChapterHelp> = {
  export: {
    eyebrow: "Importar",
    title: "Trae tus canciones",
    instructions: [
      "Pulsa «Abrir TuneMyMusic». Se abrirá otra página sin cerrar Tonalizador.",
      "En TuneMyMusic, elige YouTube Music como servicio de origen y sigue sus indicaciones para acceder a tus playlists.",
      "Selecciona únicamente la playlist que quieres ordenar por tonalidad.",
      "Elige exportarla a un archivo y selecciona el formato CSV. El archivo se guardará normalmente en la carpeta Descargas de tu dispositivo.",
      "Vuelve a Tonalizador, pulsa «Ya tengo el archivo CSV» y elige el archivo que acabas de guardar.",
      "Si solo quieres conocer la tonalidad de una canción que ya tienes en el dispositivo, pulsa «Analizar una canción de mi dispositivo» y elige directamente su archivo MP3. En ese caso no necesitas crear ningún CSV.",
    ],
    reason:
      "Para ordenar una playlist completa, la herramienta necesita saber qué canciones contiene. El archivo CSV funciona como una lista: incluye datos como el título y el artista, pero no contiene la música ni modifica la playlist original. Si eliges una sola canción en MP3 u otro formato de audio compatible, Tonalizador analiza directamente ese archivo en el navegador y no necesita la lista CSV.",
    analogy:
      "Es como entregar el índice de una biblioteca: antes de ordenar los libros por categorías, necesitamos una lista de los títulos que hay.",
  },
  analyze: {
    eyebrow: "Analizar",
    title: "Identifica la tonalidad",
    instructions: [
      "Pulsa «Elegir el archivo CSV de mi playlist» y busca en tu dispositivo el archivo terminado en .csv que guardaste con TuneMyMusic.",
      "Comprueba el nombre del archivo y el número de canciones encontradas. Si no es la playlist correcta, puedes elegir otro archivo antes de continuar.",
      "Pulsa «Analizar mis canciones». Puedes dejar que termine; el progreso se guarda automáticamente en este navegador.",
      "Cuando acabe, revisa la tonalidad mostrada junto a cada canción. Spotify identifica la canción y ReccoBeats proporciona la tonalidad y los BPM.",
      "Si una canción de la playlist queda sin tonalidad o el resultado no es suficientemente fiable, pulsa «Analizar audio» junto a ella y selecciona su MP3, M4A, WAV, FLAC, OGG o AAC.",
      "También puedes analizar una canción sin importar una playlist: pulsa «Elegir un MP3 de mi dispositivo», selecciona el archivo y espera a que aparezcan la tonalidad y los BPM. Tonalizador analiza la canción completa, por lo que en un móvil puede tardar varios minutos y consumir más batería.",
    ],
    reason:
      "Con una playlist, la herramienta lee los títulos y artistas del CSV. Spotify identifica cada canción y ayuda a confirmar que se trata de la grabación correcta; después, ReccoBeats proporciona la tonalidad y los BPM. En los resultados lo resumimos así: «Spotify identificó la canción. Tonalidad obtenida de ReccoBeats». Cuando seleccionas un MP3 u otro archivo de audio, el proceso es diferente: Tonalizador decodifica y analiza el archivo completo, de principio a fin, y combina la información tonal de todos sus tramos para calcular localmente la tonalidad y los BPM. El archivo no se envía al servidor, no sale del dispositivo y no se conserva.",
    analogy:
      "El CSV es como una lista con los nombres de varios libros; el MP3 es como entregar directamente un libro para examinarlo. En ambos casos obtenemos una clasificación, pero solo el segundo permite analizar el contenido real del archivo.",
  },
  download: {
    eyebrow: "Descargar",
    title: "Recoge tus nuevas listas",
    instructions: [
      "Comprueba el resumen: verás cuántas canciones están clasificadas y cuántas necesitan revisión.",
      "Si hay canciones dudosas, revísalas antes de descargar o guarda su lista aparte para corregirlas más tarde.",
      "Pulsa «Descargar todas las listas». Recibirás un archivo llamado playlists-por-tonalidad.zip.",
      "Abre o descomprime el archivo ZIP. Dentro encontrarás un CSV por cada tonalidad, un resumen general y, si hace falta, un archivo con las canciones pendientes de revisar.",
      "Importa en YouTube Music los CSV de las tonalidades que quieras utilizar. Puedes hacerlo con TuneMyMusic siguiendo el proceso inverso al del primer paso.",
    ],
    reason:
      "La herramienta separa las canciones clasificadas en varios archivos CSV: uno por cada tonalidad. Dentro de cada archivo mantiene el orden en el que aparecían las canciones en la playlist original. El ZIP sirve para descargar todas esas listas juntas de una sola vez.",
    analogy:
      "Es como recibir varias cajas ya etiquetadas y una hoja con el resumen: cada caja contiene las canciones de una tonalidad y tú decides cuáles quieres volver a guardar en YouTube Music.",
  },
};

const CHAPTER_ICON = {
  export: FileOutput,
  analyze: AudioLines,
  download: Download,
} satisfies Record<Chapter, typeof FileOutput>;

export default function Guide({
  open,
  chapter,
  onClose,
}: {
  open: boolean;
  chapter: Chapter;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<HelpMode>("instructions");
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const content = HELP[chapter];
  const Icon = CHAPTER_ICON[chapter];
  const close = useCallback(() => {
    setMode("instructions");
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
      else keepFocusInside(event, drawerRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, [chapter, close, open]);

  if (!open) return null;

  return (
    <div className="dialog-layer" role="presentation" onMouseDown={close}>
      <aside
        ref={drawerRef}
        className="help-drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
        tabIndex={-1}
        onMouseDown={event => event.stopPropagation()}
      >
        <div className="drawer-handle" aria-hidden="true" />
        <header className="help-header">
          <span className="help-icon" aria-hidden="true">
            <Icon />
          </span>
          <div>
            <p>{content.eyebrow}</p>
            <h2 id="help-title">{content.title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="icon-button"
            onClick={close}
            aria-label="Cerrar ayuda"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="help-tabs" role="tablist" aria-label="Tipo de ayuda">
          <button
            id="help-tab-instructions"
            type="button"
            role="tab"
            aria-selected={mode === "instructions"}
            aria-controls="help-panel"
            className={mode === "instructions" ? "is-active" : ""}
            onClick={() => setMode("instructions")}
          >
            <ListChecks aria-hidden="true" />
            ¿Qué tienes que hacer?
          </button>
          <button
            id="help-tab-reason"
            type="button"
            role="tab"
            aria-selected={mode === "reason"}
            aria-controls="help-panel"
            className={mode === "reason" ? "is-active" : ""}
            onClick={() => setMode("reason")}
          >
            <Lightbulb aria-hidden="true" />
            ¿Qué hace la herramienta?
          </button>
        </div>

        <div
          id="help-panel"
          className="help-content"
          role="tabpanel"
          aria-labelledby={
            mode === "instructions"
              ? "help-tab-instructions"
              : "help-tab-reason"
          }
        >
          {mode === "instructions" ? (
            <ol className="help-steps">
              {content.instructions.map((instruction, index) => (
                <li key={instruction}>
                  <span>{index + 1}</span>
                  <p>{instruction}</p>
                </li>
              ))}
            </ol>
          ) : (
            <div className="help-reason">
              <p>{content.reason}</p>
              <blockquote>
                <Lightbulb aria-hidden="true" />
                <span>{content.analogy}</span>
              </blockquote>
            </div>
          )}
        </div>

        <footer className="help-footer">
          <span />
          <p>Cierra esta ayuda para volver al paso en el que estabas.</p>
        </footer>
      </aside>
    </div>
  );
}
