BEGIN;

ALTER TABLE search_alert_preferences
  ADD COLUMN IF NOT EXISTS auto_track_searches boolean NOT NULL DEFAULT true;

ALTER TABLE saved_searches
  ADD COLUMN IF NOT EXISTS auto_tracked boolean NOT NULL DEFAULT false;

COMMIT;
