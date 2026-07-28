type FetchImplementation = typeof fetch;

interface ProviderFetchOptions {
  provider: "spotify" | "reccobeats";
  timeoutMs?: number;
  maxAttempts?: number;
  fetchImpl?: FetchImplementation;
}

class OutboundGate {
  private active = 0;
  private readonly queue: Array<() => void> = [];
  private lastStartedAt = 0;
  private readonly concurrency: number;
  private readonly minimumStartIntervalMs: number;

  constructor(concurrency: number, minimumStartIntervalMs: number) {
    this.concurrency = concurrency;
    this.minimumStartIntervalMs = minimumStartIntervalMs;
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) {
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active++;
    const waitMs = Math.max(0, this.lastStartedAt + this.minimumStartIntervalMs - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    this.lastStartedAt = Date.now();
    try {
      return await operation();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

const gate = new OutboundGate(2, 250);

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function retryAfterMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.min(seconds * 1000, 30_000);
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.min(Math.max(0, date - Date.now()), 30_000);
  }
  return Math.min(500 * 2 ** (attempt - 1) + Math.floor(Math.random() * 250), 5_000);
}

export async function providerFetch(
  input: string | URL,
  init: RequestInit,
  options: ProviderFetchOptions,
): Promise<Response> {
  const {
    timeoutMs = 10_000,
    maxAttempts = 3,
    fetchImpl = fetch,
    provider,
  } = options;
  let lastError: unknown = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await gate.run(async () => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          return await fetchImpl(input, { ...init, signal: controller.signal });
        } finally {
          clearTimeout(timer);
        }
      });
      if ((response.status === 429 || response.status >= 500) && attempt < maxAttempts) {
        console.warn("[provider_retry]", provider, response.status, attempt);
        await sleep(retryAfterMs(response, attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt >= maxAttempts) break;
      console.warn("[provider_retry]", provider, "network", attempt);
      await sleep(Math.min(500 * 2 ** (attempt - 1), 5_000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${provider} no disponible`);
}
