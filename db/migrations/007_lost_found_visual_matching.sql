BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE lost_found_items
  ADD COLUMN embedding vector(512);

CREATE INDEX idx_lost_found_embedding
  ON lost_found_items USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

COMMIT;
