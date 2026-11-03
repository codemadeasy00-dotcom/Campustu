BEGIN;

ALTER TABLE lost_found_items
  ADD COLUMN IF NOT EXISTS skip_reason text,
  ADD COLUMN IF NOT EXISTS flagged_for_review boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lost_found_user_skips
  ON lost_found_items (user_id, created_at)
  WHERE skip_reason IS NOT NULL;

COMMIT;
