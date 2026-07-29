import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./concurrency";

describe("mapWithConcurrency", () => {
  it("preserva el orden y nunca supera el límite", async () => {
    let active = 0;
    let maximumActive = 0;

    const result = await mapWithConcurrency(
      [30, 5, 20, 1],
      2,
      async (delay, index) => {
        active++;
        maximumActive = Math.max(maximumActive, active);
        await new Promise(resolve => setTimeout(resolve, delay));
        active--;
        return `result-${index}`;
      }
    );

    expect(result).toEqual(["result-0", "result-1", "result-2", "result-3"]);
    expect(maximumActive).toBe(2);
  });
});
