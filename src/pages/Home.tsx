import { lazy, Suspense, useRef, useState } from "react";
import {
  ArrowRight,
  AudioWaveform,
  BookOpen,
  Check,
  ChevronRight,
  FileDown,
  Loader2,
  LockKeyhole,
  Music2,
  Sparkles,
  Upload,
  WandSparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const Classifier = lazy(() => import("@/sections/Classifier"));
const Guide = lazy(() => import("@/sections/Guide"));

type Tab = "clasificar" | "guia";

const DEMO_TRACKS = [
  { title: "Blinding Lights", artist: "The Weeknd", keyName: "Do♯ Mayor", camelot: "3B", bpm: "171" },
  { title: "Dreams", artist: "Fleetwood Mac", keyName: "Fa Mayor", camelot: "7B", bpm: "120" },
  { title: "Midnight City", artist: "M83", keyName: "Si menor", camelot: "10A", bpm: "105" },
];

export default function Home() {
  const [tab, setTab] = useState<Tab>("clasificar");
  const workspaceRef = useRef<HTMLElement>(null);

  const openTab = (nextTab: Tab, scroll = false) => {
    setTab(nextTab);
    if (scroll) {
      window.setTimeout(() => workspaceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Tonalizador de Estrella, inicio">
          <span className="brand-mark" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span>
            <strong>Estrella</strong>
            <small>Tonalizador</small>
          </span>
        </a>

        <nav className="topbar-nav" aria-label="Secciones principales">
          <button
            type="button"
            className={tab === "clasificar" ? "is-active" : ""}
            aria-current={tab === "clasificar" ? "page" : undefined}
            onClick={() => openTab("clasificar", true)}
          >
            <AudioWaveform aria-hidden="true" />
            Analizar
          </button>
          <button
            type="button"
            className={tab === "guia" ? "is-active" : ""}
            aria-current={tab === "guia" ? "page" : undefined}
            onClick={() => openTab("guia", true)}
          >
            <BookOpen aria-hidden="true" />
            Guía
          </button>
        </nav>

        <span className="privacy-badge">
          <LockKeyhole aria-hidden="true" />
          Privado por diseño
        </span>
      </header>

      <main id="inicio">
        <section className="hero">
          <div className="hero-copy">
            <p className="eyebrow">
              <Sparkles aria-hidden="true" />
              Clasificación musical inteligente
            </p>
            <h1>
              Toda tu música,
              <span>en su tono.</span>
            </h1>
            <p className="hero-description">
              Convierte cualquier playlist en colecciones ordenadas por tonalidad y BPM. Preciso, visual y listo
              para volver a escuchar.
            </p>
            <div className="hero-actions">
              <Button size="lg" onClick={() => openTab("clasificar", true)}>
                Analizar mi playlist
                <ArrowRight aria-hidden="true" />
              </Button>
              <Button variant="ghost" size="lg" onClick={() => openTab("guia", true)}>
                Ver cómo funciona
                <ChevronRight aria-hidden="true" />
              </Button>
            </div>
            <div className="hero-assurances" aria-label="Ventajas">
              <span><Check aria-hidden="true" /> CSV en el navegador</span>
              <span><Check aria-hidden="true" /> Revisión precisa</span>
              <span><Check aria-hidden="true" /> Exportación en un clic</span>
            </div>
          </div>

          <div className="result-visual" aria-label="Ejemplo del resultado final">
            <div className="visual-glow" aria-hidden="true" />
            <div className="result-window">
              <div className="result-window-header">
                <div>
                  <span className="result-overline">Biblioteca analizada</span>
                  <strong>328 canciones</strong>
                </div>
                <span className="result-status"><Check aria-hidden="true" /> Completo</span>
              </div>

              <div className="result-summary">
                <div className="summary-orb">
                  <WandSparkles aria-hidden="true" />
                  <span>96%</span>
                </div>
                <div>
                  <strong>315 clasificadas</strong>
                  <span>13 listas listas para exportar</span>
                </div>
              </div>

              <div className="track-list">
                {DEMO_TRACKS.map((track, index) => (
                  <div className="demo-track" key={track.title}>
                    <span className="track-number">0{index + 1}</span>
                    <span className="track-wave" aria-hidden="true">
                      <i /><i /><i /><i /><i />
                    </span>
                    <span className="track-name">
                      <strong>{track.title}</strong>
                      <small>{track.artist}</small>
                    </span>
                    <span className="track-key">
                      <strong>{track.keyName}</strong>
                      <small>{track.camelot} · {track.bpm} BPM</small>
                    </span>
                  </div>
                ))}
              </div>

              <div className="result-footer">
                <span><Music2 aria-hidden="true" /> 24 tonalidades</span>
                <span className="export-pill"><FileDown aria-hidden="true" /> Exportar ZIP</span>
              </div>
            </div>

            <div className="floating-note floating-note-top" aria-hidden="true">
              <span className="note-icon"><Upload /></span>
              <span><small>Importación</small><strong>playlist.csv</strong></span>
              <Check />
            </div>
            <div className="floating-note floating-note-bottom" aria-hidden="true">
              <span className="mini-key">8A</span>
              <span><small>Grupo destacado</small><strong>La menor · 42 temas</strong></span>
            </div>
          </div>
        </section>

        <section className="workspace-section" id="herramienta" ref={workspaceRef}>
          <div className="workspace-heading">
            <div>
              <p className="section-kicker">{tab === "clasificar" ? "Tu espacio de trabajo" : "Guía esencial"}</p>
              <h2>{tab === "clasificar" ? "Empieza con una playlist" : "De tu biblioteca a nuevas playlists"}</h2>
            </div>
            <p>
              {tab === "clasificar"
                ? "Sube el archivo y deja que el tonalizador haga el trabajo."
                : "Cinco pasos claros, sin tecnicismos ni rodeos."}
            </p>
          </div>

          <div className="workspace-tabs" role="tablist" aria-label="Herramienta y guía">
            <button
              id="tab-clasificar"
              type="button"
              role="tab"
              aria-selected={tab === "clasificar"}
              aria-controls="panel-principal"
              className={tab === "clasificar" ? "is-active" : ""}
              onClick={() => setTab("clasificar")}
            >
              <span className="tab-icon"><AudioWaveform aria-hidden="true" /></span>
              <span><strong>Analizar música</strong><small>Importa y clasifica</small></span>
            </button>
            <button
              id="tab-guia"
              type="button"
              role="tab"
              aria-selected={tab === "guia"}
              aria-controls="panel-principal"
              className={tab === "guia" ? "is-active" : ""}
              onClick={() => setTab("guia")}
            >
              <span className="tab-icon"><BookOpen aria-hidden="true" /></span>
              <span><strong>Guía paso a paso</strong><small>Todo lo que necesitas</small></span>
            </button>
          </div>

          <section
            id="panel-principal"
            className="workspace-panel"
            role="tabpanel"
            aria-labelledby={tab === "clasificar" ? "tab-clasificar" : "tab-guia"}
          >
            <Suspense
              fallback={
                <div className="section-loader" aria-label="Cargando sección">
                  <Loader2 aria-hidden="true" />
                </div>
              }
            >
              {tab === "clasificar" ? <Classifier /> : <Guide goToClassifier={() => openTab("clasificar")} />}
            </Suspense>
          </section>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand footer-brand">
          <span className="brand-mark" aria-hidden="true"><span /><span /><span /></span>
          <span><strong>Estrella</strong><small>Tonalizador</small></span>
        </div>
        <p>Preparado con cariño para escuchar la música de otra manera.</p>
        <span className="footer-signature">Hecho para Estrella <Sparkles aria-hidden="true" /></span>
      </footer>
    </div>
  );
}
