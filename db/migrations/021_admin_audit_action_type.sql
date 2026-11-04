BEGIN;

ALTER TABLE admin_audit_logs
  ADD COLUMN IF NOT EXISTS action_type text NOT NULL DEFAULT 'legacy_event';

ALTER TABLE admin_audit_logs
  ALTER COLUMN action_type SET DEFAULT 'legacy_event';

COMMIT;
