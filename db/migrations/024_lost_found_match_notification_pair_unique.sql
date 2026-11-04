BEGIN;

ALTER TABLE lost_found_match_notifications
  DROP CONSTRAINT IF EXISTS lost_found_match_notifications_item_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS lost_found_match_notifications_item_match_idx
  ON lost_found_match_notifications (item_id, matched_item_id);

COMMIT;
