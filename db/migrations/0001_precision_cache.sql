-- Rebuilds the prototype cache into the versioned, auditable v2 schema.
-- Back up production data before applying; old positive rows intentionally do not
-- migrate because they lack confidence and canonical identifiers.
DROP TABLE IF EXISTS `song_cache`;

CREATE TABLE `song_cache` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `cache_key` varchar(64) NOT NULL,
  `artist` varchar(512) NOT NULL,
  `title` varchar(512) NOT NULL,
  `album` varchar(512),
  `isrc` varchar(32),
  `spotify_id` varchar(64),
  `status` varchar(24) NOT NULL,
  `key_of` varchar(16),
  `camelot` varchar(8),
  `bpm` int,
  `confidence_bp` int,
  `source` varchar(24),
  `matched_title` varchar(512),
  `matched_artists` text,
  `matched_album` varchar(512),
  `matched_isrc` varchar(32),
  `matched_duration_ms` int,
  `matched_spotify_url` varchar(512),
  `reason_codes` text,
  `algorithm_version` varchar(32) NOT NULL,
  `manual` boolean NOT NULL DEFAULT false,
  `created_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `expires_at` timestamp NULL,
  CONSTRAINT `song_cache_pk` PRIMARY KEY (`id`),
  CONSTRAINT `song_cache_key_idx` UNIQUE (`cache_key`)
);
