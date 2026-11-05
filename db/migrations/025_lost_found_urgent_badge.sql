BEGIN;

ALTER TABLE lost_found_items
  ADD COLUMN IF NOT EXISTS urgent boolean NOT NULL DEFAULT false;

ALTER TABLE lost_found_items
  ADD CONSTRAINT lost_found_items_urgent_status_check
  CHECK (NOT urgent OR status IN ('lost', 'claimed', 'returned'));

COMMIT;
