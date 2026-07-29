import { lazy, Suspense } from "react";
import { AudioLines } from "lucide-react";
import { AppErrorBoundary } from "@/components/AppErrorBoundary";

const TonalizerExperience = lazy(() => import("@/sections/Classifier"));

function AppLoadingState() {
  return (
    <main className="app-loading" aria-label="Preparando Tonalizador">
      <div className="app-loading-mark" aria-hidden="true">
        <AudioLines />
      </div>
      <div className="app-loading-copy">
        <strong>Tonalizador</strong>
        <span>Preparando tu espacio…</span>
      </div>
    </main>
  );
}

export default function Home() {
  return (
    <AppErrorBoundary>
      <Suspense fallback={<AppLoadingState />}>
        <TonalizerExperience />
      </Suspense>
    </AppErrorBoundary>
  );
}
