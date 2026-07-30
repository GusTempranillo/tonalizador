import type { KeyLookupResult } from "@contracts/types";

const ANALYSIS_SERVER_UNAVAILABLE =
  "No se ha podido contactar con el servidor de análisis. La interfaz está abierta, pero el servicio que calcula las tonalidades no está disponible.";

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.trim();
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message.trim();
  }
  return "";
}

export function analysisRequestErrorMessage(error: unknown): string {
  const message = errorMessage(error);
  if (/demasiadas solicitudes|too many requests/i.test(message)) {
    return "Se han hecho demasiadas consultas seguidas. Espera un minuto y vuelve a intentarlo.";
  }
  return ANALYSIS_SERVER_UNAVAILABLE;
}

export function incompleteAnalysisMessage(
  count: number,
  results: KeyLookupResult[]
): string {
  const reasons = new Set(results.flatMap(result => result.reasonCodes));

  if (reasons.has("spotify_not_configured")) {
    return "Este servidor no tiene configurada la conexión con Spotify. El archivo está bien; falta activar el servicio de análisis.";
  }

  if (reasons.has("provider_rate_limited")) {
    return "Estrella, no has hecho nada mal. Spotify ha pausado temporalmente las consultas y ReccoBeats no ha podido confirmar una coincidencia exacta. Tus canciones siguen guardadas.";
  }

  if (reasons.has("provider_temporarily_unavailable")) {
    return "Spotify o ReccoBeats no han respondido. Tus canciones siguen guardadas; puedes volver a intentarlo.";
  }

  return `${count === 1 ? "Una canción no ha respondido" : `${count} canciones no han respondido`} esta vez. Puedes continuar cuando quieras.`;
}
