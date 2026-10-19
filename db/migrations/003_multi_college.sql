-- =====================================================================
-- Migration 003: many colleges, one platform.
-- Apply ONCE on top of schema v2.   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f 003_multi_college.sql
-- (or paste it into the Neon SQL editor)
--
-- Rules this adds:
--   * every user belongs to ONE college; a marketplace/lost&found is per college
--     (handovers happen in person, so cross-college trading makes no sense)
--   * a student can add their college if it is not listed (status 'pending' until you review it)
--   * a college may have an email_domain: then only that domain can sign up for it
--   * meeting places are free text (colleges have different campuses); campus_spots becomes
--     an OPTIONAL per-college list for later
-- =====================================================================
BEGIN;

CREATE TABLE colleges (
  id           integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name         text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 150),
  city         text NOT NULL CHECK (char_length(city) BETWEEN 2 AND 80),
  state        text CHECK (char_length(state) <= 80),
  email_domain text CHECK (email_domain = lower(email_domain) AND email_domain NOT LIKE '%@%'),
  center_lat   numeric(9,6) CHECK (center_lat BETWEEN -90 AND 90),   -- where the lost & found map opens
  center_lng   numeric(9,6) CHECK (center_lng BETWEEN -180 AND 180),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);
-- Same college cannot be added twice (catches exact duplicates only; admin must merge near-duplicates).
CREATE UNIQUE INDEX colleges_name_city_uq ON colleges (lower(name), lower(city));

-- ---- users: college + custom branch --------------------------------
ALTER TABLE users
  ADD COLUMN college_id   integer REFERENCES colleges(id),
  ADD COLUMN branch_other text CHECK (char_length(branch_other) BETWEEN 2 AND 60),
  ADD CONSTRAINT users_branch_one_of CHECK (branch_id IS NULL OR branch_other IS NULL);
CREATE INDEX users_college_idx ON users (college_id);

-- ---- everything scoped to a college --------------------------------
ALTER TABLE items
  ADD COLUMN college_id      integer REFERENCES colleges(id),
  ADD COLUMN preferred_place text CHECK (char_length(preferred_place) <= 120);
ALTER TABLE lost_found_posts ADD COLUMN college_id integer REFERENCES colleges(id);
ALTER TABLE campus_spots     ADD COLUMN college_id integer REFERENCES colleges(id) ON DELETE CASCADE;

-- spot names only need to be unique inside one college
ALTER TABLE campus_spots DROP CONSTRAINT campus_spots_name_key;
CREATE UNIQUE INDEX campus_spots_college_name_uq ON campus_spots (COALESCE(college_id, 0), lower(name));

-- Fill college on any rows that already exist, then make it mandatory if that is now safe.
UPDATE items            i SET college_id = u.college_id FROM users u WHERE u.id = i.seller_id  AND i.college_id IS NULL;
UPDATE lost_found_posts p SET college_id = u.college_id FROM users u WHERE u.id = p.author_id  AND p.college_id IS NULL;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM items WHERE college_id IS NULL) THEN
    ALTER TABLE items ALTER COLUMN college_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'items.college_id left nullable: some existing items belong to users without a college. Fix or delete them, then run: ALTER TABLE items ALTER COLUMN college_id SET NOT NULL;';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM lost_found_posts WHERE college_id IS NULL) THEN
    ALTER TABLE lost_found_posts ALTER COLUMN college_id SET NOT NULL;
  ELSE
    RAISE NOTICE 'lost_found_posts.college_id left nullable (see above).';
  END IF;
END $$;

CREATE INDEX items_college_browse_idx ON items (college_id, status, category_id, price);
CREATE INDEX lf_college_board_idx     ON lost_found_posts (college_id, kind, status, event_date DESC);

-- ---- triggers ------------------------------------------------------

-- A new listing / post takes its college from its owner. Nobody can list into another college.
CREATE FUNCTION items_set_college() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer; spot_college integer;
BEGIN
  SELECT college_id INTO cid FROM users WHERE id = NEW.seller_id;
  IF cid IS NULL THEN RAISE EXCEPTION 'seller has not chosen a college'; END IF;
  NEW.college_id := cid;
  IF NEW.preferred_spot_id IS NOT NULL THEN
    SELECT college_id INTO spot_college FROM campus_spots WHERE id = NEW.preferred_spot_id;
    IF spot_college IS DISTINCT FROM cid THEN RAISE EXCEPTION 'meeting spot belongs to a different college'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_items_set_college BEFORE INSERT ON items
  FOR EACH ROW EXECUTE FUNCTION items_set_college();

CREATE FUNCTION lf_set_college() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE cid integer; spot_college integer;
BEGIN
  SELECT college_id INTO cid FROM users WHERE id = NEW.author_id;
  IF cid IS NULL THEN RAISE EXCEPTION 'author has not chosen a college'; END IF;
  NEW.college_id := cid;
  IF NEW.spot_id IS NOT NULL THEN
    SELECT college_id INTO spot_college FROM campus_spots WHERE id = NEW.spot_id;
    IF spot_college IS DISTINCT FROM cid THEN RAISE EXCEPTION 'spot belongs to a different college'; END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_lf_set_college BEFORE INSERT ON lost_found_posts
  FOR EACH ROW EXECUTE FUNCTION lf_set_college();

-- Same as v2's reservation check, plus: buyer and seller must be at the same college.
CREATE OR REPLACE FUNCTION reservations_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE i items%ROWTYPE; b users%ROWTYPE; s users%ROWTYPE;
BEGIN
  SELECT * INTO i FROM items WHERE id = NEW.item_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'item not found'; END IF;
  IF i.status <> 'available' THEN
    RAISE EXCEPTION 'item is not available (status: %)', i.status;
  END IF;
  SELECT * INTO b FROM users WHERE id = NEW.buyer_id;
  IF NOT FOUND OR b.status <> 'active' OR b.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'buyer account is not active';
  END IF;
  IF b.email_verified_at IS NULL THEN
    RAISE EXCEPTION 'buyer email is not verified';
  END IF;
  SELECT * INTO s FROM users WHERE id = i.seller_id;
  IF s.status <> 'active' OR s.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'seller account is not active';
  END IF;
  IF b.college_id IS NULL OR b.college_id IS DISTINCT FROM i.college_id THEN
    RAISE EXCEPTION 'buyer and seller must be at the same college';
  END IF;
  NEW.seller_id := i.seller_id;
  RETURN NEW;
END $$;

-- Chat only between students of the same college.
CREATE FUNCTION conversations_same_college() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE ca integer; cb integer;
BEGIN
  SELECT college_id INTO ca FROM users WHERE id = NEW.user_a;
  SELECT college_id INTO cb FROM users WHERE id = NEW.user_b;
  IF ca IS NULL OR ca IS DISTINCT FROM cb THEN
    RAISE EXCEPTION 'users must be at the same college to chat';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_conversations_same_college BEFORE INSERT ON conversations
  FOR EACH ROW EXECUTE FUNCTION conversations_same_college();

COMMIT;
