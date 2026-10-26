BEGIN;

ALTER TABLE lost_found_items
  ADD COLUMN brand varchar(100),
  ADD COLUMN colour varchar(100),
  ADD COLUMN occurred_at timestamptz,
  ADD COLUMN radius_meters integer NOT NULL DEFAULT 0
    CHECK (radius_meters BETWEEN 0 AND 5000),
  ADD COLUMN where_is_it varchar(32)
    CHECK (where_is_it IN ('with_me', 'security_desk', 'left_at_spot')),
  ADD COLUMN location_note varchar(255);

COMMIT;
