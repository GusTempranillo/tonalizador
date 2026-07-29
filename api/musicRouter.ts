import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  findCached,
  saveToCache,
  cachedRowToResult,
} from "./queries/songCache";
import { keyToSpanish } from "@contracts/keyMap";
import { PITCH_NAMES, CAMELOT_MAJOR, CAMELOT_MINOR } from "./keyMaps";
import { titleVariants, cleanArtist } from "./searchVariants";
import {
  extractSpotifyTrackId,
  isHighConfidenceMatch,
  rankCandidates,
  type SpotifyTrackCandidate,
} from "./matching";
import { providerFetch } from "./lib/http";
import { env } from "./lib/env";
import { enforceBatchRateLimit } from "./security";
import type {
  ClassificationStatus,
  KeyLookupResult,
  MatchedTrack,
  SongInput,
} from "@contracts/types";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API = "https://api.spotify.com/v1";
const RECCO_API = "https://api.reccobeats.com/v1";

const songSchema = z.object({
  id: z.string().min(1).max(256),
  title: z.string().min(1).max(512),
  artists: z.array(z.string().min(1).max(512)).min(1).max(20),
  album: z.string().max(512).nullish(),
  isrc: z.string().max(32).nullish(),
  platformUrl: z.string().max(1024).nullish(),
  durationMs: z
    .number()
    .int()
    .positive()
    .max(24 * 60 * 60 * 1000)
    .nullish(),
  position: z.number().int().nonnegative().optional(),
});

type SpotifyTrack = {
  id: string;
  name: string;
  artists: Array<{ name: string }>;
  album?: { name?: string };
  duration_ms?: number;
  external_ids?: { isrc?: string };
  external_urls?: { spotify?: string };
};

type TonalFeatures = {
  keyOf: string;
  camelot: string | null;
  bpm: number | null;
};

let spotifyToken: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;

async function getSpotifyToken(): Promise<string> {
  if (!env.spotifyClientId || !env.spotifyClientSecret) {
    throw new Error("spotify_not_configured");
  }
  if (spotifyToken && spotifyToken.expiresAt > Date.now() + 30_000)
    return spotifyToken.value;
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const response = await providerFetch(
      SPOTIFY_TOKEN_URL,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${env.spotifyClientId}:${env.spotifyClientSecret}`
          ).toString("base64")}`,
        },
        body: "grant_type=client_credentials",
      },
      { provider: "spotify" }
    );
    if (!response.ok) throw new Error(`spotify_auth_${response.status}`);
    const data = (await response.json()) as {
      access_token: string;
      expires_in: number;
    };
    spotifyToken = {
      value: data.access_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    return data.access_token;
  })();
  try {
    return await tokenPromise;
  } finally {
    tokenPromise = null;
  }
}

function toCandidate(track: SpotifyTrack): SpotifyTrackCandidate {
  return {
    spotifyId: track.id,
    title: track.name,
    artists: track.artists.map(artist => artist.name),
    album: track.album?.name ?? null,
    isrc: track.external_ids?.isrc ?? null,
    durationMs: track.duration_ms ?? null,
    spotifyUrl: track.external_urls?.spotify ?? null,
  };
}

function normalizeFeatures(features: {
  key?: number;
  mode?: number;
  tempo?: number;
}): TonalFeatures | null {
  if (
    features.key === undefined ||
    features.key < 0 ||
    features.key >= PITCH_NAMES.length
  ) {
    return null;
  }
  const minor = features.mode === 0;
  return {
    keyOf: `${PITCH_NAMES[features.key]}${minor ? "m" : ""}`,
    camelot: (minor ? CAMELOT_MINOR : CAMELOT_MAJOR)[features.key] ?? null,
    bpm: features.tempo ? Math.round(features.tempo) : null,
  };
}

async function spotifyGetTrack(
  id: string,
  token: string
): Promise<SpotifyTrackCandidate | null> {
  const response = await providerFetch(
    `${SPOTIFY_API}/tracks/${encodeURIComponent(id)}?market=${encodeURIComponent(env.spotifyMarket)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { provider: "spotify" }
  );
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`spotify_track_${response.status}`);
  return toCandidate((await response.json()) as SpotifyTrack);
}

async function spotifySearch(
  query: string,
  token: string
): Promise<SpotifyTrackCandidate[]> {
  const url = new URL(`${SPOTIFY_API}/search`);
  url.searchParams.set("q", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("limit", "10");
  url.searchParams.set("market", env.spotifyMarket);
  const response = await providerFetch(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    { provider: "spotify" }
  );
  if (!response.ok) throw new Error(`spotify_search_${response.status}`);
  const data = (await response.json()) as {
    tracks?: { items?: SpotifyTrack[] };
  };
  return (data.tracks?.items ?? []).map(toCandidate);
}

async function spotifyAudioFeatures(
  spotifyId: string
): Promise<TonalFeatures | null> {
  const token = await getSpotifyToken();
  const response = await providerFetch(
    `${SPOTIFY_API}/audio-features/${encodeURIComponent(spotifyId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { provider: "spotify" }
  );

  // Spotify restricts this endpoint for some newer applications. In that case,
  // continue with the catalogue fallback instead of failing the whole song.
  if ([401, 403, 404].includes(response.status)) return null;
  if (!response.ok)
    throw new Error(`spotify_audio_features_${response.status}`);

  return normalizeFeatures(
    (await response.json()) as { key?: number; mode?: number; tempo?: number }
  );
}

type Identification = {
  status: "accepted" | "review" | "not_found";
  track: MatchedTrack | null;
  confidence: number | null;
  reasons: string[];
};

async function identifyTrack(song: SongInput): Promise<Identification> {
  const token = await getSpotifyToken();
  const directId = extractSpotifyTrackId(song.platformUrl);
  if (directId) {
    const track = await spotifyGetTrack(directId, token);
    return track
      ? {
          status: "accepted",
          track,
          confidence: 1,
          reasons: ["spotify_id_exact"],
        }
      : {
          status: "not_found",
          track: null,
          confidence: null,
          reasons: ["spotify_id_not_found"],
        };
  }

  if (song.isrc?.trim()) {
    const candidates = await spotifySearch(`isrc:${song.isrc.trim()}`, token);
    const exact = candidates.find(
      candidate =>
        candidate.isrc?.toUpperCase() === song.isrc?.trim().toUpperCase()
    );
    if (exact) {
      return {
        status: "accepted",
        track: exact,
        confidence: 1,
        reasons: ["isrc_exact"],
      };
    }
  }

  const primaryArtist = cleanArtist(song.artists[0] ?? "");
  const byId = new Map<string, SpotifyTrackCandidate>();
  for (const variant of titleVariants(song.title)) {
    const query = `track:${variant} artist:${primaryArtist}`;
    for (const candidate of await spotifySearch(query, token)) {
      byId.set(candidate.spotifyId, candidate);
    }
  }
  const ranked = rankCandidates(song, [...byId.values()]);
  const best = ranked[0];
  if (!best) {
    return {
      status: "not_found",
      track: null,
      confidence: null,
      reasons: ["no_catalogue_candidate"],
    };
  }
  if (isHighConfidenceMatch(best, ranked[1])) {
    return {
      status: "accepted",
      track: best.track,
      confidence: best.score,
      reasons: ["metadata_high_confidence"],
    };
  }
  const reasons = ["ambiguous_catalogue_match"];
  if (best.titleScore < 0.85) reasons.push("title_below_threshold");
  if (best.artistScore < 0.8) reasons.push("artist_below_threshold");
  if (ranked[1] && best.score - ranked[1].score < 0.1)
    reasons.push("runner_up_too_close");
  if (best.usedAggressiveTitleVariant) reasons.push("version_marker_removed");
  return {
    status: best.score >= 0.6 ? "review" : "not_found",
    track: best.score >= 0.6 ? best.track : null,
    confidence: best.score,
    reasons,
  };
}

async function reccobeatsFeatures(
  spotifyId: string
): Promise<TonalFeatures | null> {
  const mapResponse = await providerFetch(
    `${RECCO_API}/track?ids=${encodeURIComponent(spotifyId)}`,
    {},
    { provider: "reccobeats" }
  );
  if (!mapResponse.ok)
    throw new Error(`reccobeats_track_${mapResponse.status}`);
  const mapping = (await mapResponse.json()) as {
    content?: Array<{ id: string }>;
  };
  const internalId = mapping.content?.[0]?.id;
  if (!internalId) return null;

  const featureResponse = await providerFetch(
    `${RECCO_API}/track/${encodeURIComponent(internalId)}/audio-features`,
    {},
    { provider: "reccobeats" }
  );
  if (featureResponse.status === 404) return null;
  if (!featureResponse.ok)
    throw new Error(`reccobeats_features_${featureResponse.status}`);

  // ReccoBeats has removed key/mode from some responses. Keep compatibility
  // with catalogue entries that still provide them, but do not depend on it.
  return normalizeFeatures(
    (await featureResponse.json()) as {
      key?: number;
      mode?: number;
      tempo?: number;
    }
  );
}

async function getTonalFeatures(
  spotifyId: string
): Promise<TonalFeatures | null> {
  const spotifyFeatures = await spotifyAudioFeatures(spotifyId);
  if (spotifyFeatures) return spotifyFeatures;
  return reccobeatsFeatures(spotifyId);
}

function baseResult(
  song: SongInput,
  status: ClassificationStatus,
  options: Partial<KeyLookupResult> = {}
): KeyLookupResult {
  return {
    inputId: song.id,
    title: song.title,
    artists: song.artists,
    status,
    keyOf: null,
    keySpanish: null,
    camelot: null,
    bpm: null,
    confidence: null,
    source: null,
    matchedTrack: null,
    reasonCodes: [],
    cached: false,
    ...options,
  };
}

async function classifySong(song: SongInput): Promise<KeyLookupResult> {
  try {
    const cached = await findCached(song);
    if (cached) return cachedRowToResult(song, cached);

    const identification = await identifyTrack(song);
    if (identification.status !== "accepted" || !identification.track) {
      const result = baseResult(
        song,
        identification.status === "review" ? "review" : "not_found",
        {
          matchedTrack: identification.track,
          confidence: identification.confidence,
          reasonCodes: identification.reasons,
        }
      );
      await saveToCache(song, result);
      return result;
    }

    const features = await getTonalFeatures(identification.track.spotifyId);
    if (!features) {
      const result = baseResult(song, "review", {
        matchedTrack: identification.track,
        confidence: identification.confidence,
        reasonCodes: [...identification.reasons, "tonal_features_missing"],
      });
      await saveToCache(song, result);
      return result;
    }
    const result = baseResult(song, "classified", {
      keyOf: features.keyOf,
      keySpanish: keyToSpanish(features.keyOf),
      camelot: features.camelot,
      bpm: features.bpm,
      confidence: identification.confidence,
      source: "reccobeats",
      matchedTrack: identification.track,
      reasonCodes: identification.reasons,
    });
    await saveToCache(song, result);
    return result;
  } catch (error) {
    const reason =
      error instanceof Error && error.message === "spotify_not_configured"
        ? "spotify_not_configured"
        : "provider_temporarily_unavailable";
    console.error("[classify_song_failed]", {
      reason,
      error: error instanceof Error ? error.message : String(error),
    });
    return baseResult(song, "error", { reasonCodes: [reason] });
  }
}

export const musicRouter = createRouter({
  lookupBatch: publicQuery
    .input(z.object({ songs: z.array(songSchema).min(1).max(20) }))
    .mutation(async ({ input, ctx }) => {
      enforceBatchRateLimit(ctx.req);
      const startedAt = Date.now();
      const results: KeyLookupResult[] = [];
      for (const song of input.songs) results.push(await classifySong(song));
      console.info("[lookup_batch]", results.length, Date.now() - startedAt);
      return { results };
    }),
});