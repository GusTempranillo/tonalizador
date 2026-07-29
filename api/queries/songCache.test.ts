import { describe, expect, it, vi } from "vitest";
import type { SongInput } from "@contracts/types";
import {
  ALGORITHM_VERSION,
  cachedRowToResult,
  isReusableCacheEntry,
  saveToCacheBestEffort,
  songFingerprint,
} from "./songCache";
import type { SongCacheRow } from "@db/schema";

const base: SongInput = {
  id: "1",
  title: "Canción",
  artists: ["Artista"],
  album: "Álbum",
};

function cacheRow(overrides: Partial<SongCacheRow> = {}): SongCacheRow {
  return {
    id: 1,
    cacheKey: "cache-key",
    artist: "Artista",
    title: "Canción",
    album: "Álbum",
    isrc: null,
    spotifyId: "1234567890123456789012",
    status: "classified",
    keyOf: "C",
    camelot: "8B",
    bpm: 120,
    confidenceBp: 9_500,
    tonalConfidenceBp: null,
    source: "reccobeats",
    matchedTitle: "Canción",
    matchedArtists: JSON.stringify(["Artista"]),
    matchedAlbum: "Álbum",
    matchedIsrc: null,
    matchedDurationMs: null,
    matchedSpotifyUrl: "https://open.spotify.com/track/1234567890123456789012",
    reasonCodes: JSON.stringify(["tonal_source_reccobeats"]),
    algorithmVersion: ALGORITHM_VERSION,
    manual: false,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    expiresAt: null,
    ...overrides,
  };
}

describe("identidad de caché", () => {
  it("es estable frente a espacios y mayúsculas", () => {
    expect(songFingerprint(base)).toBe(
      songFingerprint({
        ...base,
        id: "otro",
        title: "  CANCIÓN ",
        artists: [" artista  "],
        album: " ÁLBUM ",
      })
    );
  });

  it("prioriza ISRC y Spotify sobre metadatos", () => {
    expect(songFingerprint({ ...base, isrc: "ES123" })).toBe(
      songFingerprint({ ...base, title: "Otro título", isrc: "es123" })
    );
    expect(
      songFingerprint({
        ...base,
        platformUrl: "spotify:track:1234567890123456789012",
      })
    ).toBe(
      songFingerprint({
        ...base,
        title: "Otro título",
        platformUrl: "https://open.spotify.com/track/1234567890123456789012",
      })
    );
  });

  it("mantiene una versión explícita del algoritmo", () => {
    expect(ALGORITHM_VERSION).toMatch(/^matching-v\d+$/);
    expect(ALGORITHM_VERSION).toBe("matching-v4");
  });

  it("no reutiliza correcciones manuales ni versiones antiguas", () => {
    expect(
      isReusableCacheEntry({
        manual: true,
        algorithmVersion: ALGORITHM_VERSION,
        expiresAt: null,
      })
    ).toBe(false);
    expect(
      isReusableCacheEntry({
        manual: false,
        algorithmVersion: "matching-v2",
        expiresAt: null,
      })
    ).toBe(false);
  });

  it("rechaza entradas caducadas", () => {
    expect(
      isReusableCacheEntry(
        {
          manual: false,
          algorithmVersion: ALGORITHM_VERSION,
          expiresAt: new Date(999),
        },
        1_000
      )
    ).toBe(false);
    expect(
      isReusableCacheEntry(
        {
          manual: false,
          algorithmVersion: ALGORITHM_VERSION,
          expiresAt: new Date(1_001),
        },
        1_000
      )
    ).toBe(true);
  });

  it("trata el fallo de escritura de caché como best-effort", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const save = vi.fn().mockRejectedValue(new Error("db unavailable"));
    const saved = await saveToCacheBestEffort(
      base,
      {
        inputId: base.id,
        title: base.title,
        artists: base.artists,
        status: "review",
        keyOf: null,
        keySpanish: null,
        camelot: null,
        bpm: null,
        confidence: 0.9,
        tonalConfidence: null,
        source: null,
        matchedTrack: null,
        reasonCodes: ["tonal_features_missing"],
        cached: false,
      },
      save
    );

    expect(saved).toBe(false);
    expect(save).toHaveBeenCalledOnce();
    expect(warning).toHaveBeenCalledWith(
      "[cache_write_failed]",
      "db unavailable"
    );
    warning.mockRestore();
  });

  it("degrada una clasificación cacheada sin tonalidad válida", () => {
    const result = cachedRowToResult(base, cacheRow({ keyOf: null }));

    expect(result).toMatchObject({
      status: "review",
      keyOf: null,
      keySpanish: null,
      source: null,
      tonalConfidence: null,
    });
    expect(result.reasonCodes).toContain("invalid_cached_classification");
  });
});
