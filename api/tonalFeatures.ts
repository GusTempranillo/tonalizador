import type { ClassificationSource } from "@contracts/types";
import { PITCH_NAMES, CAMELOT_MAJOR, CAMELOT_MINOR } from "./keyMaps";

export type ServerTonalSource = Exclude<
  ClassificationSource,
  "manual" | "local_acoustic" | null
>;

export interface TonalFeatures {
  keyOf: string;
  camelot: string;
  bpm: number | null;
  tonalConfidence: number | null;
  source: ServerTonalSource;
}

export interface TonalProviderOutcome {
  features: TonalFeatures | null;
  reasonCode: string | null;
  reasonCodes?: string[];
}

export interface TonalLookupOutcome {
  features: TonalFeatures | null;
  reasonCodes: string[];
}

type TonalProvider = () => Promise<TonalProviderOutcome>;

interface ResolveTonalFeaturesOptions {
  spotify: TonalProvider;
  reccobeats: TonalProvider;
  onProviderError?: (provider: ServerTonalSource, error: unknown) => void;
}

function finiteNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Converts a provider payload only when both key and mode are explicit and
 * valid. Spotify's -1 ("no key detected"), missing mode and fractional values
 * are intentionally rejected.
 */
export function normalizeTonalFeatures(
  raw: {
    key?: unknown;
    mode?: unknown;
    tempo?: unknown;
    tonalConfidence?: unknown;
  },
  source: ServerTonalSource
): TonalFeatures | null {
  if (
    !Number.isInteger(raw.key) ||
    (raw.key as number) < 0 ||
    (raw.key as number) >= PITCH_NAMES.length ||
    !Number.isInteger(raw.mode) ||
    (raw.mode !== 0 && raw.mode !== 1)
  ) {
    return null;
  }

  const key = raw.key as number;
  const minor = raw.mode === 0;
  const tempo = finiteNumber(raw.tempo);
  const confidence = finiteNumber(raw.tonalConfidence);
  const camelot = (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[key];
  if (!camelot) return null;

  return {
    keyOf: `${PITCH_NAMES[key]}${minor ? "m" : ""}`,
    camelot,
    bpm: tempo !== null && tempo > 0 && tempo <= 400 ? Math.round(tempo) : null,
    tonalConfidence:
      confidence !== null && confidence >= 0 && confidence <= 1
        ? confidence
        : null,
    source,
  };
}

export class SpotifyAudioFeaturesCircuitBreaker {
  private blockedUntil = 0;
  private readonly cooldownMs: number;
  private readonly now: () => number;

  constructor(cooldownMs = 6 * 60 * 60 * 1000, now: () => number = Date.now) {
    this.cooldownMs = cooldownMs;
    this.now = now;
  }

  isOpen(): boolean {
    return this.blockedUntil > this.now();
  }

  trip(): void {
    this.blockedUntil = this.now() + this.cooldownMs;
  }

  reset(): void {
    this.blockedUntil = 0;
  }
}

/**
 * Runs tonal providers in the product-defined order. A provider failure never
 * prevents the next provider from being attempted.
 */
export async function resolveTonalFeatures({
  spotify,
  reccobeats,
  onProviderError,
}: ResolveTonalFeaturesOptions): Promise<TonalLookupOutcome> {
  const reasonCodes: string[] = [];
  const providers: Array<{
    source: ServerTonalSource;
    run: TonalProvider;
    unavailableReason: string;
    invalidReason: string;
  }> = [
    {
      source: "spotify_audio_features",
      run: spotify,
      unavailableReason: "spotify_audio_features_unavailable",
      invalidReason: "spotify_audio_features_invalid",
    },
    {
      source: "reccobeats",
      run: reccobeats,
      unavailableReason: "reccobeats_unavailable",
      invalidReason: "reccobeats_invalid",
    },
  ];

  for (const provider of providers) {
    try {
      const outcome = await provider.run();
      if (outcome.features?.source === provider.source) {
        return {
          features: outcome.features,
          reasonCodes: [
            ...reasonCodes,
            ...(outcome.reasonCodes ?? []),
            `tonal_source_${provider.source}`,
          ],
        };
      }
      if (outcome.reasonCodes?.length) {
        reasonCodes.push(...outcome.reasonCodes);
      } else {
        reasonCodes.push(
          outcome.reasonCode ??
            (outcome.features
              ? provider.invalidReason
              : provider.unavailableReason)
        );
      }
    } catch (error) {
      reasonCodes.push(provider.unavailableReason);
      onProviderError?.(provider.source, error);
    }
  }

  return { features: null, reasonCodes };
}
