BEGIN;

CREATE TABLE admin_badge_overrides (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES users(id) ON DELETE CASCADE,
  marketplace_item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  lost_found_item_id  uuid REFERENCES lost_found_items(id) ON DELETE CASCADE,
  badge_id            text NOT NULL CHECK (badge_id IN (
                        'college_verified', 'admin', 'power_trader', 'trusted_member',
                        'lost_found_hero', 'suspended', 'banned', 'under_review',
                        'urgent', 'verified_match', 'claimed_resolved'
                      )),
  enabled             boolean NOT NULL,
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  updated_by          uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (num_nonnulls(user_id, marketplace_item_id, lost_found_item_id) = 1)
);

CREATE UNIQUE INDEX admin_badge_overrides_user_uq
  ON admin_badge_overrides (user_id, badge_id)
  WHERE user_id IS NOT NULL;

CREATE UNIQUE INDEX admin_badge_overrides_marketplace_uq
  ON admin_badge_overrides (marketplace_item_id, badge_id)
  WHERE marketplace_item_id IS NOT NULL;

CREATE UNIQUE INDEX admin_badge_overrides_lost_found_uq
  ON admin_badge_overrides (lost_found_item_id, badge_id)
  WHERE lost_found_item_id IS NOT NULL;

COMMIT;
