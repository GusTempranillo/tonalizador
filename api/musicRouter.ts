import { z } from "zod";
import { createRouter, publicQuery } from "./middleware";
import {
  findCached,
  saveToCacheBestEffort,
  cachedRowToResult,
} from "./queries/songCache";
import { keyToSpanish } from "@contracts/keyMap";
import { titleVariants, cleanArtist } from "./searchVariants";
import {
  catalogueMatchReason,
  extractSpotifyTrackId,
  findMeaningfulRunnerUp,
  rankCandidates,
  type SpotifyTrackCandidate,
} from "./matching";
import { providerFetch } from "./lib/http";
import { mapWithConcurrency } from "./lib/concurrency";
import { env } from "./lib/env";
import { enforceBatchRateLimit } from "./security";
import { findReccoSearchMatch } from "./reccobeatsSearch";
import {
  normalizeTonalFeatures,
  resolveTonalFeatures,
  SpotifyAudioFeaturesCircuitBreaker,
  type TonalLookupOutcome,
  type TonalProviderOutcome,
} from "./tonalFeatures";
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

let spotifyToken: { value: string; expiresAt: number } | null = null;
let tokenPromise: Promise<string> | null = null;
const spotifyAudioFeaturesBreaker = new SpotifyAudioFeaturesCircuitBreaker();

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
): Promise<TonalProviderOutcome> {
  if (spotifyAudioFeaturesBreaker.isOpen()) {
    return {
      features: null,
      reasonCode: "spotify_audio_features_circuit_open",
    };
  }

  const token = await getSpotifyToken();
  const response = await providerFetch(
    `${SPOTIFY_API}/audio-features/${encodeURIComponent(spotifyId)}`,
    { headers: { Authorization: `Bearer ${token}` } },
    { provider: "spotify" }
  );

  if (response.status === 403) {
    spotifyAudioFeaturesBreaker.trip();
    console.warn("[spotify_audio_features_disabled]", "forbidden");
    return {
      features: null,
      reasonCode: "spotify_audio_features_forbidden",
    };
  }
  if (response.status === 401) {
    spotifyToken = null;
    return {
      features: null,
      reasonCode: "spotify_audio_features_unauthorized",
    };
  }
  if (response.status === 404) {
    return {
      features: null,
      reasonCode: "spotify_audio_features_not_found",
    };
  }
  if (!response.ok)
    throw new Error(`spotify_audio_features_${response.status}`);

  const features = normalizeTonalFeatures(
    (await response.json()) as {
      key?: unknown;
      mode?: unknown;
      tempo?: unknown;
    },
    "spotify_audio_features"
  );
  return {
    features,
    reasonCode: features ? null : "spotify_audio_features_invalid",
  };
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
  const competitors = ranked.slice(1);
  const matchReason = catalogueMatchReason(best, competitors);
  if (matchReason) {
    return {
      status: "accepted",
      track: best.track,
      confidence: best.score,
      reasons: [matchReason],
    };
  }
  const meaningfulRunnerUp = findMeaningfulRunnerUp(best, competitors);
  const reasons = ["ambiguous_catalogue_match"];
  if (best.titleScore < 0.85) reasons.push("title_below_threshold");
  if (best.artistScore < 0.8) reasons.push("artist_below_threshold");
  if (meaningfulRunnerUp && best.score - meaningfulRunnerUp.score < 0.1)
    reasons.push("runner_up_too_close");
  if (best.usedAggressiveTitleVariant) reasons.push("version_marker_removed");
  return {
    status: best.score >= 0.6 ? "review" : "not_found",
    track: best.score >= 0.6 ? best.track : null,
    confidence: best.score,
    reasons,
  };
}

async function fetchReccoAudioFeatures(
  internalId: string
): Promise<TonalProviderOutcome> {
  const featureResponse = await providerFetch(
    `${RECCO_API}/track/${encodeURIComponent(internalId)}/audio-features`,
    {},
    { provider: "reccobeats" }
  );
  if (featureResponse.status === 404) {
    return { features: null, reasonCode: "reccobeats_not_found" };
  }
  if (!featureResponse.ok)
    throw new Error(`reccobeats_features_${featureResponse.status}`);

  const features = normalizeTonalFeatures(
    (await featureResponse.json()) as {
      key?: unknown;
      mode?: unknown;
      tempo?: unknown;
    },
    "reccobeats"
  );
  return {
    features,
    reasonCode: features ? null : "reccobeats_invalid",
  };
}

async function searchReccoExactMatch(
  reference: {
    spotifyId?: string | null;
    title: string;
    artists: string[];
    isrc?: string | null;
    durationMs?: number | null;
  },
  budgetMs = 8_000
) {
  const startedAt = Date.now();
  return findReccoSearchMatch(reference, async page => {
    const remainingMs = budgetMs - (Date.now() - startedAt);
    if (remainingMs <= 0) {
      throw new Error("reccobeats_search_budget_exceeded");
    }
    const url = new URL(`${RECCO_API}/track/search`);
    url.searchParams.set("searchText", reference.title);
    url.searchParams.set("page", String(page));
    const response = await providerFetch(
      url,
      {},
      {
        provider: "reccobeats",
        maxAttempts: 1,
        timeoutMs: Math.min(5_000, remainingMs),
      }
    );
    if (!response.ok) {
      throw new Error(`reccobeats_search_${response.status}`);
    }
    return (await response.json()) as {
      content?: unknown;
      page?: unknown;
      totalPages?: unknown;
    };
  });
}

async function reccobeatsFeatures(
  reference: MatchedTrack
): Promise<TonalProviderOutcome> {
  const reasonCodes: string[] = [];

  try {
    const mapResponse = await providerFetch(
      `${RECCO_API}/track?ids=${encodeURIComponent(reference.spotifyId)}`,
      {},
      { provider: "reccobeats" }
    );
    if (mapResponse.ok) {
      const mapping = (await mapResponse.json()) as {
        content?: Array<{ id?: unknown }>;
      };
      const internalId =
        typeof mapping.content?.[0]?.id === "string"
          ? mapping.content[0].id
          : null;
      if (internalId) {
        try {
          const direct = await fetchReccoAudioFeatures(internalId);
          if (direct.features) {
            return {
              ...direct,
              reasonCodes: ["reccobeats_direct_id_match"],
            };
          }
          reasonCodes.push(
            direct.reasonCode ?? "reccobeats_direct_features_missing"
          );
        } catch (error) {
          reasonCodes.push("reccobeats_direct_features_unavailable");
          console.warn(
            "[reccobeats_direct_features_failed]",
            error instanceof Error ? error.message : String(error)
          );
        }
      } else {
        reasonCodes.push("reccobeats_direct_id_not_found");
      }
    } else {
      reasonCodes.push("reccobeats_direct_id_unavailable");
    }
  } catch (error) {
    reasonCodes.push("reccobeats_direct_id_unavailable");
    console.warn(
      "[reccobeats_direct_lookup_failed]",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const match = await searchReccoExactMatch(reference);
    if (!match) {
      return {
        features: null,
        reasonCode: null,
        reasonCodes: [...reasonCodes, "reccobeats_search_no_exact_match"],
      };
    }

    const searched = await fetchReccoAudioFeatures(match.internalId);
    if (searched.features) {
      return {
        ...searched,
        reasonCodes: [...reasonCodes, match.reasonCode],
      };
    }
    return {
      features: null,
      reasonCode: null,
      reasonCodes: [
        ...reasonCodes,
        match.reasonCode,
        searched.reasonCode ?? "reccobeats_search_features_missing",
      ],
    };
  } catch (error) {
    console.warn(
      "[reccobeats_search_failed]",
      error instanceof Error ? error.message : String(error)
    );
    return {
      features: null,
      reasonCode: null,
      reasonCodes: [...reasonCodes, "reccobeats_search_unavailable"],
    };
  }
}

async function getTonalFeatures(
  reference: MatchedTrack
): Promise<TonalLookupOutcome> {
  return resolveTonalFeatures({
    spotify: () => spotifyAudioFeatures(reference.spotifyId),
    reccobeats: () => reccobeatsFeatures(reference),
    onProviderError(provider, error) {
      console.warn(
        "[tonal_provider_failed]",
        provider,
        error instanceof Error ? error.message : String(error)
      );
    },
  });
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
    tonalConfidence: null,
    source: null,
    matchedTrack: null,
    reasonCodes: [],
    cached: false,
    ...options,
  };
}

function isSpotifyRateLimit(error: unknown): boolean {
  return (
    error instanceof Error &&
    /^spotify_(?:auth|track|search|audio_features)_429$/.test(error.message)
  );
}

async function classifyWithReccoFallback(
  song: SongInput
): Promise<KeyLookupResult | null> {
  const spotifyId = extractSpotifyTrackId(song.platformUrl);
  const match = await searchReccoExactMatch(
    {
      spotifyId,
      title: song.title,
      artists: song.artists,
      isrc: song.isrc,
      durationMs: song.durationMs,
    },
    6_000
  );
  if (!match) return null;

  const tonal = await fetchReccoAudioFeatures(match.internalId);
  if (!tonal.features) return null;

  const candidate = match.track;
  const features = tonal.features;
  const result = baseResult(song, "classified", {
    keyOf: features.keyOf,
    keySpanish: keyToSpanish(features.keyOf),
    camelot: features.camelot,
    bpm: features.bpm,
    confidence:
      match.reasonCode === "reccobeats_search_exact_metadata" ? 0.95 : 1,
    tonalConfidence: features.tonalConfidence,
    source: features.source,
    matchedTrack: {
      spotifyId: candidate.spotifyId ?? spotifyId ?? "",
      title: candidate.title,
      artists: candidate.artists,
      album: song.album ?? null,
      isrc: candidate.isrc,
      durationMs: candidate.durationMs,
      spotifyUrl: candidate.spotifyId
        ? `https://open.spotify.com/track/${candidate.spotifyId}`
        : null,
    },
    reasonCodes: [
      "catalogue_fallback_exact_match",
      match.reasonCode,
      "tonal_source_reccobeats",
    ],
  });
  await saveToCacheBestEffort(song, result);
  return result;
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
      await saveToCacheBestEffort(song, result);
      return result;
    }

    const tonalLookup = await getTonalFeatures(identification.track);
    if (!tonalLookup.features) {
      const result = baseResult(song, "review", {
        matchedTrack: identification.track,
        confidence: identification.confidence,
        reasonCodes: [
          ...identification.reasons,
          ...tonalLookup.reasonCodes,
          "tonal_features_missing",
        ],
      });
      await saveToCacheBestEffort(song, result);
      return result;
    }
    const features = tonalLookup.features;
    const result = baseResult(song, "classified", {
      keyOf: features.keyOf,
      keySpanish: keyToSpanish(features.keyOf),
      camelot: features.camelot,
      bpm: features.bpm,
      confidence: identification.confidence,
      tonalConfidence: features.tonalConfidence,
      source: features.source,
      matchedTrack: identification.track,
      reasonCodes: [...identification.reasons, ...tonalLookup.reasonCodes],
    });
    await saveToCacheBestEffort(song, result);
    return result;
  } catch (error) {
    if (isSpotifyRateLimit(error)) {
      try {
        const fallback = await classifyWithReccoFallback(song);
        if (fallback) {
          console.info("[spotify_rate_limit_fallback]", "classified");
          return fallback;
        }
        console.warn("[spotify_rate_limit_fallback]", "no_exact_match");
      } catch (fallbackError) {
        console.warn(
          "[spotify_rate_limit_fallback]",
          fallbackError instanceof Error
            ? fallbackError.message
            : String(fallbackError)
        );
      }
      return baseResult(song, "error", {
        reasonCodes: ["provider_rate_limited"],
      });
    }
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
      const results = await mapWithConcurrency(input.songs, 2, song =>
        classifySong(song)
      );
      console.info("[lookup_batch]", results.length, Date.now() - startedAt);
      return { results };
    }),
});
