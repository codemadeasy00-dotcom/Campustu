BEGIN;

CREATE TABLE lost_found_match_notifications (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id           uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id         uuid NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  item_id            uuid NOT NULL REFERENCES lost_found_items(id) ON DELETE CASCADE,
  matched_item_id    uuid NOT NULL REFERENCES lost_found_items(id) ON DELETE CASCADE,
  item_title         text NOT NULL,
  matched_item_title text NOT NULL,
  similarity_score   real NOT NULL CHECK (similarity_score >= 0 AND similarity_score <= 1),
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id)
);

CREATE INDEX lost_found_match_notifications_owner_idx
  ON lost_found_match_notifications (owner_id, created_at DESC);

COMMIT;
