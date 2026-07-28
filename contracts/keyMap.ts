// Conversión de tonalidades (notación anglosajona → español)
// El backend genera keyOf como "C", "Cm", "F#m", "Bb", etc.

const NOTE_ES: Record<string, string> = {
  C: "Do",
  D: "Re",
  E: "Mi",
  F: "Fa",
  G: "Sol",
  A: "La",
  B: "Si",
};

function normalizeKey(raw: string): string {
  return raw
    .trim()
    .replace(/♯/g, "#")
    .replace(/♭/g, "b")
    .replace(/\s+/g, "");
}

/** Traduce una tonalidad tipo "F#m" / "Bb" al español: "Fa sostenido menor" / "Si bemol Mayor". Devuelve null si no se reconoce. */
export function keyToSpanish(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;
  const k = normalizeKey(rawKey);
  const m = k.match(/^([A-Ga-g])(#|b)?(m)?$/);
  if (!m) return null;
  const note = NOTE_ES[m[1].toUpperCase()];
  if (!note) return null;
  const accidental = m[2] === "#" ? " sostenido" : m[2] === "b" ? " bemol" : "";
  const mode = m[3] === "m" ? "menor" : "Mayor";
  return `${note}${accidental} ${mode}`;
}

/** Notación corta en español para badges: "F#m" -> "Fa# m"… en realidad devolvemos la original normalizada para mostrar junto a la traducción. */
export function normalizeKeyShort(rawKey: string | null | undefined): string | null {
  if (!rawKey) return null;
  return normalizeKey(rawKey);
}

export const KEY_OPTIONS = [
  "C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B",
  "Cm", "C#m", "Dm", "D#m", "Em", "Fm", "F#m", "Gm", "G#m", "Am", "A#m", "Bm",
] as const;

const CAMELOT_BY_KEY: Record<(typeof KEY_OPTIONS)[number], string> = {
  C: "8B",
  "C#": "3B",
  D: "10B",
  "D#": "5B",
  E: "12B",
  F: "7B",
  "F#": "2B",
  G: "9B",
  "G#": "4B",
  A: "11B",
  "A#": "6B",
  B: "1B",
  Cm: "5A",
  "C#m": "12A",
  Dm: "7A",
  "D#m": "2A",
  Em: "9A",
  Fm: "4A",
  "F#m": "11A",
  Gm: "6A",
  "G#m": "1A",
  Am: "8A",
  "A#m": "3A",
  Bm: "10A",
};

export function keyToCamelot(key: (typeof KEY_OPTIONS)[number]): string {
  return CAMELOT_BY_KEY[key];
}
