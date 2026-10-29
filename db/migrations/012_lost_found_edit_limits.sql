BEGIN;

CREATE TABLE lost_found_item_edits (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  item_id    uuid NOT NULL REFERENCES lost_found_items(id) ON DELETE CASCADE,
  edited_by  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  edited_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX lost_found_item_edits_window_idx
  ON lost_found_item_edits (item_id, edited_by, edited_at DESC);

COMMIT;
