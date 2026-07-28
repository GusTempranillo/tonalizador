// Metadata cleanup intentionally removes presentation noise, never musical version
// markers such as live, remix, edit, acoustic or remaster.
const PRESENTATION_JUNK_RE =
  /(\(|\[|\{)[^)\]}]*(official|oficial|video|vídeo|lyric|lyrics|audio|visuali[sz]er|music video|m\/v|mv|hd|4k|8k|hq|vevo)[^)\]}]*(\)|\]|\})/gi;
const ANY_BRACKET_RE = /(\(|\[|\{)[^)\]}]*(\)|\]|\})/g;

const JUNK_TOKENS = new Set([
  "official", "oficial", "video", "vídeo", "lyric", "lyrics", "audio",
  "visualizer", "visualiser", "mv", "hd", "4k", "8k", "hq", "vevo", "topic",
]);

function tidy(value: string): string {
  return value
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-–—|•·:;,~]+|[\s\-–—|•·:;,~]+$/g, "")
    .trim();
}

function isOnlyJunk(value: string): boolean {
  const words = value.toLowerCase().split(/\s+/).filter(Boolean);
  return words.length > 0 && words.every((word) => JUNK_TOKENS.has(word));
}

export function cleanTitle(title: string): string {
  return tidy(title.replace(PRESENTATION_JUNK_RE, " "));
}

/**
 * Variants are ordered from faithful to aggressive. Consumers must treat index >= 2
 * as ambiguous because it may remove a meaningful version marker.
 */
export function titleVariants(title: string): string[] {
  const variants: string[] = [];
  const push = (value: string) => {
    const candidate = tidy(value);
    if (
      candidate.length >= 2 &&
      !isOnlyJunk(candidate) &&
      !variants.some((existing) => existing.toLowerCase() === candidate.toLowerCase())
    ) {
      variants.push(candidate);
    }
  };
  push(title);
  push(title.replace(PRESENTATION_JUNK_RE, " "));
  push(title.replace(ANY_BRACKET_RE, " "));
  return variants;
}

/** Search helper only. The original artist value remains untouched in contracts and exports. */
export function cleanArtist(artist: string): string {
  const noChannelSuffix = artist
    .replace(/\s*[-–—]?\s*topic\s*$/i, "")
    .replace(/\s*vevo\s*$/i, "");
  const primary = noChannelSuffix.split(
    /\s*(?:;|\bfeat\.?\b|\bft\.?\b|\bfeaturing\b|\bwith\b|\bvs\.?\b)\s*/i,
  )[0];
  return tidy(primary || noChannelSuffix);
}
