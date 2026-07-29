export * from "./errors";

export type ClassificationStatus = "classified" | "review" | "not_found" | "error";
export type ClassificationSource =
  | "spotify_audio_features"
  | "reccobeats"
  | "local_acoustic"
  | "manual"
  | null;

export interface SongInput {
  /** Stable client-side identifier used to resume interrupted analyses. */
  id: string;
  title: string;
  /** Artist text is never split on commas; every source value is preserved verbatim. */
  artists: string[];
  album?: string | null;
  isrc?: string | null;
  platformUrl?: string | null;
  durationMs?: number | null;
  /** Original playlist position, used to preserve export order. */
  position?: number;
}

export interface MatchedTrack {
  spotifyId: string;
  title: string;
  artists: string[];
  album: string | null;
  isrc: string | null;
  durationMs: number | null;
  spotifyUrl: string | null;
}

export interface KeyLookupResult {
  inputId: string;
  title: string;
  artists: string[];
  status: ClassificationStatus;
  keyOf: string | null;
  keySpanish: string | null;
  camelot: string | null;
  bpm: number | null;
  /** 0..1 confidence in the catalogue match, not in musical ground truth. */
  confidence: number | null;
  /** 0..1 confidence in the tonal estimate, when the provider exposes one. */
  tonalConfidence: number | null;
  source: ClassificationSource;
  matchedTrack: MatchedTrack | null;
  reasonCodes: string[];
  cached: boolean;
}

export interface LookupBatchResponse {
  results: KeyLookupResult[];
}

export interface ManualOverrideInput {
  song: SongInput;
  keyOf: string;
}
