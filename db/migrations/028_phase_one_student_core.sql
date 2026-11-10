BEGIN;

CREATE TABLE IF NOT EXISTS need_board_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id    integer NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  branch_id     smallint REFERENCES branches(id) ON DELETE SET NULL,
  category_id   smallint REFERENCES categories(id) ON DELETE SET NULL,
  title         text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description   text NOT NULL DEFAULT '' CHECK (char_length(description) <= 1000),
  expires_at    timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'fulfilled', 'closed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS need_board_requests_campus_open_idx
  ON need_board_requests (college_id, expires_at DESC)
  WHERE status = 'open';
CREATE INDEX IF NOT EXISTS need_board_requests_owner_idx
  ON need_board_requests (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS need_board_responses (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    uuid NOT NULL REFERENCES need_board_requests(id) ON DELETE CASCADE,
  responder_id  uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  offer_type    text NOT NULL CHECK (offer_type IN ('listing', 'loan_offer')),
  item_id       uuid REFERENCES items(id) ON DELETE SET NULL,
  message       text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 500),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, responder_id),
  CHECK (offer_type <> 'listing' OR item_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS need_board_responses_request_idx
  ON need_board_responses (request_id, created_at);

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS category_id smallint REFERENCES categories(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id smallint REFERENCES branches(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS saved_searches_user_keyword_uq;
CREATE UNIQUE INDEX IF NOT EXISTS saved_searches_user_criteria_uq
  ON saved_searches (
    user_id,
    college_id,
    lower(keyword),
    COALESCE(category_id, 0),
    COALESCE(branch_id, 0)
  );
CREATE INDEX IF NOT EXISTS saved_searches_criteria_idx
  ON saved_searches (college_id, category_id, branch_id);

CREATE TABLE IF NOT EXISTS search_alert_preferences (
  user_id       uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  quiet_start   time,
  quiet_end     time,
  timezone      text NOT NULL DEFAULT 'UTC',
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((quiet_start IS NULL) = (quiet_end IS NULL))
);

ALTER TABLE in_app_notifications
  ADD COLUMN IF NOT EXISTS match_reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS need_request_id uuid REFERENCES need_board_requests(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS need_response_id uuid REFERENCES need_board_responses(id) ON DELETE CASCADE;

DO $$
DECLARE
  constraint_row record;
BEGIN
  FOR constraint_row IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'in_app_notifications'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%search_id%'
       AND pg_get_constraintdef(oid) ILIKE '%item_id%'
  LOOP
    EXECUTE format('ALTER TABLE in_app_notifications DROP CONSTRAINT %I', constraint_row.conname);
  END LOOP;
END $$;

ALTER TABLE in_app_notifications
  DROP CONSTRAINT IF EXISTS in_app_notifications_target_check,
  ADD CONSTRAINT in_app_notifications_target_check CHECK (
    (
      search_id IS NOT NULL
      AND need_response_id IS NULL
      AND ((item_id IS NOT NULL AND need_request_id IS NULL)
        OR (item_id IS NULL AND need_request_id IS NOT NULL))
    )
    OR
    (
      search_id IS NULL
      AND item_id IS NULL
      AND need_request_id IS NOT NULL
      AND need_response_id IS NOT NULL
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS in_app_notifications_search_request_uq
  ON in_app_notifications (search_id, need_request_id)
  WHERE search_id IS NOT NULL AND need_request_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS in_app_notifications_need_response_uq
  ON in_app_notifications (need_response_id)
  WHERE need_response_id IS NOT NULL;

COMMIT;
