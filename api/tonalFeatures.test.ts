import { describe, expect, it, vi } from "vitest";
import {
  normalizeTonalFeatures,
  resolveTonalFeatures,
  SpotifyAudioFeaturesCircuitBreaker,
  type TonalFeatures,
} from "./tonalFeatures";

const reccoFeatures: TonalFeatures = {
  keyOf: "F#m",
  camelot: "11A",
  bpm: 117,
  tonalConfidence: null,
  source: "reccobeats",
};

describe("normalizeTonalFeatures", () => {
  it("exige key y mode enteros dentro de sus dominios", () => {
    expect(
      normalizeTonalFeatures({ key: 0 }, "spotify_audio_features")
    ).toBeNull();
    expect(
      normalizeTonalFeatures(
        { key: 0, mode: undefined },
        "spotify_audio_features"
      )
    ).toBeNull();
    expect(
      normalizeTonalFeatures({ key: -1, mode: 1 }, "reccobeats")
    ).toBeNull();
    expect(
      normalizeTonalFeatures({ key: 12, mode: 0 }, "reccobeats")
    ).toBeNull();
    expect(
      normalizeTonalFeatures({ key: 1.5, mode: 1 }, "reccobeats")
    ).toBeNull();
    expect(
      normalizeTonalFeatures({ key: 1, mode: 2 }, "reccobeats")
    ).toBeNull();
  });

  it("conserva fuente y separa confianza tonal de BPM", () => {
    expect(
      normalizeTonalFeatures(
        {
          key: 6,
          mode: 0,
          tempo: 116.6,
          tonalConfidence: 0.82,
        },
        "spotify_audio_features"
      )
    ).toEqual({
      keyOf: "F#m",
      camelot: "11A",
      bpm: 117,
      tonalConfidence: 0.82,
      source: "spotify_audio_features",
    });
  });

  it("no inventa valores ante tempo o confianza inválidos", () => {
    expect(
      normalizeTonalFeatures(
        {
          key: 0,
          mode: 1,
          tempo: 0,
          tonalConfidence: 1.1,
        },
        "reccobeats"
      )
    ).toMatchObject({
      keyOf: "C",
      bpm: null,
      tonalConfidence: null,
    });
  });
});

describe("resolveTonalFeatures", () => {
  it("no consulta ReccoBeats cuando Spotify entrega tonalidad válida", async () => {
    const spotifyFeatures: TonalFeatures = {
      ...reccoFeatures,
      source: "spotify_audio_features",
    };
    const spotify = vi.fn().mockResolvedValue({
      features: spotifyFeatures,
      reasonCode: null,
    });
    const reccobeats = vi.fn();

    await expect(
      resolveTonalFeatures({ spotify, reccobeats })
    ).resolves.toEqual({
      features: spotifyFeatures,
      reasonCodes: ["tonal_source_spotify_audio_features"],
    });
    expect(reccobeats).not.toHaveBeenCalled();
  });

  it("cae a ReccoBeats si Spotify no está autorizado", async () => {
    const spotify = vi.fn().mockResolvedValue({
      features: null,
      reasonCode: "spotify_audio_features_forbidden",
    });
    const reccobeats = vi.fn().mockResolvedValue({
      features: reccoFeatures,
      reasonCode: null,
    });

    await expect(
      resolveTonalFeatures({ spotify, reccobeats })
    ).resolves.toEqual({
      features: reccoFeatures,
      reasonCodes: [
        "spotify_audio_features_forbidden",
        "tonal_source_reccobeats",
      ],
    });
    expect(spotify.mock.invocationCallOrder[0]).toBeLessThan(
      reccobeats.mock.invocationCallOrder[0]
    );
  });

  it("cae al siguiente proveedor aunque el anterior lance un error", async () => {
    const onProviderError = vi.fn();
    const spotify = vi.fn().mockRejectedValue(new Error("network"));
    const reccobeats = vi.fn().mockResolvedValue({
      features: reccoFeatures,
      reasonCode: null,
    });

    const result = await resolveTonalFeatures({
      spotify,
      reccobeats,
      onProviderError,
    });

    expect(result.features).toEqual(reccoFeatures);
    expect(result.reasonCodes).toEqual([
      "spotify_audio_features_unavailable",
      "tonal_source_reccobeats",
    ]);
    expect(onProviderError).toHaveBeenCalledWith(
      "spotify_audio_features",
      expect.any(Error)
    );
  });

  it("rechaza una fuente incongruente y continúa", async () => {
    const result = await resolveTonalFeatures({
      spotify: vi.fn().mockResolvedValue({
        features: reccoFeatures,
        reasonCode: null,
      }),
      reccobeats: vi.fn().mockResolvedValue({
        features: reccoFeatures,
        reasonCode: null,
      }),
    });

    expect(result.features).toEqual(reccoFeatures);
    expect(result.reasonCodes).toEqual([
      "spotify_audio_features_invalid",
      "tonal_source_reccobeats",
    ]);
  });
});

describe("SpotifyAudioFeaturesCircuitBreaker", () => {
  it("bloquea tras un 403 y vuelve a cerrar al terminar el cooldown", () => {
    let now = 1_000;
    const breaker = new SpotifyAudioFeaturesCircuitBreaker(5_000, () => now);

    expect(breaker.isOpen()).toBe(false);
    breaker.trip();
    expect(breaker.isOpen()).toBe(true);
    now = 6_000;
    expect(breaker.isOpen()).toBe(false);
  });
});
