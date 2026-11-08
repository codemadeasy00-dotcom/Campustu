BEGIN;

CREATE TABLE item_wants (
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category_id smallint NOT NULL REFERENCES categories(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (item_id, category_id)
);

CREATE INDEX item_wants_category_idx ON item_wants (category_id, item_id);

CREATE TABLE saved_searches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  college_id integer NOT NULL REFERENCES colleges(id) ON DELETE CASCADE,
  keyword    text NOT NULL CHECK (char_length(keyword) BETWEEN 2 AND 80),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX saved_searches_user_keyword_uq
  ON saved_searches (user_id, college_id, lower(keyword));
CREATE INDEX saved_searches_college_idx ON saved_searches (college_id, created_at DESC);

CREATE TABLE in_app_notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  search_id  uuid REFERENCES saved_searches(id) ON DELETE CASCADE,
  item_id    uuid REFERENCES items(id) ON DELETE CASCADE,
  title      text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 255),
  message    text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 1000),
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((search_id IS NULL) = (item_id IS NULL))
);

CREATE UNIQUE INDEX in_app_notifications_search_item_uq
  ON in_app_notifications (search_id, item_id)
  WHERE search_id IS NOT NULL AND item_id IS NOT NULL;
CREATE INDEX in_app_notifications_user_unread_idx
  ON in_app_notifications (user_id, created_at DESC)
  WHERE NOT is_read;

COMMIT;
