BEGIN;

DROP INDEX IF EXISTS idx_lost_found_embedding;
ALTER TABLE lost_found_items DROP COLUMN IF EXISTS embedding;

COMMIT;
