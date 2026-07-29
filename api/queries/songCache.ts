import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./connection";
import { songCache, type SongCacheRow } from "@db/schema";
import type {
  ClassificationSource,
  ClassificationStatus,
  KeyLookupResult,
  MatchedTrack,
  SongInput,
} from "@contracts/types";
import { KEY_OPTIONS, keyToSpanish } from "@contracts/keyMap";

export const ALGORITHM_VERSION = "matching-v4";
const PROVIDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const CACHEABLE_TONAL_SOURCES = new Set<ClassificationSource>([
  "spotify_audio_features",
  "reccobeats",
  "manual",
]);

export function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

export function songFingerprint(song: SongInput): string {
  const spotifyId = extractSpotifyIdForFingerprint(song.platformUrl);
  const identity = song.isrc
    ? `isrc:${normalize(song.isrc)}`
    : spotifyId
      ? `spotify:${spotifyId}`
      : JSON.stringify({
          title: normalize(song.title),
          artists: song.artists.map(normalize),
          album: normalize(song.album ?? ""),
        });
  return createHash("sha256").update(identity).digest("hex");
}

function extractSpotifyIdForFingerprint(value?: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(?:spotify:track:|\/track\/)([A-Za-z0-9]{22})/i);
  return match?.[1] ?? null;
}

export async function findCached(
  song: SongInput
): Promise<SongCacheRow | undefined> {
  const db = getDb();
  const row = await db.query.songCache.findFirst({
    where: eq(songCache.cacheKey, songFingerprint(song)),
  });
  return row && isReusableCacheEntry(row) ? row : undefined;
}

export function isReusableCacheEntry(
  row: Pick<SongCacheRow, "manual" | "algorithmVersion" | "expiresAt">,
  now = Date.now()
): boolean {
  // Manual corrections remain in storage for audit/history, but they must
  // never short-circuit the automatic tonal pipeline.
  if (row.manual) return false;
  if (row.algorithmVersion !== ALGORITHM_VERSION) return false;
  if (row.expiresAt && row.expiresAt.getTime() <= now) return false;
  return true;
}

function expiryFor(
  status: ClassificationStatus,
  source: string | null
): Date | null {
  if (source === "manual") return null;
  return new Date(
    Date.now() + (status === "not_found" ? NOT_FOUND_TTL_MS : PROVIDER_TTL_MS)
  );
}

export async function saveToCache(
  song: SongInput,
  result: KeyLookupResult
): Promise<void> {
  // Browser-side acoustic analysis is deliberately ephemeral: never upload or
  // persist its result from this server cache path.
  if (result.status === "error" || result.source === "local_acoustic") return;
  const matched = result.matchedTrack;
  const validClassifiedResult =
    result.status !== "classified" ||
    (isSupportedKey(result.keyOf) &&
      CACHEABLE_TONAL_SOURCES.has(result.source));
  const status = validClassifiedResult ? result.status : "review";
  const values = {
    cacheKey: songFingerprint(song),
    artist: song.artists.join(" | "),
    title: song.title,
    album: song.album ?? null,
    isrc: song.isrc ?? null,
    spotifyId:
      matched?.spotifyId ?? extractSpotifyIdForFingerprint(song.platformUrl),
    status,
    keyOf: status === "classified" ? result.keyOf : null,
    camelot: status === "classified" ? result.camelot : null,
    bpm: status === "classified" ? result.bpm : null,
    confidenceBp: toBasisPoints(result.confidence),
    tonalConfidenceBp:
      status === "classified" ? toBasisPoints(result.tonalConfidence) : null,
    source: status === "classified" ? result.source : null,
    matchedTitle: matched?.title ?? null,
    matchedArtists: matched ? JSON.stringify(matched.artists) : null,
    matchedAlbum: matched?.album ?? null,
    matchedIsrc: matched?.isrc ?? null,
    matchedDurationMs: matched?.durationMs ?? null,
    matchedSpotifyUrl: matched?.spotifyUrl ?? null,
    reasonCodes: JSON.stringify(
      validClassifiedResult
        ? result.reasonCodes
        : [...result.reasonCodes, "invalid_classification_not_cached"]
    ),
    algorithmVersion: ALGORITHM_VERSION,
    manual: status === "classified" && result.source === "manual",
    updatedAt: new Date(),
    expiresAt: expiryFor(
      status,
      status === "classified" ? result.source : null
    ),
  };
  const db = getDb();
  await db
    .insert(songCache)
    .values(values)
    .onDuplicateKeyUpdate({ set: values });
}

export async function saveToCacheBestEffort(
  song: SongInput,
  result: KeyLookupResult,
  save: (
    song: SongInput,
    result: KeyLookupResult
  ) => Promise<void> = saveToCache
): Promise<boolean> {
  try {
    await save(song, result);
    return true;
  } catch (error) {
    console.warn(
      "[cache_write_failed]",
      error instanceof Error ? error.message : String(error)
    );
    return false;
  }
}

function toBasisPoints(value: number | null): number | null {
  return value !== null && Number.isFinite(value) && value >= 0 && value <= 1
    ? Math.round(value * 10_000)
    : null;
}

function isSupportedKey(value: string | null): boolean {
  return value !== null && (KEY_OPTIONS as readonly string[]).includes(value);
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
}

function parseSource(value: string | null): ClassificationSource {
  switch (value) {
    case "spotify_audio_features":
    case "reccobeats":
    case "manual":
      return value;
    default:
      return null;
  }
}

export function cachedRowToResult(
  song: SongInput,
  row: SongCacheRow
): KeyLookupResult {
  const matchedTrack: MatchedTrack | null =
    row.spotifyId && row.matchedTitle
      ? {
          spotifyId: row.spotifyId,
          title: row.matchedTitle,
          artists: parseStringArray(row.matchedArtists),
          album: row.matchedAlbum,
          isrc: row.matchedIsrc,
          durationMs: row.matchedDurationMs,
          spotifyUrl: row.matchedSpotifyUrl,
        }
      : null;
  const source = parseSource(row.source);
  const validClassification =
    row.status !== "classified" ||
    (isSupportedKey(row.keyOf) && CACHEABLE_TONAL_SOURCES.has(source));
  const status = validClassification
    ? (row.status as ClassificationStatus)
    : "review";
  const keyOf = status === "classified" ? row.keyOf : null;
  const reasonCodes = parseStringArray(row.reasonCodes);
  return {
    inputId: song.id,
    title: song.title,
    artists: song.artists,
    status,
    keyOf,
    keySpanish: keyToSpanish(keyOf),
    camelot: status === "classified" ? row.camelot : null,
    bpm: status === "classified" ? row.bpm : null,
    confidence: row.confidenceBp === null ? null : row.confidenceBp / 10_000,
    tonalConfidence:
      status === "classified" && row.tonalConfidenceBp !== null
        ? row.tonalConfidenceBp / 10_000
        : null,
    source: status === "classified" ? source : null,
    matchedTrack,
    reasonCodes: validClassification
      ? reasonCodes
      : [...reasonCodes, "invalid_cached_classification"],
    cached: true,
  };
}
