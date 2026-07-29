import { Component, type ErrorInfo, type ReactNode } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  private clearProgressAndReload = () => {
    try {
      localStorage.removeItem("tonalizador-analysis-v2");
    } finally {
      window.location.reload();
    }
  };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[tonalizador_render]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="app-error-state">
          <span aria-hidden="true">
            <Sparkles />
          </span>
          <p>Solo ha sido un tropiezo</p>
          <h1>No hemos podido abrir esta parte.</h1>
          <p>
            Tu progreso sigue guardado. Recarga la aplicación y continuamos
            donde lo dejamos.
          </p>
          <Button size="lg" onClick={() => window.location.reload()}>
            <RefreshCw aria-hidden="true" />
            Volver a intentarlo
          </Button>
          <button
            type="button"
            className="text-action app-error-reset"
            onClick={this.clearProgressAndReload}
          >
            Empezar de nuevo sin el progreso guardado
          </button>
        </main>
      );
    }

    return this.props.children;
  }
}
