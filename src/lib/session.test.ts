import { describe, expect, it } from "vitest";
import {
  getInitialChapter,
  parseSavedAnalysis,
  savedAnalysisIsComplete,
  type SavedAnalysis,
} from "./session";

const completeSession: SavedAnalysis = {
  version: 2,
  fileName: "playlist.csv",
  duplicateCount: 0,
  songs: [
    {
      id: "song-1",
      title: "Canción",
      artists: ["Artista"],
    },
  ],
  results: [
    {
      inputId: "song-1",
      title: "Canción",
      artists: ["Artista"],
      status: "classified",
      keyOf: "C",
      keySpanish: "Do Mayor",
      camelot: "8B",
      bpm: 120,
      confidence: 0.95,
      source: "reccobeats",
      matchedTrack: null,
      reasonCodes: [],
      cached: false,
    },
  ],
};

describe("sesión guardada", () => {
  it("acepta una sesión v2 válida y rechaza datos corruptos u obsoletos", () => {
    expect(parseSavedAnalysis(JSON.stringify(completeSession))).toEqual(
      completeSession
    );
    expect(parseSavedAnalysis("{no es json")).toBeNull();
    expect(
      parseSavedAnalysis(JSON.stringify({ ...completeSession, version: 1 }))
    ).toBeNull();
    expect(
      parseSavedAnalysis(
        JSON.stringify({ ...completeSession, songs: [{ title: 42 }] })
      )
    ).toBeNull();
  });

  it("solo abre Descargar cuando todas las canciones tienen resultado útil", () => {
    expect(savedAnalysisIsComplete(completeSession)).toBe(true);
    expect(getInitialChapter(completeSession)).toBe("download");

    const partial = { ...completeSession, results: [] };
    expect(savedAnalysisIsComplete(partial)).toBe(false);
    expect(getInitialChapter(partial)).toBe("analyze");

    const withError: SavedAnalysis = {
      ...completeSession,
      results: [{ ...completeSession.results[0], status: "error" }],
    };
    expect(savedAnalysisIsComplete(withError)).toBe(false);
    expect(getInitialChapter(withError)).toBe("analyze");
    expect(getInitialChapter(null)).toBe("export");
  });
});
