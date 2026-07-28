import { TRPCError } from "@trpc/server";

const WINDOW_MS = 60_000;
const MAX_BATCHES_PER_WINDOW = 30;
const rateWindows = new Map<string, { count: number; resetAt: number }>();

function clientKey(req: Request): string {
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ||
    "local-client"
  );
}

export function enforceBatchRateLimit(req: Request): void {
  const key = clientKey(req);
  const now = Date.now();
  if (rateWindows.size > 10_000) {
    for (const [candidate, window] of rateWindows) {
      if (window.resetAt <= now) rateWindows.delete(candidate);
    }
  }
  const current = rateWindows.get(key);
  if (!current || current.resetAt <= now) {
    rateWindows.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return;
  }
  current.count++;
  if (current.count > MAX_BATCHES_PER_WINDOW) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Demasiadas solicitudes. Espera un minuto y reanuda el análisis.",
    });
  }
}
