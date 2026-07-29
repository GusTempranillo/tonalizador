-- Tonal confidence is independent from catalogue-match confidence.
ALTER TABLE `song_cache`
  ADD COLUMN IF NOT EXISTS `tonal_confidence_bp` int NULL AFTER `confidence_bp`;
