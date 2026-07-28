import {
  mysqlTable,
  serial,
  varchar,
  int,
  boolean,
  timestamp,
  text,
  uniqueIndex,
} from "drizzle-orm/mysql-core";

export const songCache = mysqlTable(
  "song_cache",
  {
    id: serial("id").primaryKey(),
    cacheKey: varchar("cache_key", { length: 64 }).notNull(),
    artist: varchar("artist", { length: 512 }).notNull(),
    title: varchar("title", { length: 512 }).notNull(),
    album: varchar("album", { length: 512 }),
    isrc: varchar("isrc", { length: 32 }),
    spotifyId: varchar("spotify_id", { length: 64 }),
    status: varchar("status", { length: 24 }).notNull(),
    keyOf: varchar("key_of", { length: 16 }),
    camelot: varchar("camelot", { length: 8 }),
    bpm: int("bpm"),
    confidenceBp: int("confidence_bp"),
    source: varchar("source", { length: 24 }),
    matchedTitle: varchar("matched_title", { length: 512 }),
    matchedArtists: text("matched_artists"),
    matchedAlbum: varchar("matched_album", { length: 512 }),
    matchedIsrc: varchar("matched_isrc", { length: 32 }),
    matchedDurationMs: int("matched_duration_ms"),
    matchedSpotifyUrl: varchar("matched_spotify_url", { length: 512 }),
    reasonCodes: text("reason_codes"),
    algorithmVersion: varchar("algorithm_version", { length: 32 }).notNull(),
    manual: boolean("manual").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
    expiresAt: timestamp("expires_at"),
  },
  (table) => [uniqueIndex("song_cache_key_idx").on(table.cacheKey)],
);

export type SongCacheRow = typeof songCache.$inferSelect;
