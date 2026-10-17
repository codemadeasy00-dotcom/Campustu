BEGIN;

CREATE TABLE branches (
  id    smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  code  text NOT NULL UNIQUE,
  name  text NOT NULL
);

CREATE TABLE categories (
  id    smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  slug  text NOT NULL UNIQUE,
  name  text NOT NULL,
  scope text NOT NULL DEFAULT 'both'
        CHECK (scope IN ('marketplace', 'lost_found', 'both'))
);

CREATE TABLE item_types (
  id          integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  category_id smallint NOT NULL REFERENCES categories(id),
  name        text NOT NULL UNIQUE,
  description text
);

CREATE TABLE kits (
  id        integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  branch_id smallint REFERENCES branches(id),
  semester  smallint NOT NULL CHECK (semester BETWEEN 1 AND 8),
  name      text NOT NULL
);
CREATE UNIQUE INDEX kits_branch_sem_uq ON kits (COALESCE(branch_id, 0), semester);

CREATE TABLE kit_items (
  kit_id       integer NOT NULL REFERENCES kits(id) ON DELETE CASCADE,
  item_type_id integer NOT NULL REFERENCES item_types(id),
  quantity     smallint NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_optional  boolean NOT NULL DEFAULT false,
  PRIMARY KEY (kit_id, item_type_id)
);

CREATE TABLE campus_spots (
  id                  smallint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name                text NOT NULL UNIQUE,
  description         text,
  lat                 numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng                 numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  safe_for_handover   boolean NOT NULL DEFAULT true
);

-- Tunable product decisions live here, not hard-coded in triggers.
CREATE TABLE app_settings (
  key   text PRIMARY KEY,
  value integer NOT NULL,
  note  text
);
INSERT INTO app_settings (key, value, note) VALUES
  ('trusted_min_partners',    2,  'distinct people you must complete handovers with to be "trusted"'),
  ('report_freeze_threshold', 3,  'credible reporters needed to auto-freeze an account'),
  ('report_window_days',      30, 'only open reports newer than this count toward auto-freeze'),
  ('stale_accepted_hours',    72, 'hours after the meet time before an accepted reservation is closed'),
  ('trust_min_price',         0,  'INR; handovers below this agreed price do not count toward trust');

CREATE TABLE users (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email             text NOT NULL,
  email_verified_at timestamptz,
  password_hash     text,
  full_name         text NOT NULL,
  display_name      text NOT NULL,
  branch_id         smallint REFERENCES branches(id),
  admission_year    smallint CHECK (admission_year BETWEEN 2000 AND 2100),  -- semester is derived by the app from this
  role              text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'frozen', 'banned')),
  frozen_reason     text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE UNIQUE INDEX users_email_lower_uq ON users (lower(email));

CREATE TABLE email_otps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email       text NOT NULL,
  purpose     text NOT NULL CHECK (purpose IN ('signup', 'login', 'reset')),
  code_hash   text NOT NULL,
  expires_at  timestamptz NOT NULL,
  attempts    smallint NOT NULL DEFAULT 0,
  consumed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX email_otps_lookup ON email_otps (lower(email), created_at DESC);

CREATE TABLE items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id         uuid NOT NULL REFERENCES users(id),
  category_id       smallint NOT NULL REFERENCES categories(id),
  item_type_id      integer REFERENCES item_types(id),
  title             text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description       text,
  condition         text NOT NULL CHECK (condition IN ('like_new', 'good', 'fair', 'worn')),
  price             numeric(10,2) NOT NULL CHECK (price >= 0),
  status            text NOT NULL DEFAULT 'available'
                    CHECK (status IN ('available', 'reserved', 'sold', 'withdrawn', 'removed')),
  branch_id         smallint REFERENCES branches(id),
  semester          smallint CHECK (semester BETWEEN 1 AND 8),
  preferred_spot_id smallint REFERENCES campus_spots(id),
  removed_reason    text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  sold_at           timestamptz
);
CREATE INDEX items_browse_idx      ON items (status, category_id, price);
CREATE INDEX items_type_avail_idx  ON items (item_type_id, price) WHERE status = 'available';
CREATE INDEX items_seller_idx      ON items (seller_id);

CREATE TABLE item_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id     uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  position    smallint NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (item_id, position)
);

CREATE TABLE wishlists (
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id    uuid NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_id)
);

CREATE TABLE wanted_item_types (
  user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_type_id integer NOT NULL REFERENCES item_types(id),
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, item_type_id)
);

CREATE TABLE reservations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id         uuid NOT NULL REFERENCES items(id),
  buyer_id        uuid NOT NULL REFERENCES users(id),
  seller_id       uuid NOT NULL REFERENCES users(id),
  status          text NOT NULL DEFAULT 'requested'
                  CHECK (status IN ('requested', 'accepted', 'declined', 'cancelled', 'expired', 'completed', 'disputed')),
  agreed_price    numeric(10,2) CHECK (agreed_price >= 0),
  meeting_spot_id smallint REFERENCES campus_spots(id),
  meet_at         timestamptz,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  CHECK (buyer_id <> seller_id),
  CHECK (status <> 'accepted' OR agreed_price IS NOT NULL)
);
CREATE UNIQUE INDEX reservations_one_live_per_item
  ON reservations (item_id) WHERE status IN ('requested', 'accepted', 'disputed');
CREATE INDEX reservations_buyer_idx  ON reservations (buyer_id, status);
CREATE INDEX reservations_seller_idx ON reservations (seller_id, status);

CREATE TABLE handover_confirmations (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  confirmer_id   uuid NOT NULL REFERENCES users(id),
  counterpart_id uuid NOT NULL REFERENCES users(id),
  outcome        text NOT NULL DEFAULT 'met' CHECK (outcome IN ('met', 'no_show', 'problem')),
  note           text,
  confirmed_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (reservation_id, confirmer_id),
  CHECK (confirmer_id <> counterpart_id)
);

CREATE TABLE lost_found_posts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id      uuid NOT NULL REFERENCES users(id),
  kind           text NOT NULL CHECK (kind IN ('lost', 'found')),
  category_id    smallint NOT NULL REFERENCES categories(id),
  title          text NOT NULL CHECK (char_length(title) BETWEEN 3 AND 120),
  description    text,
  private_detail text,
  event_date     date NOT NULL,
  spot_id        smallint REFERENCES campus_spots(id),
  lat            numeric(9,6) NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng            numeric(9,6) NOT NULL CHECK (lng BETWEEN -180 AND 180),
  location_note  text,
  holding_note   text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'returned', 'closed', 'removed')),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, kind)
);
CREATE INDEX lf_board_idx ON lost_found_posts (kind, status, category_id, event_date DESC);

CREATE TABLE lf_photos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id     uuid NOT NULL REFERENCES lost_found_posts(id) ON DELETE CASCADE,
  storage_key text NOT NULL,
  position    smallint NOT NULL DEFAULT 0,
  UNIQUE (post_id, position)
);

CREATE TABLE matches (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lost_post_id  uuid NOT NULL,
  lost_kind     text NOT NULL DEFAULT 'lost'  CHECK (lost_kind = 'lost'),
  found_post_id uuid NOT NULL,
  found_kind    text NOT NULL DEFAULT 'found' CHECK (found_kind = 'found'),
  score         numeric(4,3) NOT NULL CHECK (score BETWEEN 0 AND 1),
  reasons       jsonb NOT NULL DEFAULT '{}',
  status        text NOT NULL DEFAULT 'suggested' CHECK (status IN ('suggested', 'dismissed', 'confirmed')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lost_post_id, found_post_id),
  FOREIGN KEY (lost_post_id,  lost_kind)  REFERENCES lost_found_posts (id, kind) ON DELETE CASCADE,
  FOREIGN KEY (found_post_id, found_kind) REFERENCES lost_found_posts (id, kind) ON DELETE CASCADE
);

CREATE TABLE conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a          uuid NOT NULL REFERENCES users(id),
  user_b          uuid NOT NULL REFERENCES users(id),
  item_id         uuid REFERENCES items(id),
  post_id         uuid REFERENCES lost_found_posts(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  last_message_at timestamptz,
  CHECK (user_a < user_b),
  CHECK (num_nonnulls(item_id, post_id) = 1)
);
CREATE UNIQUE INDEX conv_item_uq ON conversations (item_id, user_a, user_b) WHERE item_id IS NOT NULL;
CREATE UNIQUE INDEX conv_post_uq ON conversations (post_id, user_a, user_b) WHERE post_id IS NOT NULL;

CREATE TABLE messages (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id       uuid NOT NULL REFERENCES users(id),
  body            text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at      timestamptz NOT NULL DEFAULT now(),
  read_at         timestamptz
);
CREATE INDEX messages_thread_idx ON messages (conversation_id, id);

CREATE TABLE notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notifications_user_idx ON notifications (user_id, read_at, created_at DESC);

CREATE TABLE reports (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id    uuid NOT NULL REFERENCES users(id),
  target_user_id uuid REFERENCES users(id),
  target_item_id uuid REFERENCES items(id),
  target_post_id uuid REFERENCES lost_found_posts(id),
  reason         text NOT NULL CHECK (reason IN
                   ('fake_listing', 'scam_or_no_show', 'abusive_message', 'inappropriate_content', 'other')),
  details        text,
  status         text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'action_taken', 'dismissed')),
  reviewed_by    uuid REFERENCES users(id),
  reviewed_at    timestamptz,
  admin_note     text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(target_user_id, target_item_id, target_post_id) = 1)
);
CREATE UNIQUE INDEX reports_once_user ON reports (reporter_id, target_user_id) WHERE target_user_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX reports_once_item ON reports (reporter_id, target_item_id) WHERE target_item_id IS NOT NULL AND status = 'open';
CREATE UNIQUE INDEX reports_once_post ON reports (reporter_id, target_post_id) WHERE target_post_id IS NOT NULL AND status = 'open';
CREATE INDEX reports_queue_idx ON reports (status, created_at);

CREATE TABLE admin_actions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES users(id),
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   uuid NOT NULL,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Trust is derived: number of DIFFERENT people you completed a handover with.
CREATE VIEW user_trust AS
SELECT u.id AS user_id,
       COALESCE(t.completed_handovers, 0) AS completed_handovers,
       COALESCE(t.distinct_partners, 0)   AS trust_score,
       COALESCE(t.distinct_partners, 0) >=
         (SELECT value FROM app_settings WHERE key = 'trusted_min_partners') AS is_trusted
FROM users u
LEFT JOIN (
  SELECT user_id, count(*) AS completed_handovers, count(DISTINCT partner_id) AS distinct_partners
  FROM (
    SELECT buyer_id AS user_id, seller_id AS partner_id FROM reservations
     WHERE status = 'completed'
       AND agreed_price >= (SELECT value FROM app_settings WHERE key = 'trust_min_price')
    UNION ALL
    SELECT seller_id, buyer_id FROM reservations
     WHERE status = 'completed'
       AND agreed_price >= (SELECT value FROM app_settings WHERE key = 'trust_min_price')
  ) p
  GROUP BY user_id
) t ON t.user_id = u.id;

-- For admins: the pairs behind trust. Look for pairs with many deals, tiny
-- prices, or very fast reserve-to-complete times (ring farming signs).
CREATE VIEW admin_handover_pairs AS
SELECT LEAST(buyer_id, seller_id)    AS user_1,
       GREATEST(buyer_id, seller_id) AS user_2,
       count(*)                      AS completed_deals,
       min(completed_at)             AS first_deal,
       max(completed_at)             AS last_deal,
       min(agreed_price)             AS min_price,
       max(agreed_price)             AS max_price,
       min(completed_at - created_at) AS fastest_reserve_to_complete
FROM reservations WHERE status = 'completed'
GROUP BY 1, 2;

-- 1) New reservation: item available; buyer and seller active and email-verified.
CREATE FUNCTION reservations_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
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
  NEW.seller_id := i.seller_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_reservations_before_insert
  BEFORE INSERT ON reservations
  FOR EACH ROW EXECUTE FUNCTION reservations_before_insert();

-- 2) Reservation status drives item status. 'disputed' keeps the item locked.
CREATE FUNCTION reservations_sync_item() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status IN ('requested', 'accepted', 'disputed') THEN
    UPDATE items SET status = 'reserved', updated_at = now()
     WHERE id = NEW.item_id AND status IN ('available', 'reserved');
  ELSIF NEW.status = 'completed' THEN
    UPDATE items SET status = 'sold', sold_at = now(), updated_at = now()
     WHERE id = NEW.item_id;
  ELSE  -- declined, cancelled, expired
    UPDATE items SET status = 'available', updated_at = now()
     WHERE id = NEW.item_id AND status = 'reserved';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reservations_sync_item
  AFTER INSERT OR UPDATE OF status ON reservations
  FOR EACH ROW EXECUTE FUNCTION reservations_sync_item();

-- 3) Taps allowed only from buyer/seller, while accepted or disputed.
CREATE FUNCTION hc_before_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r reservations%ROWTYPE;
BEGIN
  SELECT * INTO r FROM reservations WHERE id = NEW.reservation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'reservation not found'; END IF;
  IF r.status NOT IN ('accepted', 'disputed') THEN
    RAISE EXCEPTION 'reservation must be accepted to confirm (status: %)', r.status;
  END IF;
  IF NEW.confirmer_id = r.buyer_id THEN
    NEW.counterpart_id := r.seller_id;
  ELSIF NEW.confirmer_id = r.seller_id THEN
    NEW.counterpart_id := r.buyer_id;
  ELSE
    RAISE EXCEPTION 'user is not part of this reservation';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_hc_before_insert
  BEFORE INSERT ON handover_confirmations
  FOR EACH ROW EXECUTE FUNCTION hc_before_insert();

-- 4) Any 'no_show' or 'problem' tap disputes the reservation (admin queue).
--    Two 'met' taps complete it. A later tap never completes a disputed one.
CREATE FUNCTION hc_after_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE r_status text; met integer;
BEGIN
  SELECT status INTO r_status FROM reservations WHERE id = NEW.reservation_id;
  IF r_status = 'accepted' THEN
    IF NEW.outcome <> 'met' THEN
      UPDATE reservations SET status = 'disputed', updated_at = now()
       WHERE id = NEW.reservation_id;
    ELSE
      SELECT count(*) INTO met FROM handover_confirmations
       WHERE reservation_id = NEW.reservation_id AND outcome = 'met';
      IF met = 2 THEN
        UPDATE reservations
           SET status = 'completed', completed_at = now(), updated_at = now()
         WHERE id = NEW.reservation_id;
      END IF;
    END IF;
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_hc_after_insert
  AFTER INSERT ON handover_confirmations
  FOR EACH ROW EXECUTE FUNCTION hc_after_insert();

-- 5) Housekeeping. Call regularly (cron, pg_cron, or a scheduled API job):
--      SELECT * FROM expire_stale_reservations();
--    Unanswered requests expire. Accepted ones past the meet time expire if
--    nobody tapped, and go to dispute if someone tapped but the other did not.
CREATE FUNCTION expire_stale_reservations() RETURNS TABLE (expired integer, disputed integer)
LANGUAGE plpgsql AS $$
DECLARE hrs integer; n1 integer; n2 integer; n3 integer;
BEGIN
  SELECT value INTO hrs FROM app_settings WHERE key = 'stale_accepted_hours';
  UPDATE reservations SET status = 'expired', updated_at = now()
   WHERE status = 'requested' AND expires_at < now();
  GET DIAGNOSTICS n1 = ROW_COUNT;
  UPDATE reservations r SET status = 'expired', updated_at = now()
   WHERE r.status = 'accepted'
     AND COALESCE(r.meet_at, r.updated_at) + make_interval(hours => hrs) < now()
     AND NOT EXISTS (SELECT 1 FROM handover_confirmations h WHERE h.reservation_id = r.id);
  GET DIAGNOSTICS n2 = ROW_COUNT;
  UPDATE reservations r SET status = 'disputed', updated_at = now()
   WHERE r.status = 'accepted'
     AND COALESCE(r.meet_at, r.updated_at) + make_interval(hours => hrs) < now()
     AND EXISTS (SELECT 1 FROM handover_confirmations h WHERE h.reservation_id = r.id);
  GET DIAGNOSTICS n3 = ROW_COUNT;
  RETURN QUERY SELECT n1 + n2, n3;
END $$;

-- 6) Auto-freeze. Every report goes to the admin queue. Only CREDIBLE reports
--    (reporter has at least one completed handover), from different people,
--    within the window, and never the owner's own, count toward a freeze.
CREATE FUNCTION reports_auto_freeze() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target uuid; n integer; thr integer; win integer;
BEGIN
  SELECT value INTO thr FROM app_settings WHERE key = 'report_freeze_threshold';
  SELECT value INTO win FROM app_settings WHERE key = 'report_window_days';
  IF NEW.target_user_id IS NOT NULL THEN
    target := NEW.target_user_id;
  ELSIF NEW.target_item_id IS NOT NULL THEN
    SELECT seller_id INTO target FROM items WHERE id = NEW.target_item_id;
  ELSE
    SELECT author_id INTO target FROM lost_found_posts WHERE id = NEW.target_post_id;
  END IF;
  IF target IS NULL OR target = NEW.reporter_id THEN RETURN NULL; END IF;

  SELECT count(DISTINCT r.reporter_id) INTO n
    FROM reports r
    LEFT JOIN items i            ON i.id = r.target_item_id
    LEFT JOIN lost_found_posts p ON p.id = r.target_post_id
   WHERE r.status = 'open'
     AND r.created_at > now() - make_interval(days => win)
     AND r.reporter_id <> target
     AND COALESCE(r.target_user_id, i.seller_id, p.author_id) = target
     AND EXISTS (SELECT 1 FROM reservations x
                  WHERE x.status = 'completed'
                    AND r.reporter_id IN (x.buyer_id, x.seller_id));

  IF n >= thr THEN
    UPDATE users
       SET status = 'frozen',
           frozen_reason = 'auto: ' || n || ' credible open reports in ' || win || ' days'
     WHERE id = target AND status = 'active' AND role = 'student';
  END IF;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_reports_auto_freeze
  AFTER INSERT ON reports
  FOR EACH ROW EXECUTE FUNCTION reports_auto_freeze();

COMMIT;
