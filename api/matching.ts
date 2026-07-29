import type { MatchedTrack, SongInput } from "@contracts/types";
import { cleanArtist, cleanTitle, titleVariants } from "./searchVariants";

export const MATCH_THRESHOLDS = {
  overall: 0.9,
  title: 0.85,
  artist: 0.8,
  runnerUpGap: 0.1,
} as const;

export type SpotifyTrackCandidate = MatchedTrack;

export interface ScoredCandidate {
  track: SpotifyTrackCandidate;
  score: number;
  titleScore: number;
  artistScore: number;
  albumScore: number | null;
  durationScore: number | null;
  titleExact: boolean;
  primaryArtistExact: boolean;
  remasterEquivalent: boolean;
  usedAggressiveTitleVariant: boolean;
}

export type CatalogueMatchReason =
  | "metadata_exact_title_artist"
  | "metadata_remaster_equivalent"
  | "metadata_high_confidence";

const REMASTER_SUFFIX_RE =
  /\s*(?:[-–—]\s*|\(\s*|\[\s*)(?:\d{4}\s*)?remaster(?:ed)?(?:\s*\d{4})?\s*(?:\)|\])?\s*$/i;

export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = previous[0];
    previous[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const above = previous[j];
      previous[j] = Math.min(
        previous[j] + 1,
        previous[j - 1] + 1,
        diagonal + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
      diagonal = above;
    }
  }
  return previous[b.length];
}

function tokenScore(a: string, b: string): number {
  const aa = new Set(a.split(" ").filter(Boolean));
  const bb = new Set(b.split(" ").filter(Boolean));
  if (!aa.size || !bb.size) return 0;
  let intersection = 0;
  for (const token of aa) if (bb.has(token)) intersection++;
  return (2 * intersection) / (aa.size + bb.size);
}

export function textSimilarity(left: string, right: string): number {
  const a = normalizeForMatch(left);
  const b = normalizeForMatch(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const editScore = 1 - levenshtein(a, b) / Math.max(a.length, b.length);
  return Math.max(0, Math.min(1, editScore * 0.65 + tokenScore(a, b) * 0.35));
}

function scoreDuration(expected?: number | null, actual?: number | null): number | null {
  if (!expected || !actual) return null;
  const difference = Math.abs(expected - actual);
  if (difference <= 2_000) return 1;
  if (difference <= 5_000) return 0.9;
  if (difference <= 10_000) return 0.7;
  return Math.max(0, 1 - difference / 30_000);
}

export function scoreTrack(song: SongInput, track: SpotifyTrackCandidate): ScoredCandidate {
  const variants = titleVariants(song.title);
  let titleScore = -1;
  let titleVariantIndex = 0;
  variants.forEach((variant, index) => {
    const candidateScore = textSimilarity(variant, track.title);
    if (candidateScore > titleScore) {
      titleScore = candidateScore;
      titleVariantIndex = index;
    }
  });

  const inputArtists = song.artists.filter(Boolean);
  const primaryInput = cleanArtist(inputArtists[0] ?? "");
  const primaryCandidate = track.artists[0] ?? "";
  const artistScore = Math.max(
    textSimilarity(primaryInput, primaryCandidate),
    textSimilarity(inputArtists.join(" "), track.artists.join(" ")),
  );
  const albumScore = song.album && track.album ? textSimilarity(song.album, track.album) : null;
  const durationScore = scoreDuration(song.durationMs, track.durationMs);
  const cleanedInputTitle = normalizeForMatch(cleanTitle(song.title));
  const normalizedTrackTitle = normalizeForMatch(track.title);
  const withoutRemaster = track.title.replace(REMASTER_SUFFIX_RE, "").trim();

  const weighted: Array<[number, number]> = [
    [titleScore, 0.5],
    [artistScore, 0.35],
  ];
  if (albumScore !== null) weighted.push([albumScore, 0.1]);
  if (durationScore !== null) weighted.push([durationScore, 0.05]);
  const weightTotal = weighted.reduce((sum, [, weight]) => sum + weight, 0);
  const score = weighted.reduce((sum, [value, weight]) => sum + value * weight, 0) / weightTotal;

  return {
    track,
    score,
    titleScore,
    artistScore,
    albumScore,
    durationScore,
    titleExact: cleanedInputTitle === normalizedTrackTitle,
    primaryArtistExact:
      normalizeForMatch(primaryInput) ===
      normalizeForMatch(primaryCandidate),
    remasterEquivalent:
      withoutRemaster !== track.title &&
      cleanedInputTitle === normalizeForMatch(withoutRemaster),
    usedAggressiveTitleVariant:
      titleVariantIndex > 0 &&
      normalizeForMatch(variants[titleVariantIndex]) !== normalizeForMatch(cleanTitle(song.title)),
  };
}

export function rankCandidates(song: SongInput, candidates: SpotifyTrackCandidate[]): ScoredCandidate[] {
  return candidates
    .map((candidate) => scoreTrack(song, candidate))
    .sort((a, b) => b.score - a.score);
}

export function isHighConfidenceMatch(
  best: ScoredCandidate,
  runnerUpOrCompetitors?: ScoredCandidate | ScoredCandidate[],
): boolean {
  const competitors = Array.isArray(runnerUpOrCompetitors)
    ? runnerUpOrCompetitors
    : runnerUpOrCompetitors
      ? [runnerUpOrCompetitors]
      : [];
  const meaningfulRunnerUp = findMeaningfulRunnerUp(best, competitors);
  const gap = meaningfulRunnerUp
    ? best.score - meaningfulRunnerUp.score
    : 1;
  return (
    best.score >= MATCH_THRESHOLDS.overall &&
    best.titleScore >= MATCH_THRESHOLDS.title &&
    best.artistScore >= MATCH_THRESHOLDS.artist &&
    gap >= MATCH_THRESHOLDS.runnerUpGap &&
    !best.usedAggressiveTitleVariant
  );
}

export function isExactTitleArtistMatch(
  candidate: ScoredCandidate,
): boolean {
  return (
    candidate.titleExact &&
    candidate.primaryArtistExact &&
    !candidate.usedAggressiveTitleVariant
  );
}

export function isSafeRemasterEquivalent(
  candidate: ScoredCandidate,
): boolean {
  return (
    candidate.remasterEquivalent &&
    candidate.primaryArtistExact &&
    !candidate.usedAggressiveTitleVariant
  );
}

export function catalogueMatchReason(
  best: ScoredCandidate,
  competitors: ScoredCandidate[],
): CatalogueMatchReason | null {
  if (isExactTitleArtistMatch(best)) {
    return "metadata_exact_title_artist";
  }
  if (isSafeRemasterEquivalent(best)) {
    return "metadata_remaster_equivalent";
  }
  return isHighConfidenceMatch(best, competitors)
    ? "metadata_high_confidence"
    : null;
}

export function findMeaningfulRunnerUp(
  best: ScoredCandidate,
  competitors: ScoredCandidate[],
): ScoredCandidate | undefined {
  return competitors.find(
    candidate => !isExactCatalogueDuplicate(best, candidate),
  );
}

/**
 * Spotify often returns the same studio track more than once through albums,
 * compilations or territories. Those rows are not competing identifications
 * when both title and primary artist are exact; covers and named versions
 * remain meaningful competitors.
 */
function isExactCatalogueDuplicate(
  best: ScoredCandidate,
  candidate: ScoredCandidate,
): boolean {
  if (
    !best.titleExact ||
    !best.primaryArtistExact ||
    !candidate.titleExact ||
    !candidate.primaryArtistExact ||
    best.usedAggressiveTitleVariant ||
    candidate.usedAggressiveTitleVariant
  ) {
    return false;
  }
  const sameMetadata =
    normalizeForMatch(best.track.title) ===
      normalizeForMatch(candidate.track.title) &&
    normalizeForMatch(best.track.artists[0] ?? "") ===
      normalizeForMatch(candidate.track.artists[0] ?? "");
  if (!sameMetadata) return false;

  const bestIsrc = best.track.isrc?.trim().toUpperCase();
  const candidateIsrc = candidate.track.isrc?.trim().toUpperCase();
  if (bestIsrc && candidateIsrc) return bestIsrc === candidateIsrc;

  return Boolean(
    best.track.durationMs &&
      candidate.track.durationMs &&
      Math.abs(best.track.durationMs - candidate.track.durationMs) <= 5_000,
  );
}

export function extractSpotifyTrackId(platformUrl?: string | null): string | null {
  if (!platformUrl) return null;
  const value = platformUrl.trim();
  const uri = value.match(/^spotify:track:([A-Za-z0-9]{22})$/i);
  if (uri) return uri[1];
  try {
    const url = new URL(value);
    if (!/(^|\.)spotify\.com$/i.test(url.hostname)) return null;
    const match = url.pathname.match(/\/track\/([A-Za-z0-9]{22})(?:\/|$)/i);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}
