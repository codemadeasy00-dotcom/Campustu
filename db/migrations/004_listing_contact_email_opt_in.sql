BEGIN;

ALTER TABLE items
  ADD COLUMN share_email boolean NOT NULL DEFAULT false;

COMMIT;
