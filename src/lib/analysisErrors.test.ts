import { describe, expect, it } from "vitest";
import type { KeyLookupResult } from "@contracts/types";
import {
  analysisRequestErrorMessage,
  incompleteAnalysisMessage,
} from "./analysisErrors";

function failedResult(reasonCode: string): KeyLookupResult {
  return {
    inputId: "song-1",
    title: "Canción",
    artists: ["Artista"],
    status: "error",
    keyOf: null,
    keySpanish: null,
    camelot: null,
    bpm: null,
    confidence: null,
    tonalConfidence: null,
    source: null,
    matchedTrack: null,
    reasonCodes: [reasonCode],
    cached: false,
  };
}

describe("analysis error messages", () => {
  it("explains when the analysis server cannot be reached", () => {
    expect(
      analysisRequestErrorMessage(
        new Error("Unexpected token '<', \"<!DOCTYPE\" is not valid JSON")
      )
    ).toContain("servidor de análisis");
  });

  it("preserves the rate-limit guidance", () => {
    expect(
      analysisRequestErrorMessage(
        new Error("Demasiadas solicitudes. Espera un minuto.")
      )
    ).toContain("Espera un minuto");
  });

  it("distinguishes missing Spotify configuration from a bad CSV", () => {
    expect(
      incompleteAnalysisMessage(3, [failedResult("spotify_not_configured")])
    ).toContain("El archivo está bien");
  });

  it("distinguishes a provider outage", () => {
    expect(
      incompleteAnalysisMessage(3, [
        failedResult("provider_temporarily_unavailable"),
      ])
    ).toContain("Spotify o ReccoBeats");
  });

  it("explains how to resume after Spotify rate limiting", () => {
    expect(
      incompleteAnalysisMessage(2, [failedResult("provider_rate_limited")])
    ).toContain("pulsa «Reintentar»");
  });
});
