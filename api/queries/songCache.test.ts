import { describe, expect, it } from "vitest";
import type { SongInput } from "@contracts/types";
import { ALGORITHM_VERSION, songFingerprint } from "./songCache";

const base: SongInput = {
  id: "1",
  title: "Canción",
  artists: ["Artista"],
  album: "Álbum",
};

describe("identidad de caché", () => {
  it("es estable frente a espacios y mayúsculas", () => {
    expect(songFingerprint(base)).toBe(songFingerprint({
      ...base,
      id: "otro",
      title: "  CANCIÓN ",
      artists: [" artista  "],
      album: " ÁLBUM ",
    }));
  });

  it("prioriza ISRC y Spotify sobre metadatos", () => {
    expect(songFingerprint({ ...base, isrc: "ES123" }))
      .toBe(songFingerprint({ ...base, title: "Otro título", isrc: "es123" }));
    expect(songFingerprint({ ...base, platformUrl: "spotify:track:1234567890123456789012" }))
      .toBe(songFingerprint({
        ...base,
        title: "Otro título",
        platformUrl: "https://open.spotify.com/track/1234567890123456789012",
      }));
  });

  it("mantiene una versión explícita del algoritmo", () => {
    expect(ALGORITHM_VERSION).toMatch(/^matching-v\d+$/);
  });
});
