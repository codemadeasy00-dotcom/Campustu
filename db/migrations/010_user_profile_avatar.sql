BEGIN;

ALTER TABLE users
  ADD COLUMN avatar_key varchar(500);

COMMIT;
