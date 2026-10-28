BEGIN;

ALTER TABLE conversations
  ADD COLUMN lost_found_item_id uuid REFERENCES lost_found_items(id) ON DELETE CASCADE;

DO $$
DECLARE constraint_name text;
BEGIN
  FOR constraint_name IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'conversations'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%num_nonnulls(item_id, post_id)%'
  LOOP
    EXECUTE format('ALTER TABLE conversations DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE conversations
  ADD CONSTRAINT conversations_one_context_check
  CHECK (num_nonnulls(item_id, post_id, lost_found_item_id) = 1);

CREATE UNIQUE INDEX conversations_lost_found_item_uq
  ON conversations (lost_found_item_id, user_a, user_b)
  WHERE lost_found_item_id IS NOT NULL;

ALTER TABLE item_claims
  DROP CONSTRAINT item_claims_status_check,
  ADD CONSTRAINT item_claims_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed'));

COMMIT;
