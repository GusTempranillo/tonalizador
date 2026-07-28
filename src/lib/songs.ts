import Papa from "papaparse";
import JSZip from "jszip";
import type { KeyLookupResult, SongInput } from "@contracts/types";

const COLUMN_CANDIDATES = {
  title: ["track name", "track", "title", "song", "song name", "name", "nombre", "canción", "cancion", "título", "titulo"],
  artist: ["artist name", "artist", "artists", "artista", "artistas", "artist(s)", "performer"],
  album: ["album name", "album", "álbum"],
  isrc: ["isrc"],
  platformUrl: ["track url", "song url", "spotify url", "url", "uri"],
  duration: ["duration ms", "duration_ms", "duration", "duración", "duracion"],
  type: ["type", "tipo"],
} as const;

export interface ParsedCsv {
  headers: string[];
  rows: Record<string, string>[];
  columns: SongColumns;
}

export interface SongColumns {
  title: string | null;
  artist: string | null;
  album: string | null;
  isrc: string | null;
  platformUrl: string | null;
  duration: string | null;
  type: string | null;
}

export interface ExtractedSongs {
  songs: SongInput[];
  skippedArtists: number;
  duplicateCount: number;
  duplicateSongs: Array<{ title: string; artist: string }>;
}

function findColumn(headers: string[], candidates: readonly string[]): string | null {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index >= 0) return headers[index];
  }
  for (const candidate of candidates) {
    if (candidate.length < 4) continue;
    const index = normalized.findIndex((header) => header.includes(candidate));
    if (index >= 0) return headers[index];
  }
  return null;
}

function detectColumns(headers: string[]): SongColumns {
  return {
    title: findColumn(headers, COLUMN_CANDIDATES.title),
    artist: findColumn(headers, COLUMN_CANDIDATES.artist),
    album: findColumn(headers, COLUMN_CANDIDATES.album),
    isrc: findColumn(headers, COLUMN_CANDIDATES.isrc),
    platformUrl: findColumn(headers, COLUMN_CANDIDATES.platformUrl),
    duration: findColumn(headers, COLUMN_CANDIDATES.duration),
    type: findColumn(headers, COLUMN_CANDIDATES.type),
  };
}

export function parseCsvFile(file: File): Promise<ParsedCsv> {
  return new Promise((resolve, reject) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => header.replace(/^\uFEFF/, "").trim(),
      complete: (result) => {
        if (result.errors.some((error) => error.type === "Quotes")) {
          reject(new Error("CSV_MALFORMED"));
          return;
        }
        const headers = result.meta.fields ?? [];
        const rows = result.data.filter((row) =>
          Object.values(row).some((value) => value?.trim()),
        );
        resolve({ headers, rows, columns: detectColumns(headers) });
      },
      error: reject,
    });
  });
}

function parseDuration(value: string): number | null {
  const raw = value.trim();
  if (!raw) return null;
  if (/^\d+:\d{1,2}$/.test(raw)) {
    const [minutes, seconds] = raw.split(":").map(Number);
    return (minutes * 60 + seconds) * 1000;
  }
  const number = Number(raw.replace(",", "."));
  if (!Number.isFinite(number) || number <= 0) return null;
  return Math.round(number < 10_000 ? number * 1000 : number);
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function normalizedIdentity(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " "))
    .join("|");
}

export function extractSongs(
  rows: Record<string, string>[],
  columns: SongColumns,
): ExtractedSongs {
  if (!columns.title || !columns.artist) {
    return { songs: [], skippedArtists: 0, duplicateCount: 0, duplicateSongs: [] };
  }
  const seen = new Set<string>();
  const songs: SongInput[] = [];
  const duplicateSongs: Array<{ title: string; artist: string }> = [];
  let skippedArtists = 0;

  rows.forEach((row, rowIndex) => {
    if (columns.type && (row[columns.type] ?? "").trim().toLowerCase() === "artist") {
      skippedArtists++;
      return;
    }
    const title = (row[columns.title!] ?? "").trim();
    const artist = (row[columns.artist!] ?? "").trim();
    if (!title || !artist) return;
    const album = columns.album ? (row[columns.album] ?? "").trim() || null : null;
    const isrc = columns.isrc ? (row[columns.isrc] ?? "").trim() || null : null;
    const platformUrl = columns.platformUrl
      ? (row[columns.platformUrl] ?? "").trim() || null
      : null;
    const durationMs = columns.duration
      ? parseDuration(row[columns.duration] ?? "")
      : null;
    const fingerprint = normalizedIdentity([isrc || platformUrl, artist, title, album]);
    if (seen.has(fingerprint)) {
      duplicateSongs.push({ title, artist });
      return;
    }
    seen.add(fingerprint);
    songs.push({
      id: `song-${rowIndex}-${stableHash(fingerprint)}`,
      title,
      artists: [artist],
      album,
      isrc,
      platformUrl,
      durationMs,
      position: rowIndex,
    });
  });

  return {
    songs,
    skippedArtists,
    duplicateCount: duplicateSongs.length,
    duplicateSongs: duplicateSongs.slice(0, 50),
  };
}

function csvEscape(value: string | number | null | undefined): string {
  const text = value === null || value === undefined ? "" : String(value);
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function buildPlaylistCsv(songs: Array<{ title: string; artists: string[] }>): string {
  return [
    "Track Name,Artist Name",
    ...songs.map((song) => `${csvEscape(song.title)},${csvEscape(song.artists.join(", "))}`),
  ].join("\r\n");
}

export function buildReviewCsv(results: KeyLookupResult[]): string {
  const rows = results.filter((result) => result.status !== "classified");
  return [
    "Estado,Título,Artista,Coincidencia,Artista encontrado,Confianza,Motivos",
    ...rows.map((result) =>
      [
        result.status,
        result.title,
        result.artists.join(", "),
        result.matchedTrack?.title,
        result.matchedTrack?.artists.join(", "),
        result.confidence === null ? "" : result.confidence.toFixed(3),
        result.reasonCodes.join(" | "),
      ].map(csvEscape).join(","),
    ),
  ].join("\r\n");
}

export function buildSummaryCsv(results: KeyLookupResult[]): string {
  return [
    "Estado,Título,Artista,Tonalidad,Camelot,BPM,Fuente,Confianza,Coincidencia,Artista encontrado,ISRC,Motivos",
    ...results.map((result) =>
      [
        result.status,
        result.title,
        result.artists.join(", "),
        result.keySpanish,
        result.camelot,
        result.bpm,
        result.source,
        result.confidence === null ? "" : result.confidence.toFixed(3),
        result.matchedTrack?.title,
        result.matchedTrack?.artists.join(", "),
        result.matchedTrack?.isrc,
        result.reasonCodes.join(" | "),
      ].map(csvEscape).join(","),
    ),
  ].join("\r\n");
}

export function downloadBlob(filename: string, content: string | Blob) {
  const blob = typeof content === "string"
    ? new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" })
    : content;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5_000);
}

export function groupByKey(results: KeyLookupResult[]): Map<string, KeyLookupResult[]> {
  const groups = new Map<string, KeyLookupResult[]>();
  for (const result of results) {
    if (result.status !== "classified" || !result.keySpanish) continue;
    const list = groups.get(result.keySpanish) ?? [];
    list.push(result);
    groups.set(result.keySpanish, list);
  }
  return new Map(
    [...groups.entries()].sort(([left], [right]) => {
      const modeDifference = Number(left.endsWith("menor")) - Number(right.endsWith("menor"));
      return modeDifference || left.localeCompare(right, "es");
    }),
  );
}

export async function downloadAllAsZip(
  groups: Map<string, KeyLookupResult[]>,
  results: KeyLookupResult[],
) {
  const zip = new JSZip();
  for (const [key, songs] of groups) {
    zip.file(`${key}.csv`, `\uFEFF${buildPlaylistCsv(songs)}`);
  }
  if (results.some((result) => result.status !== "classified")) {
    zip.file("revisar.csv", `\uFEFF${buildReviewCsv(results)}`);
  }
  zip.file("resumen.csv", `\uFEFF${buildSummaryCsv(results)}`);
  downloadBlob(
    "playlists-por-tonalidad.zip",
    await zip.generateAsync({ type: "blob" }),
  );
}
