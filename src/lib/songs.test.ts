import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import {
  buildPlaylistCsv,
  buildPlaylistsZip,
  buildSummaryCsv,
  extractSongs,
  groupByKey,
  type SongColumns,
} from "./songs";
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
    const extracted = extractSongs(
      [
        {
          "Track Name": "September",
          "Artist Name": "Earth, Wind & Fire",
          Album: "The Best",
          ISRC: "USSM19900123",
          "Track URL": "spotify:track:1234567890123456789012",
          Duration: "3:35",
          Type: "track",
        },
      ],
      columns
    );
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
    const extracted = extractSongs(
      [
        { "Track Name": "Canal", "Artist Name": "Canal", Type: "artist" },
        { "Track Name": "Uno", "Artist Name": "A", Type: "track" },
        { "Track Name": "Uno", "Artist Name": "A", Type: "track" },
        { "Track Name": "Dos", "Artist Name": "B", Type: "track" },
      ],
      { ...columns, album: null, isrc: null, platformUrl: null, duration: null }
    );
    expect(extracted.skippedArtists).toBe(1);
    expect(extracted.duplicateCount).toBe(1);
    expect(extracted.songs.map(song => song.title)).toEqual(["Uno", "Dos"]);
  });

  it("escapa correctamente las comas de TuneMyMusic", () => {
    expect(
      buildPlaylistCsv([
        { title: "Song, Part II", artists: ["Earth, Wind & Fire"] },
      ])
    ).toContain('"Song, Part II","Earth, Wind & Fire"');
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
      tonalConfidence: 0.82,
      source: "reccobeats",
      matchedTrack: null,
      reasonCodes: ["metadata_high_confidence"],
      cached: false,
    };
    const csv = buildSummaryCsv([result]);
    expect(csv).toContain("Do Mayor");
    expect(csv).toContain("Confianza tonal,Confianza de coincidencia");
    expect(csv).toContain("0.820");
    expect(csv).toContain("0.960");
    expect(csv).toContain("metadata_high_confidence");
  });

  it("agrupa solo canciones clasificadas y conserva su orden", () => {
    const results: KeyLookupResult[] = [
      makeResult("1", "Primera", "Do Mayor"),
      makeResult("2", "Pendiente", null, "review"),
      makeResult("3", "Segunda", "Do Mayor"),
      makeResult("4", "Menor", "La menor"),
    ];

    const groups = groupByKey(results);

    expect([...groups.keys()]).toEqual(["Do Mayor", "La menor"]);
    expect(groups.get("Do Mayor")?.map(result => result.title)).toEqual([
      "Primera",
      "Segunda",
    ]);
  });

  it("crea el paquete completo con BOM y lista de revisión cuando hace falta", async () => {
    const results: KeyLookupResult[] = [
      makeResult("1", "Primera", "Do Mayor"),
      makeResult("2", "Pendiente", null, "review"),
    ];
    const blob = await buildPlaylistsZip(groupByKey(results), results);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());

    expect(Object.keys(zip.files).sort()).toEqual([
      "Do Mayor.csv",
      "resumen.csv",
      "revisar.csv",
    ]);
    const playlist = await zip.file("Do Mayor.csv")?.async("string");
    expect(playlist?.charCodeAt(0)).toBe(0xfeff);
    expect(playlist).toContain("Primera");
    expect(await zip.file("revisar.csv")?.async("string")).toContain(
      "Pendiente"
    );

    const cleanResults = [makeResult("3", "Segunda", "Re Mayor")];
    const cleanBlob = await buildPlaylistsZip(
      groupByKey(cleanResults),
      cleanResults
    );
    const cleanZip = await JSZip.loadAsync(await cleanBlob.arrayBuffer());
    expect(cleanZip.file("revisar.csv")).toBeNull();
    expect(cleanZip.file("resumen.csv")).not.toBeNull();
  });
});

function makeResult(
  inputId: string,
  title: string,
  keySpanish: string | null,
  status: KeyLookupResult["status"] = "classified"
): KeyLookupResult {
  return {
    inputId,
    title,
    artists: ["Artista"],
    status,
    keyOf: keySpanish ? "C" : null,
    keySpanish,
    camelot: keySpanish ? "8B" : null,
    bpm: keySpanish ? 120 : null,
    confidence: 0.95,
    tonalConfidence: null,
    source: keySpanish ? "reccobeats" : null,
    matchedTrack: null,
    reasonCodes: [],
    cached: false,
  };
}
