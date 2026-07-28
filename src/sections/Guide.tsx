import { useState, type ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Info,
  FileDown,
  UploadCloud,
  ListMusic,
  LifeBuoy,
  ExternalLink,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";

function Note({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#fff9e6] border-l-4 border-[#ffcc00] rounded-r-xl p-3.5 text-[13px] text-[#5c4b00] mt-3">
      {children}
    </div>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="bg-[#e8f5e9] border-l-4 border-[#34c759] rounded-r-xl p-3.5 text-[13px] text-[#1b5e20] mt-3">
      {children}
    </div>
  );
}

function ExtLink({ href, children, dark = true }: { href: string; children: ReactNode; dark?: boolean }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium mt-3 transition-opacity hover:opacity-85 ${
        dark ? "bg-[#1c1c1e] text-white" : "bg-white text-[#1c1c1e] border border-[#d1d1d6]"
      }`}
    >
      <ExternalLink className="w-4 h-4" /> {children}
    </a>
  );
}

function StepCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Card className="p-5 rounded-2xl border-[#e5e5ea] shadow-sm mb-4">
      <h2 className="flex items-center gap-2.5 text-[15px] font-semibold text-[#1c1c1e] mb-3">
        <span className="text-[#1c1c1e]">{icon}</span> {title}
      </h2>
      <div className="text-[14px] leading-relaxed text-[#3a3a3c] [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_p]:mb-2.5">
        {children}
      </div>
    </Card>
  );
}

const STEPS = [
  { label: "1. Cómo funciona", icon: <Info className="w-5 h-5" /> },
  { label: "2. Exporta tu música", icon: <FileDown className="w-5 h-5" /> },
  { label: "3. Analiza aquí", icon: <UploadCloud className="w-5 h-5" /> },
  { label: "4. Crea las playlists", icon: <ListMusic className="w-5 h-5" /> },
  { label: "5. Si algo falla", icon: <LifeBuoy className="w-5 h-5" /> },
];

export default function Guide({ goToClassifier }: { goToClassifier: () => void }) {
  const [step, setStep] = useState(0);

  return (
    <div>
      {/* Barra de progreso */}
      <div className="h-1.5 bg-[#e5e5ea] rounded-full mb-4 overflow-hidden">
        <div
          className="h-full bg-[#1c1c1e] rounded-full transition-all"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      {/* Navegación por pasos */}
      <div
        className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-5"
        role="tablist"
        aria-label="Pasos de la guía"
      >
        {STEPS.map((s, i) => (
          <button
            key={i}
            role="tab"
            aria-selected={i === step}
            aria-controls={`guide-step-${i}`}
            onClick={() => setStep(i)}
            className={`min-h-11 px-3 py-2 rounded-xl text-[12px] leading-tight font-medium border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1e] ${
              i === step
                ? "bg-[#1c1c1e] text-white border-[#1c1c1e]"
                : "bg-white text-[#6e6e73] border-[#d1d1d6] hover:bg-[#f2f2f7]"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div id={`guide-step-${step}`} role="tabpanel">
      {step === 0 && (
        <>
          <StepCard icon={<Info className="w-5 h-5" />} title="¿Qué vamos a hacer?">
            <p>
              Vamos a ordenar tus canciones de <strong>YouTube Music</strong> en playlists según su{" "}
              <strong>tonalidad</strong> (Do Mayor, La menor…). Esta página lo hace <strong>casi todo sola</strong>:
            </p>
            <ol>
              <li>Sacas la lista de tus canciones con una web gratuita (TuneMyMusic).</li>
              <li>La subes aquí y esta página averigua la tonalidad de todas de golpe.</li>
              <li>Descargas las listas ya separadas por tonalidad y las conviertes en playlists de YouTube Music con otro par de clics.</li>
            </ol>
            <Note>
              <strong>La primera vez</strong> tardarás unos 15-20 minutos. Las siguientes veces
              (cuando añadas canciones nuevas) serán 5 minutos, porque esta página recuerda
              las que ya analizó antes.
            </Note>
          </StepCard>
          <StepCard icon={<ListMusic className="w-5 h-5" />} title="¿Qué necesitas?">
            <ul>
              <li>Tu cuenta de YouTube Music (la gratis vale)</li>
              <li>Un ordenador con internet (en el móvil es más incómodo)</li>
              <li>Seguir esta guía paso a paso, sin saltarte nada 😊</li>
            </ul>
          </StepCard>
        </>
      )}

      {step === 1 && (
        <>
          <StepCard icon={<FileDown className="w-5 h-5" />} title="Exporta tu lista de canciones">
            <p>Vamos a sacar todas tus canciones de YouTube Music en un solo archivo (un CSV):</p>
            <ol>
              <li>Entra en <strong>TuneMyMusic</strong> con el botón de abajo (te lleva <em>directo</em> a la exportación de YouTube Music).</li>
              <li>Conecta tu cuenta de <strong>YouTube Music</strong> (entra con tu Google).</li>
              <li>Marca la <strong>playlist</strong> que quieras clasificar (puedes marcar varias).
                <Note>
                  <strong>¡Importante!</strong> La exportación a archivo <strong>solo funciona con playlists</strong>.
                  No vale con "canciones favoritas / me gusta" sueltas, ni álbumes, ni artistas.
                  Si tus canciones están en "Me gusta", créales antes una playlist en YouTube Music:
                  abre "Me gusta", toca ⋮ (o selecciona las canciones) → <em>"Añadir a playlist"</em> → <em>"Nueva playlist"</em>.
                </Note>
              </li>
              <li>Pulsa <strong>"Choose Destination" / "Elegir destino"</strong> y <strong>baja hasta el FINAL de la lista</strong>.
                Verás muchas plataformas (Spotify, Apple Music…): sigue bajando, que debajo de todas está
                <strong>"Exportar a archivo"</strong> (este botón):</li>
            </ol>
            <img
              src="/guia/exportar-archivo.png"
              alt='Botón "Exportar archivo" de TuneMyMusic'
              className="rounded-xl border border-[#e5e5ea] my-2 w-44 shadow-sm"
            />
            <ol start={5}>
              <li>Elige formato <strong>CSV</strong> y descarga el archivo. ¡Ya lo tienes!</li>
            </ol>
            <ExtLink href="https://www.tunemymusic.com/transfer/youtube-music-to-file">
              Abrir TuneMyMusic (directo a exportar)
            </ExtLink>
            <Note>
              <strong>Trampa frecuente:</strong> si acabas en una página que dice <em>"¡Tu página para compartir está lista!"</em>
              con botones de Spotify, Apple Music, etc., has entrado en <strong>Compartir</strong>, que no sirve.
              Vuelve atrás y usa <strong>Transferir / "Let's start"</strong>.
            </Note>
            <Note>
              <strong>Límite del plan gratis:</strong> TuneMyMusic exporta hasta 500 canciones gratis.
              Si tienes más, exporta por partes (varias playlists) o consulta el precio actualizado del plan Premium.
            </Note>
          </StepCard>
          <StepCard icon={<FileDown className="w-5 h-5" />} title="Alternativa: Google Takeout">
            <p>
              Si TuneMyMusic te da problemas, también puedes usar{" "}
              <a href="https://takeout.google.com" target="_blank" rel="noopener" className="underline font-medium">Google Takeout</a>:
              desmarca todo, marca solo <strong>YouTube y YouTube Music</strong>, y dentro elige las playlists.
              Google te enviará un enlace de descarga con los CSV.
            </p>
          </StepCard>
        </>
      )}

      {step === 2 && (
        <>
          <StepCard icon={<UploadCloud className="w-5 h-5" />} title="Sube el archivo y analiza">
            <ol>
              <li>Ve a la pestaña <strong>🎵 Clasificar</strong> de esta página.</li>
              <li>Arrastra el CSV que has descargado a la zona punteada (o haz clic y elígelo).</li>
              <li>Verás cuántas canciones se han cargado. Pulsa <strong>"Analizar canciones"</strong>.</li>
              <li>Espera: verás una barra de progreso. Con 300 canciones suele tardar unos minutos.</li>
              <li>Al terminar tendrás tus canciones agrupadas por tonalidad, ya traducidas al español.</li>
            </ol>
            <Button onClick={goToClassifier} className="mt-3">
              Ir a Clasificar <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
            <Tip>
              <strong>Truco:</strong> las canciones que ya analizaste alguna vez salen al instante,
              porque esta página las recuerda. Repetir el proceso con tu biblioteca actualizada es rapidísimo.
            </Tip>
          </StepCard>
          <StepCard icon={<Info className="w-5 h-5" />} title="Equivalencias de tonalidades">
            <p>Verás las tonalidades ya traducidas al español, pero por si las ves en inglés en otras webs:</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {["C = Do", "D = Re", "E = Mi", "F = Fa", "G = Sol", "A = La", "B = Si", "m = menor", "sin m = Mayor"].map(
                (b) => (
                  <span key={b} className="px-3 py-1 rounded-lg bg-[#e3f2fd] text-[#1565c0] text-xs font-medium">
                    {b}
                  </span>
                ),
              )}
            </div>
          </StepCard>
        </>
      )}

      {step === 3 && (
        <>
          <StepCard icon={<ListMusic className="w-5 h-5" />} title="Convierte los CSV en playlists de YouTube Music">
            <ol>
              <li>En la pestaña <strong>🎵 Clasificar</strong>, pulsa <strong>"Descargar todas (ZIP)"</strong> y descomprime el ZIP (doble clic).</li>
              <li>Tendrás un archivo por tonalidad: <em>"Do Mayor.csv"</em>, <em>"La menor.csv"</em>…</li>
              <li>Vuelve a <strong>TuneMyMusic</strong> con el botón de abajo (va <em>directo</em> a subir archivo → YouTube Music).</li>
              <li>Sube uno de los CSV.</li>
              <li>Ponle de nombre a la playlist el de la tonalidad (<em>"Do Mayor"</em>) y confirma.</li>
              <li>Repite con cada CSV. Al terminar, abre YouTube Music: ¡allí están tus listas!</li>
            </ol>
            <ExtLink href="https://www.tunemymusic.com/transfer/file-to-youtube-music">
              Abrir TuneMyMusic (directo a subir archivo)
            </ExtLink>
            <Note>
              <strong>Recuerda el límite de 500 canciones</strong> del plan gratis de TuneMyMusic (cuentan las que
              exportaste en el paso 2 + las que importes ahora). Si te pasas, las alternativas son: un mes de
              Premium, o crear las playlists a mano en YouTube Music mirando los CSV.
            </Note>
            <Tip>
              <strong>¿Cómo descomprimo el ZIP?</strong> En Windows: doble clic y arrastra los archivos fuera.
              En Mac: doble clic y aparece la carpeta sola.
            </Tip>
          </StepCard>
        </>
      )}

      {step === 4 && (
        <>
          <StepCard icon={<LifeBuoy className="w-5 h-5" />} title="Canciones no encontradas">
            <p>
              Algunas canciones (música muy minoritaria, versiones raras, directos) no están en las bases de datos.
              Las verás en la caja amarilla <strong>"no encontradas"</strong>. Para esas:
            </p>
            <ol>
              <li>Descarga esa canción en MP3 (o consigue el archivo de audio).</li>
              <li>Entra en <strong>Tunebat Analyzer</strong> (botón de abajo).</li>
              <li>Arrastra el archivo de audio y en segundos te dice la tonalidad.</li>
              <li>Añade esa canción a mano a la playlist correspondiente en YouTube Music.</li>
            </ol>
            <ExtLink href="https://tunebat.com/Analyzer" dark={false}>Abrir Tunebat Analyzer</ExtLink>
          </StepCard>
          <StepCard icon={<Info className="w-5 h-5" />} title="Consejos finales">
            <ul>
              <li><strong>No necesitas YouTube Music Premium</strong> en ningún paso.</li>
              <li>Si una canción cambia de tonalidad a mitad, ponla donde predomine.</li>
              <li>Cuando tengas canciones nuevas: repite desde el paso 2. Las antiguas saldrán al instante.</li>
              <li>Las playlists se sincronizan solas entre tu móvil y tu ordenador.</li>
              <li>Si te atascas, vuelve a esta guía y repite el paso con calma. ¡Tú puedes! 🎶</li>
            </ul>
          </StepCard>
        </>
      )}

      </div>

      {/* Flechas */}
      <div className="flex justify-between mt-2 pt-4 border-t border-[#e5e5ea]">
        <Button variant="outline" onClick={() => setStep(step - 1)} disabled={step === 0}>
          <ArrowLeft className="w-4 h-4 mr-1" /> Anterior
        </Button>
        <Button variant="outline" onClick={() => setStep(step + 1)} disabled={step === STEPS.length - 1}>
          {step === STEPS.length - 1 ? "¡Listo! 🎉" : "Siguiente"} <ArrowRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}
