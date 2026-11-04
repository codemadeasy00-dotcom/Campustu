BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin_password_hash text,
  ADD COLUMN IF NOT EXISTS admin_password_version integer NOT NULL DEFAULT 0;

COMMIT;
