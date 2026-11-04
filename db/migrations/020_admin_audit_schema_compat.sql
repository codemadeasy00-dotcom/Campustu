BEGIN;

DROP TRIGGER IF EXISTS admin_audit_logs_immutable ON admin_audit_logs;
DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON admin_audit_logs;

ALTER TABLE admin_audit_logs
  ADD COLUMN IF NOT EXISTS id uuid DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS admin_id uuid REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'legacy_event',
  ADD COLUMN IF NOT EXISTS target_type text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS target_id text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS details jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE admin_audit_logs
  ALTER COLUMN target_id TYPE text USING target_id::text;

UPDATE admin_audit_logs
   SET action = COALESCE(action, 'legacy_event'),
       target_type = COALESCE(target_type, 'unknown'),
       target_id = COALESCE(target_id, 'unknown'),
       details = COALESCE(details, '{}'::jsonb),
       created_at = COALESCE(created_at, now());

ALTER TABLE admin_audit_logs
  ALTER COLUMN action SET NOT NULL,
  ALTER COLUMN target_type SET NOT NULL,
  ALTER COLUMN target_id SET NOT NULL,
  ALTER COLUMN details SET DEFAULT '{}'::jsonb,
  ALTER COLUMN details SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT now(),
  ALTER COLUMN created_at SET NOT NULL;

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx
  ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx
  ON admin_audit_logs (target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin audit logs are immutable';
END;
$$;

CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_audit_log_mutation();

COMMIT;
