import { KEY_OPTIONS, keyToCamelot, keyToSpanish } from "@contracts/keyMap";

export const ACOUSTIC_ALGORITHM = "local_hpcp_v1";

const DEFAULTS = {
  maxFileBytes: 64 * 1024 * 1024,
  maxDecodedBytes: 384 * 1024 * 1024,
  maxDurationSeconds: 15 * 60,
  maxAnalysisSeconds: 60,
  maxProcessingMs: 15_000,
  segmentCount: 3,
  targetSampleRate: 11_025,
} as const;

const PITCH_CLASSES = [
  "C",
  "C#",
  "D",
  "D#",
  "E",
  "F",
  "F#",
  "G",
  "G#",
  "A",
  "A#",
  "B",
] as const;

const MAJOR_PROFILE = [
  6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88,
] as const;

const MINOR_PROFILE = [
  6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17,
] as const;

export type AcousticAnalysisErrorCode =
  | "ACOUSTIC_ABORTED"
  | "ACOUSTIC_AUDIO_CONTEXT_UNAVAILABLE"
  | "ACOUSTIC_DECODE_FAILED"
  | "ACOUSTIC_DURATION_LIMIT"
  | "ACOUSTIC_FILE_TOO_LARGE"
  | "ACOUSTIC_INVALID_AUDIO"
  | "ACOUSTIC_MEMORY_LIMIT"
  | "ACOUSTIC_SIGNAL_INSUFFICIENT"
  | "ACOUSTIC_TIMEOUT";

export class AcousticAnalysisError extends Error {
  readonly code: AcousticAnalysisErrorCode;

  constructor(code: AcousticAnalysisErrorCode, message: string) {
    super(message);
    this.name = "AcousticAnalysisError";
    this.code = code;
  }
}

export interface AcousticAnalysisOptions {
  maxFileBytes?: number;
  maxDecodedBytes?: number;
  maxDurationSeconds?: number;
  maxAnalysisSeconds?: number;
  maxProcessingMs?: number;
  segmentCount?: number;
  targetSampleRate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface AcousticWindowResult {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
  key: number;
  mode: 0 | 1;
  keyOf: string;
  keySpanish: string;
  camelot: string;
  confidence: number;
  tonalScore: number;
}

export interface AcousticExplanation {
  privacy: string;
  selection: string;
  tonalMethod: string;
  tempoMethod: string;
  confidence: string;
}

export interface AcousticAnalysisResult {
  /** Pitch class compatible con Spotify: 0 = Do/C … 11 = Si/B. */
  key: number;
  /** Modo compatible con Spotify: 0 = menor, 1 = mayor. */
  mode: 0 | 1;
  keyOf: string;
  keySpanish: string;
  camelot: string;
  bpm: number | null;
  bpmConfidence: number | null;
  confidence: number;
  isReliable: boolean;
  analyzedSeconds: number;
  segments: number;
  algorithm: typeof ACOUSTIC_ALGORITHM;
  windows: AcousticWindowResult[];
  explanation: AcousticExplanation;
}

interface ResolvedOptions {
  maxFileBytes: number;
  maxDecodedBytes: number;
  maxDurationSeconds: number;
  maxAnalysisSeconds: number;
  maxProcessingMs: number;
  segmentCount: number;
  targetSampleRate: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

interface Segment {
  startSeconds: number;
  durationSeconds: number;
}

interface ChromaEvidence {
  chroma: number[];
  acceptedFrames: number;
  totalFrames: number;
  concentration: number;
}

interface KeyCandidate {
  key: number;
  mode: 0 | 1;
  score: number;
}

interface TempoEvidence {
  bpm: number | null;
  confidence: number | null;
}

interface ProcessingGuard {
  deadline: number;
  signal?: AbortSignal;
}

function now(): number {
  return typeof performance === "undefined" ? Date.now() : performance.now();
}

function finiteOption(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_INVALID_AUDIO",
      "Los límites del análisis acústico no son válidos."
    );
  }
  return value;
}

function resolveOptions(options: AcousticAnalysisOptions): ResolvedOptions {
  return {
    maxFileBytes: finiteOption(
      options.maxFileBytes,
      DEFAULTS.maxFileBytes,
      1,
      512 * 1024 * 1024
    ),
    maxDecodedBytes: finiteOption(
      options.maxDecodedBytes,
      DEFAULTS.maxDecodedBytes,
      1024,
      1024 * 1024 * 1024
    ),
    maxDurationSeconds: finiteOption(
      options.maxDurationSeconds,
      DEFAULTS.maxDurationSeconds,
      1,
      60 * 60
    ),
    maxAnalysisSeconds: finiteOption(
      options.maxAnalysisSeconds,
      DEFAULTS.maxAnalysisSeconds,
      3,
      180
    ),
    maxProcessingMs: finiteOption(
      options.maxProcessingMs,
      DEFAULTS.maxProcessingMs,
      1,
      120_000
    ),
    segmentCount: Math.round(
      finiteOption(options.segmentCount, DEFAULTS.segmentCount, 1, 5)
    ),
    targetSampleRate: Math.round(
      finiteOption(
        options.targetSampleRate,
        DEFAULTS.targetSampleRate,
        8_000,
        24_000
      )
    ),
    signal: options.signal,
    onProgress: options.onProgress,
  };
}

function reportProgress(options: ResolvedOptions, progress: number): void {
  try {
    options.onProgress?.(Math.max(0, Math.min(1, progress)));
  } catch {
    // El progreso es informativo; un callback visual nunca invalida el audio.
  }
}

function assertCanContinue(guard: ProcessingGuard): void {
  if (guard.signal?.aborted) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_ABORTED",
      "El análisis acústico se ha cancelado."
    );
  }
  if (now() >= guard.deadline) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_TIMEOUT",
      "El análisis acústico ha superado el tiempo máximo permitido."
    );
  }
}

function wipeArrayBuffer(buffer: ArrayBuffer): void {
  try {
    new Uint8Array(buffer).fill(0);
  } catch {
    // Algunos navegadores transfieren el ArrayBuffer al decodificador.
  }
}

function wipeDecodedAudio(buffer: AudioBuffer): void {
  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    buffer.getChannelData(channel).fill(0);
  }
}

/**
 * Decodifica y analiza un archivo íntegramente en el navegador.
 * No usa fetch, no envía bytes y borra las copias temporales al terminar.
 */
export async function analyzeAudioFile(
  file: File,
  options: AcousticAnalysisOptions = {}
): Promise<AcousticAnalysisResult> {
  const resolved = resolveOptions(options);
  if (file.size > resolved.maxFileBytes) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_FILE_TOO_LARGE",
      `El archivo supera el límite local de ${formatMegabytes(
        resolved.maxFileBytes
      )}.`
    );
  }
  if (resolved.signal?.aborted) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_ABORTED",
      "El análisis acústico se ha cancelado."
    );
  }
  if (typeof AudioContext === "undefined") {
    throw new AcousticAnalysisError(
      "ACOUSTIC_AUDIO_CONTEXT_UNAVAILABLE",
      "Este navegador no permite decodificar audio localmente."
    );
  }

  reportProgress(resolved, 0.02);
  let encoded: ArrayBuffer | null = null;
  let decoded: AudioBuffer | null = null;
  const context = new AudioContext();
  try {
    encoded = await file.arrayBuffer();
    if (resolved.signal?.aborted) {
      throw new AcousticAnalysisError(
        "ACOUSTIC_ABORTED",
        "El análisis acústico se ha cancelado."
      );
    }
    reportProgress(resolved, 0.06);
    try {
      decoded = await context.decodeAudioData(encoded);
    } catch (error) {
      throw new AcousticAnalysisError(
        "ACOUSTIC_DECODE_FAILED",
        error instanceof Error
          ? `No se pudo decodificar el audio: ${error.message}`
          : "No se pudo decodificar el audio."
      );
    }
    reportProgress(resolved, 0.1);
    return await analyzeAudioBuffer(decoded, {
      ...resolved,
      onProgress: progress => reportProgress(resolved, 0.1 + progress * 0.9),
    });
  } finally {
    if (encoded) wipeArrayBuffer(encoded);
    if (decoded) wipeDecodedAudio(decoded);
    await context.close().catch(() => undefined);
  }
}

/**
 * Analiza un AudioBuffer ya decodificado. El buffer recibido no se modifica ni
 * se conserva; únicamente se crean fragmentos mono acotados que se limpian.
 */
export async function analyzeAudioBuffer(
  buffer: AudioBuffer,
  options: AcousticAnalysisOptions = {}
): Promise<AcousticAnalysisResult> {
  const resolved = resolveOptions(options);
  validateAudioBuffer(buffer, resolved);
  const guard: ProcessingGuard = {
    deadline: now() + resolved.maxProcessingMs,
    signal: resolved.signal,
  };
  assertCanContinue(guard);
  reportProgress(resolved, 0);

  const durationSeconds = buffer.length / buffer.sampleRate;
  const segments = selectRepresentativeSegments(
    durationSeconds,
    resolved.maxAnalysisSeconds,
    resolved.segmentCount
  );
  const channels = Array.from(
    { length: buffer.numberOfChannels },
    (_, channel) => buffer.getChannelData(channel)
  );
  const chromaBySegment: ChromaEvidence[] = [];
  const pcmBySegment: Float32Array[] = [];
  let analyzedSeconds = 0;

  try {
    for (let index = 0; index < segments.length; index++) {
      assertCanContinue(guard);
      const segment = segments[index];
      const samples = downmixAndResample(
        channels,
        buffer.sampleRate,
        buffer.length,
        segment,
        resolved.targetSampleRate,
        guard
      );
      pcmBySegment.push(samples);
      analyzedSeconds += samples.length / resolved.targetSampleRate;
      const evidence = extractChroma(samples, resolved.targetSampleRate, guard);
      chromaBySegment.push(evidence);
      reportProgress(resolved, 0.15 + ((index + 1) / segments.length) * 0.62);
      await yieldToBrowser();
    }

    assertCanContinue(guard);
    const combined = combineChroma(chromaBySegment);
    if (combined.acceptedFrames < 2 || sum(combined.chroma) <= 0) {
      throw new AcousticAnalysisError(
        "ACOUSTIC_SIGNAL_INSUFFICIENT",
        "El fragmento no contiene suficiente información tonal."
      );
    }

    const globalCandidates = rankKeys(combined.chroma);
    const best = globalCandidates[0];
    const runnerUp = globalCandidates[1];
    const windowCandidates = chromaBySegment.map(evidence => {
      const candidates = rankKeys(evidence.chroma);
      return {
        best: candidates[0],
        runnerUp: candidates[1],
        concentration: evidence.concentration,
      };
    });
    const agreement =
      windowCandidates.filter(
        candidate =>
          candidate.best.key === best.key && candidate.best.mode === best.mode
      ).length / windowCandidates.length;
    const confidence = calculateConfidence(
      best,
      runnerUp,
      combined.concentration,
      agreement
    );
    const windows = windowCandidates.map((candidate, index) =>
      makeWindowResult(
        segments[index],
        candidate.best,
        calculateConfidence(
          candidate.best,
          candidate.runnerUp,
          candidate.concentration,
          1
        )
      )
    );

    reportProgress(resolved, 0.82);
    const tempo = estimateTempo(pcmBySegment, resolved.targetSampleRate, guard);
    const keyOf = toKeyOf(best.key, best.mode);
    const keySpanish = keyToSpanish(keyOf) ?? keyOf;
    const camelot = keyToCamelot(asKeyOption(keyOf));
    const isReliable =
      confidence >= 0.62 &&
      best.score >= 0.25 &&
      (segments.length === 1 || agreement >= 0.5);

    reportProgress(resolved, 1);
    return {
      key: best.key,
      mode: best.mode,
      keyOf,
      keySpanish,
      camelot,
      bpm: tempo.bpm,
      bpmConfidence: tempo.confidence,
      confidence: round(confidence, 3),
      isReliable,
      analyzedSeconds: round(analyzedSeconds, 1),
      segments: segments.length,
      algorithm: ACOUSTIC_ALGORITHM,
      windows,
      explanation: {
        privacy:
          "El audio se ha decodificado y analizado en este navegador. No se ha subido ni se conserva.",
        selection:
          segments.length === 1
            ? `Se ha analizado un fragmento de ${round(
                analyzedSeconds,
                1
              )} segundos.`
            : `Se han analizado ${segments.length} fragmentos representativos (inicio útil, zona central y tramo final), ${round(
                analyzedSeconds,
                1
              )} segundos en total.`,
        tonalMethod:
          "Cada fragmento se mezcla a mono, se remuestrea y se transforma en un perfil cromático de 12 notas. Ese perfil se compara con modelos tonales de tonalidad mayor y menor.",
        tempoMethod:
          tempo.bpm === null
            ? "No se ha mostrado BPM porque el patrón de ataques no era suficientemente estable."
            : `El BPM se ha estimado a partir de la periodicidad de los ataques, con confianza ${Math.round(
                (tempo.confidence ?? 0) * 100
              )} %.`,
        confidence: isReliable
          ? `Los fragmentos coinciden y la confianza tonal es del ${Math.round(
              confidence * 100
            )} %.`
          : `El resultado es orientativo: la confianza tonal es del ${Math.round(
              confidence * 100
            )} % y conviene mostrarlo como dudoso.`,
      },
    };
  } finally {
    for (const samples of pcmBySegment) samples.fill(0);
  }
}

function validateAudioBuffer(
  buffer: AudioBuffer,
  options: ResolvedOptions
): void {
  if (
    !Number.isInteger(buffer.length) ||
    buffer.length <= 0 ||
    !Number.isFinite(buffer.sampleRate) ||
    buffer.sampleRate < 8_000 ||
    buffer.sampleRate > 384_000 ||
    !Number.isInteger(buffer.numberOfChannels) ||
    buffer.numberOfChannels < 1 ||
    buffer.numberOfChannels > 8
  ) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_INVALID_AUDIO",
      "El audio decodificado no tiene un formato válido."
    );
  }
  const durationSeconds = buffer.length / buffer.sampleRate;
  if (durationSeconds > options.maxDurationSeconds) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_DURATION_LIMIT",
      `El audio dura ${round(
        durationSeconds / 60,
        1
      )} minutos y supera el límite de ${round(
        options.maxDurationSeconds / 60,
        1
      )}.`
    );
  }
  const decodedBytes = buffer.length * buffer.numberOfChannels * 4;
  if (
    !Number.isSafeInteger(decodedBytes) ||
    decodedBytes > options.maxDecodedBytes
  ) {
    throw new AcousticAnalysisError(
      "ACOUSTIC_MEMORY_LIMIT",
      `El audio decodificado supera el límite local de ${formatMegabytes(
        options.maxDecodedBytes
      )}.`
    );
  }
}

function selectRepresentativeSegments(
  durationSeconds: number,
  maxAnalysisSeconds: number,
  requestedCount: number
): Segment[] {
  const analyzedSeconds = Math.min(durationSeconds, maxAnalysisSeconds);
  const count =
    durationSeconds < 12 || requestedCount === 1 ? 1 : requestedCount;
  if (count === 1) {
    const startSeconds = Math.max(0, (durationSeconds - analyzedSeconds) / 2);
    return [{ startSeconds, durationSeconds: analyzedSeconds }];
  }

  const segmentDuration = analyzedSeconds / count;
  if (durationSeconds <= maxAnalysisSeconds) {
    return Array.from({ length: count }, (_, index) => ({
      startSeconds: index * segmentDuration,
      durationSeconds:
        index === count - 1
          ? durationSeconds - index * segmentDuration
          : segmentDuration,
    }));
  }

  const firstCenter = 0.18;
  const lastCenter = 0.82;
  return Array.from({ length: count }, (_, index) => {
    const ratio =
      count === 1
        ? 0.5
        : firstCenter + ((lastCenter - firstCenter) * index) / (count - 1);
    const startSeconds = clamp(
      durationSeconds * ratio - segmentDuration / 2,
      0,
      durationSeconds - segmentDuration
    );
    return { startSeconds, durationSeconds: segmentDuration };
  });
}

function downmixAndResample(
  channels: Float32Array[],
  sourceRate: number,
  sourceLength: number,
  segment: Segment,
  targetRate: number,
  guard: ProcessingGuard
): Float32Array {
  const targetLength = Math.max(
    1,
    Math.floor(segment.durationSeconds * targetRate)
  );
  const output = new Float32Array(targetLength);
  const sourceStart = segment.startSeconds * sourceRate;
  const sourceStep = sourceRate / targetRate;

  for (let index = 0; index < targetLength; index++) {
    if ((index & 0x3fff) === 0) assertCanContinue(guard);
    const position = Math.min(
      sourceLength - 1,
      sourceStart + index * sourceStep
    );
    const left = Math.floor(position);
    const right = Math.min(sourceLength - 1, left + 1);
    const fraction = position - left;
    let mixed = 0;
    for (const channel of channels) {
      mixed += channel[left] + (channel[right] - channel[left]) * fraction;
    }
    output[index] = mixed / channels.length;
  }
  return output;
}

function extractChroma(
  samples: Float32Array,
  sampleRate: number,
  guard: ProcessingGuard
): ChromaEvidence {
  const frameSize = 4096;
  const hopSize = 2048;
  const totalFrames = Math.max(
    1,
    Math.floor(Math.max(0, samples.length - frameSize) / hopSize) + 1
  );
  const hann = new Float64Array(frameSize);
  for (let index = 0; index < frameSize; index++) {
    hann[index] = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (frameSize - 1));
  }
  const real = new Float64Array(frameSize);
  const imaginary = new Float64Array(frameSize);
  const aggregate = Array<number>(12).fill(0);
  const frameChroma = Array<number>(12).fill(0);
  const minimumBin = Math.max(1, Math.ceil((55 * frameSize) / sampleRate));
  const maximumBin = Math.min(
    frameSize / 2 - 1,
    Math.floor((4_000 * frameSize) / sampleRate)
  );
  let acceptedFrames = 0;

  for (let frame = 0; frame < totalFrames; frame++) {
    if ((frame & 0x7) === 0) assertCanContinue(guard);
    const offset = frame * hopSize;
    let mean = 0;
    let squareSum = 0;
    const available = Math.min(frameSize, samples.length - offset);
    for (let index = 0; index < available; index++) {
      mean += samples[offset + index];
    }
    mean /= Math.max(1, available);
    for (let index = 0; index < frameSize; index++) {
      const sample = index < available ? samples[offset + index] - mean : 0;
      squareSum += sample * sample;
      real[index] = sample * hann[index];
      imaginary[index] = 0;
    }
    const rms = Math.sqrt(squareSum / Math.max(1, available));
    if (rms < 0.0001) continue;

    fftInPlace(real, imaginary);
    frameChroma.fill(0);
    let maximumMagnitude = 0;
    for (let bin = minimumBin; bin <= maximumBin; bin++) {
      const magnitude = Math.hypot(real[bin], imaginary[bin]);
      if (magnitude > maximumMagnitude) maximumMagnitude = magnitude;
    }
    if (maximumMagnitude <= 1e-8) continue;

    for (let bin = minimumBin + 1; bin < maximumBin; bin++) {
      const magnitude = Math.hypot(real[bin], imaginary[bin]);
      if (magnitude < maximumMagnitude * 0.0125) continue;
      const previous = Math.hypot(real[bin - 1], imaginary[bin - 1]);
      const next = Math.hypot(real[bin + 1], imaginary[bin + 1]);
      if (magnitude < previous || magnitude < next) continue;
      const frequency = (bin * sampleRate) / frameSize;
      const midi = 69 + 12 * Math.log2(frequency / 440);
      const nearestMidi = Math.round(midi);
      const pitchClass = ((nearestMidi % 12) + 12) % 12;
      const tuningDistance = Math.abs(midi - nearestMidi);
      const tuningWeight = Math.exp(-4 * tuningDistance * tuningDistance);
      const frequencyWeight = Math.pow(440 / frequency, 0.12);
      frameChroma[pitchClass] +=
        Math.sqrt(magnitude / maximumMagnitude) *
        tuningWeight *
        frequencyWeight;
    }

    const norm = Math.sqrt(
      frameChroma.reduce((total, value) => total + value * value, 0)
    );
    if (norm <= 1e-8) continue;
    for (let pitch = 0; pitch < 12; pitch++) {
      aggregate[pitch] += frameChroma[pitch] / norm;
    }
    acceptedFrames++;
  }

  if (acceptedFrames > 0) {
    for (let pitch = 0; pitch < 12; pitch++) {
      aggregate[pitch] /= acceptedFrames;
    }
  }
  return {
    chroma: aggregate,
    acceptedFrames,
    totalFrames,
    concentration: chromaConcentration(aggregate),
  };
}

function fftInPlace(real: Float64Array, imaginary: Float64Array): void {
  const length = real.length;
  for (let index = 1, reversed = 0; index < length; index++) {
    let bit = length >> 1;
    while (reversed & bit) {
      reversed ^= bit;
      bit >>= 1;
    }
    reversed ^= bit;
    if (index < reversed) {
      const realValue = real[index];
      real[index] = real[reversed];
      real[reversed] = realValue;
      const imaginaryValue = imaginary[index];
      imaginary[index] = imaginary[reversed];
      imaginary[reversed] = imaginaryValue;
    }
  }

  for (let size = 2; size <= length; size <<= 1) {
    const angle = (-2 * Math.PI) / size;
    const phaseStepReal = Math.cos(angle);
    const phaseStepImaginary = Math.sin(angle);
    for (let offset = 0; offset < length; offset += size) {
      let phaseReal = 1;
      let phaseImaginary = 0;
      for (let index = 0; index < size / 2; index++) {
        const even = offset + index;
        const odd = even + size / 2;
        const oddReal = real[odd] * phaseReal - imaginary[odd] * phaseImaginary;
        const oddImaginary =
          real[odd] * phaseImaginary + imaginary[odd] * phaseReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextPhaseReal =
          phaseReal * phaseStepReal - phaseImaginary * phaseStepImaginary;
        phaseImaginary =
          phaseReal * phaseStepImaginary + phaseImaginary * phaseStepReal;
        phaseReal = nextPhaseReal;
      }
    }
  }
}

function combineChroma(evidence: ChromaEvidence[]): ChromaEvidence {
  const chroma = Array<number>(12).fill(0);
  let acceptedFrames = 0;
  let totalFrames = 0;
  for (const item of evidence) {
    const weight = Math.max(1, item.acceptedFrames);
    for (let pitch = 0; pitch < 12; pitch++) {
      chroma[pitch] += item.chroma[pitch] * weight;
    }
    acceptedFrames += item.acceptedFrames;
    totalFrames += item.totalFrames;
  }
  if (acceptedFrames > 0) {
    for (let pitch = 0; pitch < 12; pitch++) {
      chroma[pitch] /= acceptedFrames;
    }
  }
  return {
    chroma,
    acceptedFrames,
    totalFrames,
    concentration: chromaConcentration(chroma),
  };
}

function rankKeys(chroma: number[]): KeyCandidate[] {
  const candidates: KeyCandidate[] = [];
  for (let key = 0; key < 12; key++) {
    candidates.push({
      key,
      mode: 1,
      score: pearsonAgainstProfile(chroma, MAJOR_PROFILE, key),
    });
    candidates.push({
      key,
      mode: 0,
      score: pearsonAgainstProfile(chroma, MINOR_PROFILE, key),
    });
  }
  return candidates.sort((left, right) => right.score - left.score);
}

function pearsonAgainstProfile(
  chroma: number[],
  profile: readonly number[],
  root: number
): number {
  const chromaMean = sum(chroma) / chroma.length;
  const profileMean = sum(profile) / profile.length;
  let numerator = 0;
  let chromaSquares = 0;
  let profileSquares = 0;
  for (let pitch = 0; pitch < 12; pitch++) {
    const chromaValue = chroma[pitch] - chromaMean;
    const profileValue = profile[(pitch - root + 12) % 12] - profileMean;
    numerator += chromaValue * profileValue;
    chromaSquares += chromaValue * chromaValue;
    profileSquares += profileValue * profileValue;
  }
  const denominator = Math.sqrt(chromaSquares * profileSquares);
  return denominator <= 1e-12 ? -1 : numerator / denominator;
}

function chromaConcentration(chroma: number[]): number {
  const total = sum(chroma);
  if (total <= 1e-12) return 0;
  let entropy = 0;
  for (const value of chroma) {
    const probability = value / total;
    if (probability > 0) entropy -= probability * Math.log(probability);
  }
  return clamp(1 - entropy / Math.log(12), 0, 1);
}

function calculateConfidence(
  best: KeyCandidate,
  runnerUp: KeyCandidate,
  concentration: number,
  agreement: number
): number {
  const correlation = clamp((best.score + 0.2) / 1.2, 0, 1);
  const separation = clamp((best.score - runnerUp.score) / 0.22, 0, 1);
  return clamp(
    correlation * 0.42 +
      separation * 0.3 +
      concentration * 0.1 +
      agreement * 0.18,
    0,
    1
  );
}

function makeWindowResult(
  segment: Segment,
  candidate: KeyCandidate,
  confidence: number
): AcousticWindowResult {
  const keyOf = toKeyOf(candidate.key, candidate.mode);
  return {
    startSeconds: round(segment.startSeconds, 1),
    endSeconds: round(segment.startSeconds + segment.durationSeconds, 1),
    durationSeconds: round(segment.durationSeconds, 1),
    key: candidate.key,
    mode: candidate.mode,
    keyOf,
    keySpanish: keyToSpanish(keyOf) ?? keyOf,
    camelot: keyToCamelot(asKeyOption(keyOf)),
    confidence: round(confidence, 3),
    tonalScore: round(candidate.score, 3),
  };
}

function estimateTempo(
  segments: Float32Array[],
  sampleRate: number,
  guard: ProcessingGuard
): TempoEvidence {
  const hopSize = 128;
  const frameSize = 512;
  const envelopes = segments
    .map(samples => onsetEnvelope(samples, frameSize, hopSize, guard))
    .filter(envelope => envelope.some(value => value > 0));
  if (envelopes.length === 0) return { bpm: null, confidence: null };

  const envelopeRate = sampleRate / hopSize;
  const correlationAt = (lag: number): number => {
    let numerator = 0;
    let leftSquares = 0;
    let rightSquares = 0;
    for (const envelope of envelopes) {
      if (lag >= envelope.length) continue;
      for (let index = lag; index < envelope.length; index++) {
        const left = envelope[index];
        const right = envelope[index - lag];
        numerator += left * right;
        leftSquares += left * left;
        rightSquares += right * right;
      }
    }
    const denominator = Math.sqrt(leftSquares * rightSquares);
    return denominator <= 1e-12 ? 0 : numerator / denominator;
  };

  const candidates: Array<{ bpm: number; score: number; raw: number }> = [];
  const minimumLag = Math.max(2, Math.floor((envelopeRate * 60) / 200));
  const maximumLag = Math.ceil((envelopeRate * 60) / 55);
  for (let lag = minimumLag; lag <= maximumLag; lag++) {
    if ((lag & 0xf) === 0) assertCanContinue(guard);
    const bpm = (60 * envelopeRate) / lag;
    const raw = correlationAt(lag);
    const slowHarmonic = lag * 2 <= maximumLag ? correlationAt(lag * 2) : 0;
    const fastHarmonic =
      Math.round(lag / 2) >= minimumLag
        ? correlationAt(Math.round(lag / 2))
        : 0;
    const preferredRange = bpm >= 75 && bpm <= 165 ? 0.025 : 0;
    candidates.push({
      bpm,
      raw,
      score: raw + slowHarmonic * 0.5 + fastHarmonic * 0.2 + preferredRange,
    });
  }
  candidates.sort((left, right) => right.score - left.score);
  const best = candidates[0];
  const competitor =
    candidates.find(
      candidate =>
        Math.abs(candidate.bpm - best.bpm) > 5 &&
        Math.abs(candidate.bpm * 2 - best.bpm) > 5 &&
        Math.abs(candidate.bpm - best.bpm * 2) > 5
    ) ?? candidates[1];
  const separation = clamp((best.score - competitor.score) / 0.25, 0, 1);
  const confidence = clamp(best.raw * 0.72 + separation * 0.28, 0, 1);
  if (best.raw < 0.16 || confidence < 0.28) {
    return { bpm: null, confidence: null };
  }
  return {
    bpm: round(best.bpm, 1),
    confidence: round(confidence, 3),
  };
}

function onsetEnvelope(
  samples: Float32Array,
  frameSize: number,
  hopSize: number,
  guard: ProcessingGuard
): number[] {
  const frameCount = Math.max(
    0,
    Math.floor((samples.length - frameSize) / hopSize) + 1
  );
  if (frameCount < 4) return [];
  const logEnergy = Array<number>(frameCount).fill(0);
  for (let frame = 0; frame < frameCount; frame++) {
    if ((frame & 0x3f) === 0) assertCanContinue(guard);
    const offset = frame * hopSize;
    let energy = 0;
    let previous = samples[offset];
    for (let index = 1; index < frameSize; index++) {
      const sample = samples[offset + index];
      const highFrequency = sample - previous;
      energy += highFrequency * highFrequency;
      previous = sample;
    }
    logEnergy[frame] = Math.log1p((energy / frameSize) * 10_000);
  }

  const novelty = Array<number>(frameCount).fill(0);
  for (let frame = 1; frame < frameCount; frame++) {
    const historyStart = Math.max(0, frame - 6);
    let history = 0;
    for (let previous = historyStart; previous < frame; previous++) {
      history += logEnergy[previous];
    }
    history /= frame - historyStart;
    novelty[frame] = Math.max(0, logEnergy[frame] - history);
  }
  const mean = sum(novelty) / novelty.length;
  let variance = 0;
  for (const value of novelty) variance += (value - mean) ** 2;
  const deviation = Math.sqrt(variance / novelty.length);
  const threshold = Math.max(0.12, mean + deviation * 0.85);
  if (deviation <= 1e-5) return novelty.fill(0);

  const envelope = Array<number>(frameCount).fill(0);
  let peakCount = 0;
  for (let index = 1; index < novelty.length - 1; index++) {
    if (
      novelty[index] >= threshold &&
      novelty[index] >= novelty[index - 1] &&
      novelty[index] > novelty[index + 1]
    ) {
      envelope[index] = (novelty[index] - threshold) / deviation;
      peakCount++;
    }
  }
  return peakCount < 4 ? envelope.fill(0) : envelope;
}

function toKeyOf(key: number, mode: 0 | 1): string {
  return `${PITCH_CLASSES[key]}${mode === 0 ? "m" : ""}`;
}

function asKeyOption(value: string): (typeof KEY_OPTIONS)[number] {
  if ((KEY_OPTIONS as readonly string[]).includes(value)) {
    return value as (typeof KEY_OPTIONS)[number];
  }
  throw new AcousticAnalysisError(
    "ACOUSTIC_INVALID_AUDIO",
    "La tonalidad calculada no se puede representar."
  );
}

function formatMegabytes(bytes: number): string {
  return `${round(bytes / (1024 * 1024), 1)} MB`;
}

function round(value: number, decimals: number): number {
  const multiplier = 10 ** decimals;
  return Math.round(value * multiplier) / multiplier;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function sum(values: ArrayLike<number>): number {
  let total = 0;
  for (let index = 0; index < values.length; index++) total += values[index];
  return total;
}

function yieldToBrowser(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}
