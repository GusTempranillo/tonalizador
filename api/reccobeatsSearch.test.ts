import { describe, expect, it, vi } from "vitest";
import type { MatchedTrack } from "@contracts/types";
import { findReccoSearchMatch } from "./reccobeatsSearch";

const reference: MatchedTrack = {
  spotifyId: "3JemHk5C9z0UlSgAskbBcy",
  title: "Bohemian Rhapsody",
  artists: ["Queen"],
  album: "A Night at the Opera",
  isrc: "GBUM71029604",
  durationMs: 354_320,
  spotifyUrl: "https://open.spotify.com/track/3JemHk5C9z0UlSgAskbBcy",
};

function page(content: unknown[], pageNumber: number, totalPages = 8) {
  return {
    content,
    page: pageNumber,
    size: 25,
    totalPages,
  };
}

describe("findReccoSearchMatch", () => {
  it("recorre como máximo 0..2 y encuentra el Spotify ID exacto", async () => {
    const searchPage = vi.fn(async (pageNumber: number) =>
      page(
        pageNumber === 2
          ? [
              {
                id: "recco-studio",
                trackTitle: "Bohemian Rhapsody",
                artists: [{ name: "Queen" }],
                isrc: "GBUM71029604",
                durationMs: 354_320,
                href: "https://open.spotify.com/track/3JemHk5C9z0UlSgAskbBcy",
              },
            ]
          : [
              {
                id: `cover-${pageNumber}`,
                trackTitle: "Bohemian Rhapsody",
                artists: [{ name: "Cover Band" }],
              },
            ],
        pageNumber
      )
    );

    await expect(
      findReccoSearchMatch(reference, searchPage)
    ).resolves.toMatchObject({
      internalId: "recco-studio",
      reasonCode: "reccobeats_search_exact_spotify_id",
    });
    expect(searchPage.mock.calls.map(([pageNumber]) => pageNumber)).toEqual([
      0, 1, 2,
    ]);
  });

  it("prefiere un ISRC exacto aunque el enlace de Spotify haya cambiado", async () => {
    const searchPage = vi.fn().mockResolvedValue(
      page(
        [
          {
            id: "exact-isrc",
            trackTitle: "Bohemian Rhapsody",
            artists: [{ name: "Queen" }],
            isrc: "gbum71029604",
            href: "https://open.spotify.com/track/0000000000000000000000",
          },
        ],
        0
      )
    );

    await expect(
      findReccoSearchMatch(reference, searchPage)
    ).resolves.toMatchObject({
      internalId: "exact-isrc",
      reasonCode: "reccobeats_search_exact_isrc",
    });
  });

  it("acepta título y artista exactos normalizando acentos y puntuación", async () => {
    const searchPage = vi.fn().mockResolvedValue(
      page(
        [
          {
            id: "exact-metadata",
            trackTitle: "BOHEMIAN—RHAPSODY",
            artists: [{ name: "QUEEN" }],
            href: null,
          },
        ],
        0
      )
    );

    await expect(
      findReccoSearchMatch(reference, searchPage)
    ).resolves.toMatchObject({
      internalId: "exact-metadata",
      reasonCode: "reccobeats_search_exact_metadata",
    });
  });

  it("identifica por título y artista aunque Spotify esté temporalmente inaccesible", async () => {
    const searchPage = vi.fn().mockResolvedValue(
      page(
        [
          {
            id: "recco-only",
            trackTitle: "Bohemian Rhapsody",
            artists: [{ name: "Queen" }],
            durationMs: 354_320,
          },
        ],
        0,
        1
      )
    );

    await expect(
      findReccoSearchMatch(
        {
          title: reference.title,
          artists: reference.artists,
          durationMs: reference.durationMs,
        },
        searchPage
      )
    ).resolves.toMatchObject({
      internalId: "recco-only",
      reasonCode: "reccobeats_search_exact_metadata",
    });
  });

  it("rechaza covers, directos, remasters y resultados ambiguos", async () => {
    const searchPage = vi.fn(async (pageNumber: number) =>
      page(
        [
          {
            id: `cover-${pageNumber}`,
            trackTitle: "Bohemian Rhapsody",
            artists: [{ name: "Cover Band" }],
          },
          {
            id: `live-${pageNumber}`,
            trackTitle: "Bohemian Rhapsody - Live",
            artists: [{ name: "Queen" }],
          },
          {
            id: `remaster-${pageNumber}`,
            trackTitle: "Bohemian Rhapsody - Remastered 2011",
            artists: [{ name: "Queen" }],
          },
        ],
        pageNumber
      )
    );

    await expect(
      findReccoSearchMatch(reference, searchPage)
    ).resolves.toBeNull();
    expect(searchPage).toHaveBeenCalledTimes(3);
  });

  it("se detiene si la API declara que no quedan páginas", async () => {
    const searchPage = vi.fn().mockResolvedValue(
      page(
        [
          {
            id: "wrong",
            trackTitle: "Another Song",
            artists: ["Queen"],
          },
        ],
        0,
        1
      )
    );

    await expect(
      findReccoSearchMatch(reference, searchPage)
    ).resolves.toBeNull();
    expect(searchPage).toHaveBeenCalledOnce();
  });
});
