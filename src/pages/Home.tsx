import { lazy, Suspense, useState } from "react";
import { Music, BookOpen, Loader2 } from "lucide-react";

const Classifier = lazy(() => import("@/sections/Classifier"));
const Guide = lazy(() => import("@/sections/Guide"));

type Tab = "clasificar" | "guia";

export default function Home() {
  const [tab, setTab] = useState<Tab>("guia");

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1c1c1e]">
      <main className="mx-auto max-w-3xl px-4 py-6 sm:py-8">
        <header className="relative mb-7 text-center">
          <p className="mb-1 text-[13px] font-medium uppercase tracking-wide text-[#6e6e73]">⭐ La web de</p>
          <h1 className="mb-1.5 bg-gradient-to-r from-[#1c1c1e] via-[#4a4a4e] to-[#1c1c1e] bg-clip-text text-[34px] font-bold sm:text-4xl">
            Estrella
          </h1>
          <p className="mb-1 text-[16px] font-medium">🎵 Clasifica tus canciones por tonalidad</p>
          <p className="text-[14px] text-[#6e6e73]">Precisión primero, con revisión de los casos dudosos</p>
        </header>

        <nav
          className="mb-6 flex gap-2 rounded-2xl border border-[#e5e5ea] bg-white p-1.5 shadow-sm"
          role="tablist"
          aria-label="Secciones principales"
        >
          <button
            id="tab-clasificar"
            role="tab"
            aria-selected={tab === "clasificar"}
            aria-controls="panel-clasificar"
            onClick={() => setTab("clasificar")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1e] ${
              tab === "clasificar" ? "bg-[#1c1c1e] text-white" : "text-[#6e6e73] hover:bg-[#f2f2f7]"
            }`}
          >
            <Music className="h-4 w-4" aria-hidden="true" /> Clasificar
          </button>
          <button
            id="tab-guia"
            role="tab"
            aria-selected={tab === "guia"}
            aria-controls="panel-guia"
            onClick={() => setTab("guia")}
            className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1c1c1e] ${
              tab === "guia" ? "bg-[#1c1c1e] text-white" : "text-[#6e6e73] hover:bg-[#f2f2f7]"
            }`}
          >
            <BookOpen className="h-4 w-4" aria-hidden="true" /> Guía paso a paso
          </button>
        </nav>

        <section
          id={tab === "clasificar" ? "panel-clasificar" : "panel-guia"}
          role="tabpanel"
          aria-labelledby={tab === "clasificar" ? "tab-clasificar" : "tab-guia"}
        >
          <Suspense
            fallback={
              <div className="flex min-h-40 items-center justify-center" aria-label="Cargando sección">
                <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
              </div>
            }
          >
            {tab === "clasificar" ? <Classifier /> : <Guide goToClassifier={() => setTab("clasificar")} />}
          </Suspense>
        </section>

        <footer className="mt-10 space-y-1 px-4 text-center text-xs text-[#8e8e93]">
          <p>⭐ Preparado con cariño para <strong>Estrella</strong> ⭐</p>
          <p>Identificación: Spotify · Tonalidad y BPM: ReccoBeats · Revisión: Tunebat</p>
        </footer>
      </main>
    </div>
  );
}
