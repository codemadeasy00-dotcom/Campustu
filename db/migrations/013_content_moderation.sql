BEGIN;

ALTER TABLE users
  ADD COLUMN conduct_accepted_at timestamptz;

ALTER TABLE lost_found_items
  ADD COLUMN moderation_reason text;

ALTER TABLE lost_found_items
  DROP CONSTRAINT lost_found_lifecycle_status_check,
  ADD CONSTRAINT lost_found_lifecycle_status_check
    CHECK (lifecycle_status IN ('active', 'closed', 'claim_pending', 'resolved', 'removed'));

CREATE TABLE item_reports (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marketplace_item_id uuid REFERENCES items(id) ON DELETE CASCADE,
  lost_found_item_id  uuid REFERENCES lost_found_items(id) ON DELETE CASCADE,
  reporter_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason              text NOT NULL CHECK (char_length(reason) BETWEEN 5 AND 1000),
  status              text NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'dismissed', 'actioned')),
  created_at          timestamptz NOT NULL DEFAULT now(),
  reviewed_at         timestamptz,
  reviewed_by         uuid REFERENCES users(id),
  CHECK ((marketplace_item_id IS NOT NULL) <> (lost_found_item_id IS NOT NULL))
);

CREATE UNIQUE INDEX item_reports_marketplace_open_uq
  ON item_reports (reporter_id, marketplace_item_id)
  WHERE marketplace_item_id IS NOT NULL AND status = 'pending';

CREATE UNIQUE INDEX item_reports_lost_found_open_uq
  ON item_reports (reporter_id, lost_found_item_id)
  WHERE lost_found_item_id IS NOT NULL AND status = 'pending';

CREATE INDEX item_reports_pending_idx
  ON item_reports (created_at DESC)
  WHERE status = 'pending';

COMMIT;
