BEGIN;

DROP INDEX IF EXISTS idx_lost_found_embedding;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'lost_found_items'
       AND column_name = 'embedding'
  ) AND NOT EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'lost_found_items'
       AND column_name = 'embedding_legacy'
  ) THEN
    ALTER TABLE lost_found_items RENAME COLUMN embedding TO embedding_legacy;
  END IF;
END
$$;

COMMIT;
