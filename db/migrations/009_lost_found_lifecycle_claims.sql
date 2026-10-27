BEGIN;

ALTER TABLE lost_found_items
  ADD COLUMN lifecycle_status varchar(20) NOT NULL DEFAULT 'active';

UPDATE lost_found_items
   SET lifecycle_status = CASE status::text
     WHEN 'claimed' THEN 'claim_pending'
     WHEN 'returned' THEN 'resolved'
     ELSE 'active'
   END;

ALTER TABLE lost_found_items
  ADD CONSTRAINT lost_found_lifecycle_status_check
  CHECK (lifecycle_status IN ('active', 'closed', 'claim_pending', 'resolved'));

ALTER TABLE item_claims
  RENAME COLUMN answer_attempt TO claim_text;

ALTER TABLE item_claims
  RENAME COLUMN handover_pass_code TO handover_code;

UPDATE item_claims
   SET status = 'pending'
 WHERE status IS NULL;

ALTER TABLE item_claims
  ALTER COLUMN claim_text TYPE text,
  ALTER COLUMN status SET DEFAULT 'pending',
  ALTER COLUMN status SET NOT NULL,
  ADD COLUMN reviewed_at timestamptz;

UPDATE item_claims
   SET status = lower(status);

UPDATE item_claims
   SET status = 'pending',
       handover_code = NULL,
       reviewed_at = NULL
 WHERE status = 'approved';

WITH duplicate_pending_claims AS (
  SELECT id,
         row_number() OVER (PARTITION BY item_id, claimant_id ORDER BY created_at, id) AS position
    FROM item_claims
   WHERE status = 'pending'
)
UPDATE item_claims AS claims
   SET status = 'rejected',
       reviewed_at = now()
  FROM duplicate_pending_claims AS duplicates
 WHERE claims.id = duplicates.id
   AND duplicates.position > 1;

ALTER TABLE item_claims
  ADD CONSTRAINT item_claims_status_check
  CHECK (status IN ('pending', 'approved', 'rejected'));

WITH duplicate_handover_codes AS (
  SELECT id,
         row_number() OVER (PARTITION BY handover_code ORDER BY created_at, id) AS position
    FROM item_claims
   WHERE handover_code IS NOT NULL
)
UPDATE item_claims AS claims
   SET handover_code = NULL
  FROM duplicate_handover_codes AS duplicates
 WHERE claims.id = duplicates.id
   AND duplicates.position > 1;

CREATE UNIQUE INDEX item_claims_handover_code_unique
  ON item_claims(handover_code)
  WHERE handover_code IS NOT NULL;

CREATE UNIQUE INDEX item_claims_one_pending_per_claimant
  ON item_claims(item_id, claimant_id)
  WHERE status = 'pending';

CREATE INDEX item_claims_owner_queue
  ON item_claims(item_id, status, created_at);

CREATE TABLE lost_found_media_cleanup (
  storage_key varchar(500) PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text
);

COMMIT;
