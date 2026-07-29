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
    eyebrow: "Exportar",
    title: "Trae tus canciones",
    instructions: [
      "Abre TuneMyMusic.",
      "Elige YouTube Music como origen.",
      "Selecciona la playlist que quieres ordenar.",
      "Guárdala como archivo y vuelve aquí.",
    ],
    reason:
      "Para ordenar tu música, primero necesitamos una lista con los títulos y los artistas. Tu archivo se queda en este navegador.",
    analogy:
      "Es como ordenar una biblioteca: antes de colocar los libros por temas, necesitamos saber cuáles hay.",
  },
  analyze: {
    eyebrow: "Analizar",
    title: "Déjanos hacer la parte difícil",
    instructions: [
      "Suelta aquí el archivo que acabas de guardar.",
      "Comprueba cuántas canciones hemos encontrado.",
      "Pulsa «Analizar canciones».",
      "Deja esta ventana abierta mientras terminamos.",
    ],
    reason:
      "Buscamos cada canción y descubrimos su tonalidad de forma automática. Si una coincidencia no está clara, la apartamos para que puedas revisarla.",
    analogy:
      "Es parecido a reconocer si una voz suena más grave o más aguda, pero aplicado a toda tu playlist.",
  },
  download: {
    eyebrow: "Descargar",
    title: "Recoge tus nuevas listas",
    instructions: [
      "Comprueba el resumen.",
      "Pulsa «Descargar todas las listas».",
      "Descomprime el archivo que recibirás.",
      "Importa cada lista de nuevo en YouTube Music.",
    ],
    reason:
      "Creamos una lista independiente por cada tonalidad, manteniendo el orden original de tus canciones.",
    analogy:
      "Es como recibir varias cajas ya etiquetadas: solo tienes que guardarlas donde prefieras.",
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
            Qué tengo que hacer
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
            Por qué lo hacemos
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
