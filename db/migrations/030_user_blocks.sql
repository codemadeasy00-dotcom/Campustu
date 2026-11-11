BEGIN;

CREATE TABLE IF NOT EXISTS user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS user_blocks_blocked_id_idx
  ON user_blocks (blocked_id, blocker_id);

ALTER TABLE item_claims
  ADD COLUMN IF NOT EXISTS pre_claim_status text
    CHECK (pre_claim_status IS NULL OR pre_claim_status IN ('lost', 'found'));

COMMIT;
