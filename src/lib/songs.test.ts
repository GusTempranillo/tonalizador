import { describe, expect, it } from "vitest";
import { buildPlaylistCsv, buildSummaryCsv, extractSongs, type SongColumns } from "./songs";
import type { KeyLookupResult } from "@contracts/types";

const columns: SongColumns = {
  title: "Track Name",
  artist: "Artist Name",
  album: "Album",
  isrc: "ISRC",
  platformUrl: "Track URL",
  duration: "Duration",
  type: "Type",
};

describe("importación y exportación CSV", () => {
  it("conserva artistas con comas, metadatos y orden", () => {
    const extracted = extractSongs([
      {
        "Track Name": "September",
        "Artist Name": "Earth, Wind & Fire",
        Album: "The Best",
        ISRC: "USSM19900123",
        "Track URL": "spotify:track:1234567890123456789012",
        Duration: "3:35",
        Type: "track",
      },
    ], columns);
    expect(extracted.songs[0]).toMatchObject({
      title: "September",
      artists: ["Earth, Wind & Fire"],
      album: "The Best",
      isrc: "USSM19900123",
      durationMs: 215_000,
      position: 0,
    });
  });

  it("separa suscripciones y muestra duplicados sin reordenar", () => {
    const extracted = extractSongs([
      { "Track Name": "Canal", "Artist Name": "Canal", Type: "artist" },
      { "Track Name": "Uno", "Artist Name": "A", Type: "track" },
      { "Track Name": "Uno", "Artist Name": "A", Type: "track" },
      { "Track Name": "Dos", "Artist Name": "B", Type: "track" },
    ], { ...columns, album: null, isrc: null, platformUrl: null, duration: null });
    expect(extracted.skippedArtists).toBe(1);
    expect(extracted.duplicateCount).toBe(1);
    expect(extracted.songs.map((song) => song.title)).toEqual(["Uno", "Dos"]);
  });

  it("escapa correctamente las comas de TuneMyMusic", () => {
    expect(buildPlaylistCsv([{ title: "Song, Part II", artists: ["Earth, Wind & Fire"] }]))
      .toContain('"Song, Part II","Earth, Wind & Fire"');
  });

  it("incluye trazabilidad completa en el resumen", () => {
    const result: KeyLookupResult = {
      inputId: "1",
      title: "Uno",
      artists: ["A"],
      status: "classified",
      keyOf: "C",
      keySpanish: "Do Mayor",
      camelot: "8B",
      bpm: 120,
      confidence: 0.96,
      source: "reccobeats",
      matchedTrack: null,
      reasonCodes: ["metadata_high_confidence"],
      cached: false,
    };
    const csv = buildSummaryCsv([result]);
    expect(csv).toContain("Do Mayor");
    expect(csv).toContain("0.960");
    expect(csv).toContain("metadata_high_confidence");
  });
});
