import { describe, expect, it } from "vitest";
import type { MatchedTrack, SongInput } from "@contracts/types";
import {
  catalogueMatchReason,
  extractSpotifyTrackId,
  findMeaningfulRunnerUp,
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

  it("acepta una coincidencia inequívoca y no confunde un duplicado exacto con un rival", () => {
    const [best] = rankCandidates(song(), [track()]);
    expect(isHighConfidenceMatch(best)).toBe(true);

    const ranked = rankCandidates(song(), [
      track(),
      track({ spotifyId: "2234567890123456789012", title: "La Perla" }),
    ]);
    expect(isHighConfidenceMatch(ranked[0], ranked.slice(1))).toBe(true);
  });

  it.each([
    ["Bohemian Rhapsody", "Queen"],
    ["Billie Jean", "Michael Jackson"],
    ["Hotel California", "Eagles"],
    ["Rolling in the Deep", "Adele"],
    ["Smells Like Teen Spirit", "Nirvana"],
  ])(
    "continúa con %s cuando Spotify devuelve ediciones duplicadas exactas",
    (title, artist) => {
      const input = song({
        title,
        artists: [artist],
        album: null,
        durationMs: null,
      });
      const ranked = rankCandidates(input, [
        track({
          spotifyId: "1000000000000000000001",
          title,
          artists: [artist],
          album: "Álbum original",
          durationMs: null,
        }),
        track({
          spotifyId: "1000000000000000000002",
          title,
          artists: [artist],
          album: "Recopilatorio",
          durationMs: null,
        }),
        track({
          spotifyId: "1000000000000000000003",
          title,
          artists: [`${artist} Tribute Band`],
          album: "Covers",
          durationMs: null,
        }),
        track({
          spotifyId: "1000000000000000000004",
          title: `${title} - Live`,
          artists: [artist],
          album: "Live",
          durationMs: null,
        }),
      ]);

      expect(ranked[0].titleScore).toBe(1);
      expect(ranked[0].artistScore).toBe(1);
      expect(catalogueMatchReason(ranked[0], ranked.slice(1))).toBe(
        "metadata_exact_title_artist",
      );
    },
  );

  it("mantiene como rival una grabación distinta aunque comparta título y artista", () => {
    const input = song({
      album: null,
      durationMs: null,
    });
    const ranked = rankCandidates(input, [
      track({
        spotifyId: "1000000000000000000001",
        isrc: "ES1111111111",
        durationMs: 218_000,
      }),
      track({
        spotifyId: "1000000000000000000002",
        isrc: "ES2222222222",
        durationMs: 280_000,
      }),
    ]);

    expect(findMeaningfulRunnerUp(ranked[0], ranked.slice(1))).toBe(
      ranked[1],
    );
    expect(isHighConfidenceMatch(ranked[0], ranked.slice(1))).toBe(false);
    expect(catalogueMatchReason(ranked[0], ranked.slice(1))).toBe(
      "metadata_exact_title_artist",
    );
  });

  it("acepta una remasterización, pero no un directo o remix", () => {
    const input = song({
      title: "Hotel California",
      artists: ["Eagles"],
      album: null,
      durationMs: null,
    });
    const [remaster] = rankCandidates(input, [
      track({
        title: "Hotel California - 2013 Remaster",
        artists: ["Eagles"],
        album: "Hotel California (2013 Remaster)",
      }),
    ]);
    expect(catalogueMatchReason(remaster, [])).toBe(
      "metadata_remaster_equivalent",
    );

    for (const version of [
      "Hotel California - Live",
      "Hotel California - Acoustic",
      "Hotel California - Remix",
    ]) {
      const [candidate] = rankCandidates(input, [
        track({ title: version, artists: ["Eagles"] }),
      ]);
      expect(catalogueMatchReason(candidate, [])).toBeNull();
    }
  });

  it("sigue rechazando un cover aunque el título sea exacto", () => {
    const input = song({
      title: "Billie Jean",
      artists: ["Michael Jackson"],
      album: null,
      durationMs: null,
    });
    const [cover] = rankCandidates(input, [
      track({
        title: "Billie Jean",
        artists: ["Michael Jackson Tribute Band"],
        album: null,
        durationMs: null,
      }),
    ]);

    expect(isHighConfidenceMatch(cover)).toBe(false);
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
