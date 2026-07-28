import { describe, expect, it, vi } from "vitest";
import { providerFetch } from "./http";

describe("providerFetch", () => {
  it("reintenta 429 y respeta Retry-After", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("limit", {
        status: 429,
        headers: { "Retry-After": "0" },
      }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const response = await providerFetch("https://provider.test", {}, {
      provider: "spotify",
      fetchImpl: fetchMock,
      maxAttempts: 2,
    });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("devuelve errores no transitorios sin repetir", async () => {
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValue(new Response("missing", { status: 404 }));
    const response = await providerFetch("https://provider.test", {}, {
      provider: "reccobeats",
      fetchImpl: fetchMock,
    });
    expect(response.status).toBe(404);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("aborta peticiones que superan el timeout", async () => {
    const fetchMock = vi.fn<typeof fetch>((_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    );
    await expect(providerFetch("https://provider.test", {}, {
      provider: "spotify",
      fetchImpl: fetchMock,
      timeoutMs: 5,
      maxAttempts: 1,
    })).rejects.toThrow();
  });
});
