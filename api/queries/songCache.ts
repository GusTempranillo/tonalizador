import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { getDb } from "./connection";
import { songCache, type SongCacheRow } from "@db/schema";
import type { ClassificationStatus, KeyLookupResult, MatchedTrack, SongInput } from "@contracts/types";
import { keyToSpanish } from "@contracts/keyMap";

export const ALGORITHM_VERSION = "matching-v2";
const PROVIDER_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const NOT_FOUND_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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

export async function findCached(song: SongInput): Promise<SongCacheRow | undefined> {
  const db = getDb();
  const row = await db.query.songCache.findFirst({
    where: eq(songCache.cacheKey, songFingerprint(song)),
  });
  if (!row) return undefined;
  if (row.manual) return row;
  if (row.algorithmVersion !== ALGORITHM_VERSION) return undefined;
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return undefined;
  return row;
}

function expiryFor(status: ClassificationStatus, source: string | null): Date | null {
  if (source === "manual") return null;
  return new Date(
    Date.now() + (status === "not_found" ? NOT_FOUND_TTL_MS : PROVIDER_TTL_MS),
  );
}

export async function saveToCache(
  song: SongInput,
  result: KeyLookupResult,
): Promise<void> {
  if (result.status === "error") return;
  const matched = result.matchedTrack;
  const values = {
    cacheKey: songFingerprint(song),
    artist: song.artists.join(" | "),
    title: song.title,
    album: song.album ?? null,
    isrc: song.isrc ?? null,
    spotifyId: matched?.spotifyId ?? extractSpotifyIdForFingerprint(song.platformUrl),
    status: result.status,
    keyOf: result.keyOf,
    camelot: result.camelot,
    bpm: result.bpm,
    confidenceBp: result.confidence === null ? null : Math.round(result.confidence * 10_000),
    source: result.source,
    matchedTitle: matched?.title ?? null,
    matchedArtists: matched ? JSON.stringify(matched.artists) : null,
    matchedAlbum: matched?.album ?? null,
    matchedIsrc: matched?.isrc ?? null,
    matchedDurationMs: matched?.durationMs ?? null,
    matchedSpotifyUrl: matched?.spotifyUrl ?? null,
    reasonCodes: JSON.stringify(result.reasonCodes),
    algorithmVersion: ALGORITHM_VERSION,
    manual: result.source === "manual",
    updatedAt: new Date(),
    expiresAt: expiryFor(result.status, result.source),
  };
  const db = getDb();
  await db.insert(songCache).values(values).onDuplicateKeyUpdate({ set: values });
}

function parseStringArray(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function cachedRowToResult(song: SongInput, row: SongCacheRow): KeyLookupResult {
  const matchedTrack: MatchedTrack | null = row.spotifyId && row.matchedTitle
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
  return {
    inputId: song.id,
    title: song.title,
    artists: song.artists,
    status: row.status as ClassificationStatus,
    keyOf: row.keyOf,
    keySpanish: keyToSpanish(row.keyOf),
    camelot: row.camelot,
    bpm: row.bpm,
    confidence: row.confidenceBp === null ? null : row.confidenceBp / 10_000,
    source: row.source === "manual" ? "manual" : row.source === "reccobeats" ? "reccobeats" : null,
    matchedTrack,
    reasonCodes: parseStringArray(row.reasonCodes),
    cached: true,
  };
}
