BEGIN;

CREATE INDEX items_available_search_idx
  ON items
  USING GIN (to_tsvector('simple', COALESCE(title, '') || ' ' || COALESCE(description, '')))
  WHERE status = 'available';

CREATE INDEX items_available_newest_idx
  ON items (college_id, created_at DESC, id DESC)
  WHERE status = 'available';

CREATE INDEX items_available_price_sort_idx
  ON items (college_id, price, created_at DESC, id DESC)
  WHERE status = 'available';

CREATE INDEX items_available_condition_idx
  ON items (college_id, condition, created_at DESC)
  WHERE status = 'available';

COMMIT;
