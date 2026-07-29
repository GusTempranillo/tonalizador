import { describe, expect, it } from "vitest";
import {
  ACOUSTIC_ALGORITHM,
  AcousticAnalysisError,
  analyzeAudioBuffer,
  analyzeAudioFile,
} from "./acousticAnalysis";

const SAMPLE_RATE = 11_025;

describe("análisis acústico local", () => {
  it("detecta Do mayor y un pulso fiable de 120 BPM", async () => {
    const buffer = synthesizeChord({
      frequencies: [261.6256, 329.6276, 391.9954],
      amplitudes: [0.5, 0.3, 0.26],
      durationSeconds: 12,
      bpm: 120,
    });
    const progress: number[] = [];

    const result = await analyzeAudioBuffer(buffer, {
      onProgress: value => progress.push(value),
    });

    expect(result).toMatchObject({
      key: 0,
      mode: 1,
      keyOf: "C",
      keySpanish: "Do Mayor",
      camelot: "8B",
      algorithm: ACOUSTIC_ALGORITHM,
      segments: 3,
    });
    expect(result.confidence).toBeGreaterThan(0.55);
    expect(result.bpm).not.toBeNull();
    expect(result.bpm ?? 0).toBeGreaterThanOrEqual(116);
    expect(result.bpm ?? 0).toBeLessThanOrEqual(124);
    expect(result.windows).toHaveLength(3);
    expect(result.explanation.privacy).toContain("No se ha subido");
    expect(progress[0]).toBe(0);
    expect(progress.at(-1)).toBe(1);
  });

  it("distingue La menor de su relativo mayor", async () => {
    const buffer = synthesizeChord({
      frequencies: [220, 261.6256, 329.6276],
      amplitudes: [0.58, 0.28, 0.24],
      durationSeconds: 10,
    });

    const result = await analyzeAudioBuffer(buffer);

    expect(result.key).toBe(9);
    expect(result.mode).toBe(0);
    expect(result.keyOf).toBe("Am");
    expect(result.keySpanish).toBe("La menor");
    expect(result.camelot).toBe("8A");
    expect(result.bpm).toBeNull();
  });

  it("mezcla estéreo y remuestrea sin cambiar la tonalidad", async () => {
    const left = synthesizeSamples(
      [293.6648, 369.9944, 440],
      [0.52, 0.3, 0.24],
      8,
      22_050
    );
    const right = synthesizeSamples(
      [293.6648, 369.9944, 440],
      [0.45, 0.34, 0.22],
      8,
      22_050,
      Math.PI / 6
    );

    const result = await analyzeAudioBuffer(
      makeAudioBuffer([left, right], 22_050)
    );

    expect(result.keyOf).toBe("D");
    expect(result.keySpanish).toBe("Re Mayor");
  });

  it("selecciona fragmentos acotados de un audio largo", async () => {
    const buffer = synthesizeChord({
      frequencies: [196, 246.9417, 293.6648],
      amplitudes: [0.5, 0.3, 0.25],
      durationSeconds: 40,
      sampleRate: 8_000,
    });

    const result = await analyzeAudioBuffer(buffer, {
      maxAnalysisSeconds: 6,
    });

    expect(result.segments).toBe(3);
    expect(result.analyzedSeconds).toBeCloseTo(6, 1);
    expect(result.windows[0].startSeconds).toBeGreaterThan(0);
    expect(result.windows[2].endSeconds).toBeLessThanOrEqual(40);
  });

  it("rechaza silencio, duración, memoria y archivo fuera de límite", async () => {
    await expect(
      analyzeAudioBuffer(
        makeAudioBuffer([new Float32Array(SAMPLE_RATE * 4)], SAMPLE_RATE)
      )
    ).rejects.toMatchObject({
      code: "ACOUSTIC_SIGNAL_INSUFFICIENT",
    });

    const sixSeconds = synthesizeChord({
      frequencies: [261.6256, 329.6276, 391.9954],
      amplitudes: [0.5, 0.3, 0.2],
      durationSeconds: 6,
    });
    await expect(
      analyzeAudioBuffer(sixSeconds, { maxDurationSeconds: 5 })
    ).rejects.toMatchObject({
      code: "ACOUSTIC_DURATION_LIMIT",
    });
    await expect(
      analyzeAudioBuffer(sixSeconds, { maxDecodedBytes: 2_048 })
    ).rejects.toMatchObject({
      code: "ACOUSTIC_MEMORY_LIMIT",
    });

    const oversizedFile = {
      size: 100,
      arrayBuffer: async () => new ArrayBuffer(100),
    } as File;
    await expect(
      analyzeAudioFile(oversizedFile, { maxFileBytes: 10 })
    ).rejects.toMatchObject({
      code: "ACOUSTIC_FILE_TOO_LARGE",
    });
  });

  it("permite cancelar y aplica un tiempo máximo", async () => {
    const controller = new AbortController();
    controller.abort();
    const buffer = synthesizeChord({
      frequencies: [261.6256, 329.6276, 391.9954],
      amplitudes: [0.5, 0.3, 0.2],
      durationSeconds: 4,
    });
    await expect(
      analyzeAudioBuffer(buffer, { signal: controller.signal })
    ).rejects.toMatchObject({
      code: "ACOUSTIC_ABORTED",
    });

    const longer = synthesizeChord({
      frequencies: [261.6256, 329.6276, 391.9954],
      amplitudes: [0.5, 0.3, 0.2],
      durationSeconds: 30,
    });
    await expect(
      analyzeAudioBuffer(longer, { maxProcessingMs: 1 })
    ).rejects.toBeInstanceOf(AcousticAnalysisError);
    await expect(
      analyzeAudioBuffer(longer, { maxProcessingMs: 1 })
    ).rejects.toMatchObject({
      code: "ACOUSTIC_TIMEOUT",
    });
  });
});

interface SynthesisOptions {
  frequencies: number[];
  amplitudes: number[];
  durationSeconds: number;
  sampleRate?: number;
  bpm?: number;
}

function synthesizeChord(options: SynthesisOptions): AudioBuffer {
  const sampleRate = options.sampleRate ?? SAMPLE_RATE;
  return makeAudioBuffer(
    [
      synthesizeSamples(
        options.frequencies,
        options.amplitudes,
        options.durationSeconds,
        sampleRate,
        0,
        options.bpm
      ),
    ],
    sampleRate
  );
}

function synthesizeSamples(
  frequencies: number[],
  amplitudes: number[],
  durationSeconds: number,
  sampleRate: number,
  phaseOffset = 0,
  bpm?: number
): Float32Array {
  const samples = new Float32Array(Math.floor(durationSeconds * sampleRate));
  const secondsPerBeat = bpm ? 60 / bpm : 0;
  for (let index = 0; index < samples.length; index++) {
    const time = index / sampleRate;
    let value = 0;
    for (let tone = 0; tone < frequencies.length; tone++) {
      value +=
        amplitudes[tone] *
        Math.sin(2 * Math.PI * frequencies[tone] * time + phaseOffset);
    }
    if (bpm) {
      const beatPosition = time % secondsPerBeat;
      if (beatPosition < 0.018) {
        const decay = Math.exp(-beatPosition * 170);
        value +=
          decay *
          (0.34 * Math.sin(2 * Math.PI * 900 * time) +
            0.18 * Math.sin(2 * Math.PI * 1_450 * time));
      }
    }
    samples[index] = Math.max(-1, Math.min(1, value * 0.72));
  }
  return samples;
}

function makeAudioBuffer(
  channels: Float32Array[],
  sampleRate: number
): AudioBuffer {
  const length = channels[0].length;
  return {
    length,
    duration: length / sampleRate,
    sampleRate,
    numberOfChannels: channels.length,
    getChannelData: channel => channels[channel],
  } as AudioBuffer;
}
