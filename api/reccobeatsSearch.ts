import { extractSpotifyTrackId, normalizeForMatch } from "./matching";

const MAX_SEARCH_PAGES = 3;

export interface ReccoSearchPage {
  content?: unknown;
  page?: unknown;
  totalPages?: unknown;
}

export interface ReccoSearchMatch {
  internalId: string;
  track: ReccoSearchCandidate;
  reasonCode:
    | "reccobeats_search_exact_spotify_id"
    | "reccobeats_search_exact_isrc"
    | "reccobeats_search_exact_metadata";
}

type SearchPage = (page: number) => Promise<ReccoSearchPage>;

export interface ReccoSearchReference {
  spotifyId?: string | null;
  title: string;
  artists: string[];
  isrc?: string | null;
  durationMs?: number | null;
}

export interface ReccoSearchCandidate {
  internalId: string;
  title: string;
  artists: string[];
  spotifyId: string | null;
  isrc: string | null;
  durationMs: number | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function artists(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(artist => {
    if (typeof artist === "string") return artist.trim() ? [artist.trim()] : [];
    if (!artist || typeof artist !== "object") return [];
    const name = text((artist as { name?: unknown }).name);
    return name ? [name] : [];
  });
}

function candidates(page: ReccoSearchPage): ReccoSearchCandidate[] {
  if (!Array.isArray(page.content)) return [];
  return page.content.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const raw = item as {
      id?: unknown;
      trackTitle?: unknown;
      artists?: unknown;
      href?: unknown;
      isrc?: unknown;
      durationMs?: unknown;
    };
    const internalId = text(raw.id);
    const title = text(raw.trackTitle);
    const candidateArtists = artists(raw.artists);
    if (!internalId || !title || candidateArtists.length === 0) return [];
    return [
      {
        internalId,
        title,
        artists: candidateArtists,
        spotifyId: extractSpotifyTrackId(text(raw.href)),
        isrc: text(raw.isrc)?.toUpperCase() ?? null,
        durationMs:
          typeof raw.durationMs === "number" &&
          Number.isInteger(raw.durationMs) &&
          raw.durationMs > 0
            ? raw.durationMs
            : null,
      },
    ];
  });
}

function totalPages(page: ReccoSearchPage): number | null {
  const direct = page.totalPages;
  if (typeof direct === "number" && Number.isInteger(direct) && direct >= 0) {
    return direct;
  }
  if (page.page && typeof page.page === "object") {
    const nested = (page.page as { totalPages?: unknown }).totalPages;
    if (typeof nested === "number" && Number.isInteger(nested) && nested >= 0) {
      return nested;
    }
  }
  return null;
}

function sameMetadata(
  candidate: ReccoSearchCandidate,
  reference: ReccoSearchReference
): boolean {
  const titleMatches =
    normalizeForMatch(candidate.title) === normalizeForMatch(reference.title);
  const referencePrimary = normalizeForMatch(reference.artists[0] ?? "");
  const candidatePrimary = normalizeForMatch(candidate.artists[0] ?? "");
  const durationMatches =
    !reference.durationMs ||
    !candidate.durationMs ||
    Math.abs(reference.durationMs - candidate.durationMs) <= 10_000;
  return (
    titleMatches &&
    Boolean(referencePrimary) &&
    candidatePrimary === referencePrimary &&
    durationMatches
  );
}

/**
 * Searches at most pages 0..2 and accepts only the same Spotify recording or
 * an exact normalized title + artist match. This deliberately excludes covers,
 * live versions, remasters and loosely similar titles.
 */
export async function findReccoSearchMatch(
  reference: ReccoSearchReference,
  searchPage: SearchPage
): Promise<ReccoSearchMatch | null> {
  for (let pageNumber = 0; pageNumber < MAX_SEARCH_PAGES; pageNumber++) {
    const response = await searchPage(pageNumber);
    const pageCandidates = candidates(response);

    const exactSpotify = reference.spotifyId
      ? pageCandidates.find(
          candidate => candidate.spotifyId === reference.spotifyId
        )
      : null;
    if (exactSpotify) {
      return {
        internalId: exactSpotify.internalId,
        track: exactSpotify,
        reasonCode: "reccobeats_search_exact_spotify_id",
      };
    }

    const referenceIsrc = reference.isrc?.trim().toUpperCase();
    const exactIsrc = referenceIsrc
      ? pageCandidates.find(candidate => candidate.isrc === referenceIsrc)
      : null;
    if (exactIsrc) {
      return {
        internalId: exactIsrc.internalId,
        track: exactIsrc,
        reasonCode: "reccobeats_search_exact_isrc",
      };
    }

    const exactMetadata = pageCandidates.find(candidate =>
      sameMetadata(candidate, reference)
    );
    if (exactMetadata) {
      return {
        internalId: exactMetadata.internalId,
        track: exactMetadata,
        reasonCode: "reccobeats_search_exact_metadata",
      };
    }

    const availablePages = totalPages(response);
    if (
      pageCandidates.length === 0 ||
      (availablePages !== null && pageNumber + 1 >= availablePages)
    ) {
      break;
    }
  }
  return null;
}
