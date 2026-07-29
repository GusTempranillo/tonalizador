import type { KeyLookupResult, SongInput } from "@contracts/types";

export type SavedAnalysis = {
  version: 2;
  fileName: string;
  songs: SongInput[];
  results: KeyLookupResult[];
  duplicateCount: number;
  duplicateSongs?: Array<{ title: string; artist: string }>;
};

export type InitialChapter = "export" | "analyze" | "download";

const VALID_STATUSES = new Set(["classified", "review", "not_found", "error"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSong(value: unknown): value is SongInput {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.artists) &&
    value.artists.every(artist => typeof artist === "string")
  );
}

function isResult(value: unknown): value is KeyLookupResult {
  return (
    isRecord(value) &&
    typeof value.inputId === "string" &&
    typeof value.title === "string" &&
    Array.isArray(value.artists) &&
    value.artists.every(artist => typeof artist === "string") &&
    typeof value.status === "string" &&
    VALID_STATUSES.has(value.status)
  );
}

export function parseSavedAnalysis(raw: string | null): SavedAnalysis | null {
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      !isRecord(parsed) ||
      parsed.version !== 2 ||
      typeof parsed.fileName !== "string" ||
      !Array.isArray(parsed.songs) ||
      !parsed.songs.every(isSong) ||
      !Array.isArray(parsed.results) ||
      !parsed.results.every(isResult) ||
      typeof parsed.duplicateCount !== "number"
    ) {
      return null;
    }

    return parsed as SavedAnalysis;
  } catch {
    return null;
  }
}

export function savedAnalysisIsComplete(saved: SavedAnalysis | null): boolean {
  if (!saved?.songs.length || saved.results.length !== saved.songs.length)
    return false;
  const resultById = new Map(
    saved.results.map(result => [result.inputId, result])
  );
  return saved.songs.every(song => {
    const result = resultById.get(song.id);
    return Boolean(result && result.status !== "error");
  });
}

export function getInitialChapter(saved: SavedAnalysis | null): InitialChapter {
  if (savedAnalysisIsComplete(saved)) return "download";
  if (saved?.songs.length) return "analyze";
  return "export";
}
