import { describe, expect, it } from "vitest";
import type { MatchedTrack, SongInput } from "@contracts/types";
import {
  extractSpotifyTrackId,
  isHighConfidenceMatch,
  rankCandidates,
  textSimilarity,
} from "./matching";
import { titleVariants } from "./searchVariants";

function song(overrides: Partial<SongInput> = {}): SongInput {
  return {
    id: "input-1",
    title: "La Perla",
    artists: ["ROSALÍA"],
    album: "LUX",
    durationMs: 218_000,
    ...overrides,
  };
}

function track(overrides: Partial<MatchedTrack> = {}): MatchedTrack {
  return {
    spotifyId: "1234567890123456789012",
    title: "La Perla",
    artists: ["ROSALÍA"],
    album: "LUX",
    isrc: "ES1234567890",
    durationMs: 218_400,
    spotifyUrl: "https://open.spotify.com/track/1234567890123456789012",
    ...overrides,
  };
}

describe("matching de catálogo", () => {
  it("normaliza acentos sin perder precisión", () => {
    expect(textSimilarity("ROSALÍA", "Rosalia")).toBe(1);
  });

  it("acepta una coincidencia inequívoca y rechaza un rival cercano", () => {
    const [best] = rankCandidates(song(), [track()]);
    expect(isHighConfidenceMatch(best)).toBe(true);

    const ranked = rankCandidates(song(), [
      track(),
      track({ spotifyId: "2234567890123456789012", title: "La Perla" }),
    ]);
    expect(isHighConfidenceMatch(ranked[0], ranked[1])).toBe(false);
  });

  it("conserva marcadores musicales y marca como agresiva su eliminación", () => {
    expect(titleVariants("Song (Live at Madrid)")).toEqual([
      "Song (Live at Madrid)",
      "Song",
    ]);
    const [best] = rankCandidates(
      song({ title: "Song (Live at Madrid)", album: null, durationMs: null }),
      [track({ title: "Song", album: null, durationMs: null })],
    );
    expect(best.usedAggressiveTitleVariant).toBe(true);
    expect(isHighConfidenceMatch(best)).toBe(false);
  });

  it("extrae únicamente IDs válidos de URLs o URI de Spotify", () => {
    expect(extractSpotifyTrackId("spotify:track:1234567890123456789012"))
      .toBe("1234567890123456789012");
    expect(extractSpotifyTrackId("https://open.spotify.com/track/1234567890123456789012?si=x"))
      .toBe("1234567890123456789012");
    expect(extractSpotifyTrackId("https://example.com/track/1234567890123456789012"))
      .toBeNull();
  });

  it("ordena correctamente un corpus adversarial de 150 entradas", () => {
    const cases = Array.from({ length: 150 }, (_, index) => {
      const artist = index % 10 === 0 ? `Earth, Wind & Fire ${index}` : `Artista ${index}`;
      const input = song({
        id: `case-${index}`,
        title: `Canción ${index} (Official Video)`,
        artists: [artist],
        album: `Álbum ${Math.floor(index / 10)}`,
        durationMs: 180_000 + index * 100,
      });
      const correct = track({
        spotifyId: String(index).padStart(22, "0"),
        title: `Canción ${index}`,
        artists: [artist],
        album: input.album ?? null,
        durationMs: input.durationMs ?? null,
      });
      const wrong = track({
        spotifyId: `9${String(index).padStart(21, "0")}`,
        title: `Canción ${index + 1}`,
        artists: [`Artista ${index + 1}`],
        album: "Otro álbum",
        durationMs: 240_000,
      });
      return { input, correct, wrong };
    });

    for (const reference of cases) {
      expect(rankCandidates(reference.input, [reference.wrong, reference.correct])[0].track.spotifyId)
        .toBe(reference.correct.spotifyId);
    }
  });
});
