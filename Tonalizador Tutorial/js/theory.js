/* ============================================================
   Tonalizador · Tutorial interactivo
   theory.js — Datos y lógica musical pura (sin DOM, sin audio)
   Los perfiles tonales y las fórmulas de confianza son los
   mismos que usa el Tonalizador real (local_hpcp_v2_full).
   ============================================================ */
"use strict";

window.Theory = (() => {
  /* ---------- Notas y nombres ---------- */

  const PITCH_CLASSES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  const NOTE_ES = {
    C: "Do", "C#": "Do♯", D: "Re", "D#": "Re♯", E: "Mi", F: "Fa",
    "F#": "Fa♯", G: "Sol", "G#": "Sol♯", A: "La", "A#": "La♯", B: "Si",
  };

  const NOTE_ES_LARGO = {
    C: "Do", "C#": "Do sostenido", D: "Re", "D#": "Re sostenido", E: "Mi",
    F: "Fa", "F#": "Fa sostenido", G: "Sol", "G#": "Sol sostenido",
    A: "La", "A#": "La sostenido", B: "Si",
  };

  /** "F#m" → "Fa sostenido menor" · "D" → "Re Mayor" (misma regla que la app real) */
  function keyToSpanish(keyOf) {
    const m = String(keyOf).match(/^([A-G]#?)(m)?$/);
    if (!m) return keyOf;
    return `${NOTE_ES_LARGO[m[1]]} ${m[2] ? "menor" : "Mayor"}`;
  }

  function keyLabel(pc, mode) {
    return `${PITCH_CLASSES[pc]}${mode === 0 ? "m" : ""}`;
  }

  function keySpanishShort(pc, mode) {
    return `${NOTE_ES[PITCH_CLASSES[pc]]} ${mode === 0 ? "menor" : "Mayor"}`;
  }

  /* ---------- Camelot (tabla idéntica a contracts/keyMap.ts) ---------- */

  const CAMELOT_BY_KEY = {
    C: "8B", "C#": "3B", D: "10B", "D#": "5B", E: "12B", F: "7B",
    "F#": "2B", G: "9B", "G#": "4B", A: "11B", "A#": "6B", B: "1B",
    Cm: "5A", "C#m": "12A", Dm: "7A", "D#m": "2A", Em: "9A", Fm: "4A",
    "F#m": "11A", Gm: "6A", "G#m": "1A", Am: "8A", "A#m": "3A", Bm: "10A",
  };

  function keyToCamelot(keyOf) {
    return CAMELOT_BY_KEY[keyOf] || "—";
  }

  /** Vecinos compatibles según la regla de la mezcla armónica. */
  function camelotNeighbors(code) {
    const m = String(code).match(/^(\d{1,2})([AB])$/);
    if (!m) return [];
    const n = parseInt(m[1], 10);
    const letter = m[2];
    const prev = ((n + 10) % 12) + 1;
    const next = (n % 12) + 1;
    return [
      `${n}${letter === "A" ? "B" : "A"}`,
      `${prev}${letter}`,
      `${next}${letter}`,
    ];
  }

  /* ---------- Escalas y acordes ---------- */

  const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
  const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // menor natural

  function scaleOf(tonicPc, mode) {
    const steps = mode === 1 ? MAJOR_STEPS : MINOR_STEPS;
    return steps.map(s => (tonicPc + s) % 12);
  }

  /** Tríada sobre un grado (0-6) de la escala, como notas MIDI cerca de la octava base. */
  function triadOnDegree(tonicPc, mode, degree, baseOctave = 4) {
    const steps = mode === 1 ? MAJOR_STEPS : MINOR_STEPS;
    const pick = i => steps[(degree + i) % 7] + 12 * Math.floor((degree + i) / 7);
    const semis = [pick(0), pick(2), pick(4)];
    return semis.map(s => 12 * (baseOctave + 1) + tonicPc + s);
  }

  /** Progresiones típicas expresadas en grados de la escala. */
  const PROGRESSIONS = {
    pop: [0, 4, 5, 3],        // I–V–vi–IV
    cadencia: [0, 3, 4, 0],   // I–IV–V–I
    menor: [0, 5, 3, 4],      // i–VI–iv–V
    balada: [0, 5, 3, 4],
  };

  /* ---------- Perfiles tonales (Krumhansl–Kessler, los del código real) ---------- */

  const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function sum(a) { let t = 0; for (const v of a) t += v; return t; }
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

  /** Correlación de Pearson entre un perfil cromático y un perfil modelo rotado (idéntica al código real). */
  function pearsonAgainstProfile(chroma, profile, root) {
    const cMean = sum(chroma) / 12;
    const pMean = sum(profile) / 12;
    let num = 0, cs = 0, ps = 0;
    for (let pc = 0; pc < 12; pc++) {
      const cv = chroma[pc] - cMean;
      const pv = profile[(pc - root + 12) % 12] - pMean;
      num += cv * pv; cs += cv * cv; ps += pv * pv;
    }
    const den = Math.sqrt(cs * ps);
    return den <= 1e-12 ? -1 : num / den;
  }

  /** Puntúa las 24 tonalidades y las ordena de mejor a peor. */
  function rankKeys(chroma) {
    const out = [];
    for (let pc = 0; pc < 12; pc++) {
      out.push({ key: pc, mode: 1, score: pearsonAgainstProfile(chroma, MAJOR_PROFILE, pc) });
      out.push({ key: pc, mode: 0, score: pearsonAgainstProfile(chroma, MINOR_PROFILE, pc) });
    }
    return out.sort((a, b) => b.score - a.score);
  }

  /** Concentración del perfil (1 − entropía normalizada), idéntica al código real. */
  function chromaConcentration(chroma) {
    const total = sum(chroma);
    if (total <= 1e-12) return 0;
    let entropy = 0;
    for (const v of chroma) {
      const p = v / total;
      if (p > 0) entropy -= p * Math.log(p);
    }
    return clamp(1 - entropy / Math.log(12), 0, 1);
  }

  /** Fórmula de confianza real: 42 % correlación + 30 % separación + 10 % concentración + 18 % acuerdo. */
  function calculateConfidence(best, runnerUp, concentration, agreement) {
    const correlation = clamp((best.score + 0.2) / 1.2, 0, 1);
    const separation = clamp((best.score - runnerUp.score) / 0.22, 0, 1);
    return {
      total: clamp(correlation * 0.42 + separation * 0.3 + concentration * 0.1 + agreement * 0.18, 0, 1),
      correlation, separation, concentration, agreement,
    };
  }

  const RELIABLE_THRESHOLD = 0.62;

  /* ---------- Color por clase de nota (para visualizaciones) ---------- */

  function pitchColor(pc, alpha = 1) {
    const hue = (pc * 30 + 200) % 360;
    return `hsla(${hue}, 78%, 62%, ${alpha})`;
  }

  /* ---------- Canciones de la prueba real en producción ---------- */

  const DEMO_SONGS = [
    { id: "bohemian", title: "Bohemian Rhapsody", artist: "Queen", keyOf: "Cm", bpm: 143, source: "ReccoBeats", cached: false, note: "Modula: la tonalidad mostrada es la predominante global." },
    { id: "billie", title: "Billie Jean", artist: "Michael Jackson", keyOf: "Bm", bpm: 117, source: "ReccoBeats", cached: false, note: null },
    { id: "hotel", title: "Hotel California", artist: "Eagles", keyOf: "D", bpm: 147, source: "ReccoBeats", cached: false, note: "El catálogo cataloga la versión de estudio; el directo del Hell Freezes Over está en otro tono." },
    { id: "rolling", title: "Rolling in the Deep", artist: "Adele", keyOf: "G#", bpm: 105, source: "ReccoBeats", cached: false, note: null },
    { id: "teen", title: "Smells Like Teen Spirit", artist: "Nirvana", keyOf: "C#", bpm: 117, source: "ReccoBeats", cached: false, note: null },
    { id: "desconocida", title: "Mi Nombre", artist: "artista poco documentado", keyOf: null, bpm: null, source: null, cached: false, note: "Ninguna fuente automática dio un dato fiable: pasa a revisión y se ofrece el análisis acústico." },
  ];

  return {
    PITCH_CLASSES, NOTE_ES, NOTE_ES_LARGO, keyToSpanish, keyLabel, keySpanishShort,
    CAMELOT_BY_KEY, keyToCamelot, camelotNeighbors,
    MAJOR_STEPS, MINOR_STEPS, scaleOf, triadOnDegree, PROGRESSIONS,
    MAJOR_PROFILE, MINOR_PROFILE, pearsonAgainstProfile, rankKeys,
    chromaConcentration, calculateConfidence, RELIABLE_THRESHOLD,
    pitchColor, DEMO_SONGS, clamp,
  };
})();
