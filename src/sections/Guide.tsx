import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  Clock3,
  Download,
  ExternalLink,
  FileDown,
  FileUp,
  Info,
  Lightbulb,
  ListMusic,
  Play,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Step = {
  label: string;
  short: string;
  title: string;
  description: string;
  time: string;
  icon: LucideIcon;
};

const STEPS: Step[] = [
  {
    label: "El plan",
    short: "Qué vas a hacer",
    title: "Tres movimientos y listo",
    description: "Exporta, analiza y recupera tu música ordenada.",
    time: "2 min de lectura",
    icon: Sparkles,
  },
  {
    label: "Exportar",
    short: "Obtén tu CSV",
    title: "Saca tu música de YouTube",
    description: "Convierte una playlist en un archivo que podamos leer.",
    time: "5–10 min",
    icon: FileDown,
  },
  {
    label: "Analizar",
    short: "Clasifica aquí",
    title: "Deja que hagamos la parte difícil",
    description: "Sube el CSV y recibe tonalidad, Camelot y BPM.",
    time: "Unos minutos",
    icon: UploadCloud,
  },
  {
    label: "Crear",
    short: "Nuevas playlists",
    title: "Devuelve cada tono a su lugar",
    description: "Descarga los grupos e impórtalos de nuevo.",
    time: "5 min",
    icon: ListMusic,
  },
  {
    label: "Resolver",
    short: "Casos especiales",
    title: "Revisa solo lo imprescindible",
    description: "Una salida clara para canciones raras o no encontradas.",
    time: "Cuando haga falta",
    icon: CircleHelp,
  },
];

function Callout({
  children,
  kind = "default",
}: {
  children: ReactNode;
  kind?: "default" | "tip" | "note";
}) {
  const Icon = kind === "tip" ? Lightbulb : kind === "note" ? Info : ShieldCheck;
  return (
    <div className={`guide-callout ${kind === "tip" ? "is-tip" : kind === "note" ? "is-note" : ""}`}>
      <Icon aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

function GuideCard({
  icon: Icon,
  title,
  children,
  wide = false,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  return (
    <Card className={`guide-card ${wide ? "is-wide" : ""}`}>
      <div className="guide-card-heading">
        <span><Icon aria-hidden="true" /></span>
        <h4>{title}</h4>
      </div>
      <div className="guide-body">{children}</div>
    </Card>
  );
}

function ExternalButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Button asChild variant="outline" className="mt-4">
      <a href={href} target="_blank" rel="noopener noreferrer">
        {children}
        <ExternalLink aria-hidden="true" />
      </a>
    </Button>
  );
}

export default function Guide({ goToClassifier }: { goToClassifier: () => void }) {
  const [step, setStep] = useState(0);
  const activeStep = STEPS[step];
  const ActiveIcon = activeStep.icon;

  return (
    <div className="guide-shell">
      <div className="guide-rail" role="tablist" aria-label="Pasos de la guía">
        {STEPS.map((item, index) => (
          <button
            key={item.label}
            id={`guide-tab-${index}`}
            type="button"
            role="tab"
            aria-selected={index === step}
            aria-controls={`guide-step-${index}`}
            className={`guide-step ${index === step ? "is-active" : ""} ${index < step ? "is-complete" : ""}`}
            onClick={() => setStep(index)}
          >
            <span className="guide-step-number" aria-hidden="true">
              {index < step ? <Check className="h-3 w-3" /> : String(index + 1).padStart(2, "0")}
            </span>
            <span className="guide-step-label">
              <strong>{item.label}</strong>
              <small>{item.short}</small>
            </span>
          </button>
        ))}
        <div className="guide-progress" aria-hidden="true">
          <span style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div
        key={step}
        id={`guide-step-${step}`}
        className="guide-content"
        role="tabpanel"
        aria-labelledby={`guide-tab-${step}`}
      >
        <div className="guide-intro">
          <span className="guide-intro-icon"><ActiveIcon aria-hidden="true" /></span>
          <div className="guide-intro-copy">
            <p>Paso {step + 1} de {STEPS.length}</p>
            <h3>{activeStep.title}</h3>
            <span>{activeStep.description}</span>
          </div>
          <span className="guide-time">
            <Clock3 className="mb-1 h-4 w-4" aria-hidden="true" />
            Tiempo estimado
            <strong>{activeStep.time}</strong>
          </span>
        </div>

        {step === 0 && (
          <div className="guide-grid">
            <GuideCard icon={Play} title="El recorrido" wide>
              <ol>
                <li><strong>Exporta</strong> una playlist de YouTube Music como CSV.</li>
                <li><strong>Analízala</strong> aquí para obtener tonalidad y BPM.</li>
                <li><strong>Descarga</strong> las nuevas listas agrupadas y vuelve a importarlas.</li>
              </ol>
              <Callout kind="tip">
                La primera vez suele llevar 15–20 minutos. Después será mucho más rápido porque recordamos las
                canciones ya analizadas.
              </Callout>
            </GuideCard>
            <GuideCard icon={ShieldCheck} title="Lo que necesitas">
              <ul>
                <li>Una playlist de YouTube Music.</li>
                <li>Un ordenador con conexión a internet.</li>
                <li>No necesitas una cuenta Premium.</li>
              </ul>
            </GuideCard>
            <GuideCard icon={Download} title="Lo que obtendrás">
              <ul>
                <li>Un CSV por tonalidad.</li>
                <li>Tonalidad, código Camelot y BPM.</li>
                <li>Una lista separada para revisar.</li>
              </ul>
            </GuideCard>
          </div>
        )}

        {step === 1 && (
          <div className="guide-grid">
            <GuideCard icon={FileDown} title="Con TuneMyMusic" wide>
              <ol>
                <li>Abre TuneMyMusic y conecta tu cuenta de <strong>YouTube Music</strong>.</li>
                <li>Selecciona la playlist que quieres clasificar.</li>
                <li>En “Elegir destino”, baja hasta <strong>Exportar a archivo</strong>.</li>
                <li>Elige <strong>CSV</strong> y guarda el archivo.</li>
              </ol>
              <img
                src="/guia/exportar-archivo.png"
                alt='Opción "Exportar archivo" de TuneMyMusic'
                className="guide-image"
              />
              <ExternalButton href="https://www.tunemymusic.com/transfer/youtube-music-to-file">
                Abrir TuneMyMusic
              </ExternalButton>
              <Callout kind="note">
                La exportación funciona con playlists, no con “Me gusta” sueltos. Si hace falta, crea primero una
                playlist con esas canciones. El plan gratuito admite hasta 500 canciones.
              </Callout>
            </GuideCard>
            <GuideCard icon={FileUp} title="Alternativa: Google Takeout" wide>
              <p>
                En Google Takeout, desmarca todo y selecciona únicamente <strong>YouTube y YouTube Music</strong>.
                Dentro, elige las playlists. Google te enviará los CSV.
              </p>
              <ExternalButton href="https://takeout.google.com">Abrir Google Takeout</ExternalButton>
            </GuideCard>
          </div>
        )}

        {step === 2 && (
          <div className="guide-grid">
            <GuideCard icon={UploadCloud} title="Sube y analiza" wide>
              <ol>
                <li>Abre <strong>Analizar música</strong> y arrastra el CSV.</li>
                <li>Comprueba el número de canciones detectadas.</li>
                <li>Pulsa <strong>Analizar canciones</strong> y sigue el progreso.</li>
                <li>Revisa únicamente los casos marcados como dudosos.</li>
              </ol>
              <Button onClick={goToClassifier} className="mt-4">
                Ir al tonalizador
                <ArrowRight aria-hidden="true" />
              </Button>
              <Callout>
                El archivo se interpreta en tu navegador. Solo se envían los metadatos necesarios para identificar
                cada canción.
              </Callout>
            </GuideCard>
            <GuideCard icon={Sparkles} title="Lectura rápida de tonos" wide>
              <p>Las tonalidades aparecen traducidas. Estas son las equivalencias básicas:</p>
              <div className="tone-grid">
                {["C · Do", "D · Re", "E · Mi", "F · Fa", "G · Sol", "A · La", "B · Si", "m · menor", "sin m · Mayor"].map(
                  (tone) => <span key={tone}>{tone}</span>,
                )}
              </div>
            </GuideCard>
          </div>
        )}

        {step === 3 && (
          <div className="guide-grid">
            <GuideCard icon={Download} title="Descarga los grupos" wide>
              <ol>
                <li>Pulsa <strong>Descargar ZIP</strong> cuando termine el análisis.</li>
                <li>Descomprime el archivo: encontrarás un CSV por tonalidad.</li>
                <li>Abre TuneMyMusic y elige la transferencia <strong>archivo → YouTube Music</strong>.</li>
                <li>Importa cada CSV usando su tonalidad como nombre de playlist.</li>
              </ol>
              <ExternalButton href="https://www.tunemymusic.com/transfer/file-to-youtube-music">
                Importar en TuneMyMusic
              </ExternalButton>
            </GuideCard>
            <GuideCard icon={Info} title="Un detalle útil">
              <p>En Windows y Mac basta con hacer doble clic en el ZIP para ver o extraer los archivos.</p>
            </GuideCard>
            <GuideCard icon={ListMusic} title="El resultado">
              <p>Las playlists aparecerán en YouTube Music y se sincronizarán entre ordenador y móvil.</p>
            </GuideCard>
          </div>
        )}

        {step === 4 && (
          <div className="guide-grid">
            <GuideCard icon={CircleHelp} title="Canciones no encontradas" wide>
              <ol>
                <li>Consigue el archivo de audio de esa canción.</li>
                <li>Analízalo con Tunebat Analyzer.</li>
                <li>Elige la tonalidad manualmente en la tabla de resultados.</li>
              </ol>
              <ExternalButton href="https://tunebat.com/Analyzer">Abrir Tunebat Analyzer</ExternalButton>
              <Callout kind="tip">
                El tonalizador prefiere pedir una revisión antes que asignar una versión o tonalidad incorrecta.
              </Callout>
            </GuideCard>
            <GuideCard icon={Check} title="Antes de terminar">
              <ul>
                <li>No necesitas YouTube Music Premium.</li>
                <li>Las correcciones se guardan en este navegador.</li>
                <li>Puedes repetir el proceso cuando añadas música.</li>
              </ul>
            </GuideCard>
            <GuideCard icon={Sparkles} title="Ya lo tienes">
              <p>La próxima importación será más rápida: las canciones conocidas aparecerán casi al instante.</p>
              <Button onClick={goToClassifier} className="mt-4">
                Empezar ahora
                <ArrowRight aria-hidden="true" />
              </Button>
            </GuideCard>
          </div>
        )}
      </div>

      <div className="guide-actions">
        <Button variant="outline" onClick={() => setStep((current) => current - 1)} disabled={step === 0}>
          <ArrowLeft aria-hidden="true" />
          Anterior
        </Button>
        <span className="guide-actions-count">{String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}</span>
        <Button
          variant={step === STEPS.length - 1 ? "default" : "outline"}
          onClick={() => step === STEPS.length - 1 ? goToClassifier() : setStep((current) => current + 1)}
        >
          {step === STEPS.length - 1 ? "Empezar" : "Siguiente"}
          <ArrowRight aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}
