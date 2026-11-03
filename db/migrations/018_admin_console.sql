BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS auth_version integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS roll_number text;

CREATE UNIQUE INDEX IF NOT EXISTS users_college_roll_number_uq
  ON users (college_id, lower(roll_number))
  WHERE roll_number IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE colleges
  ADD COLUMN IF NOT EXISTS short_code text,
  ADD COLUMN IF NOT EXISTS search_radius_meters integer NOT NULL DEFAULT 1000
    CHECK (search_radius_meters BETWEEN 100 AND 50000);

CREATE UNIQUE INDEX IF NOT EXISTS colleges_short_code_uq
  ON colleges (lower(short_code))
  WHERE short_code IS NOT NULL;

CREATE TABLE IF NOT EXISTS system_controls (
  key        text PRIMARY KEY,
  enabled    boolean NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  note       text NOT NULL
);

INSERT INTO system_controls (key, enabled, note) VALUES
  ('image_uploads_enabled', true, 'Allow image uploads throughout the app'),
  ('marketplace_read_only', false, 'Temporarily prevent marketplace changes')
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS admin_audit_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  action      text NOT NULL,
  target_type text NOT NULL,
  target_id   text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_address  text,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_logs_created_idx ON admin_audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS admin_audit_logs_target_idx ON admin_audit_logs (target_type, target_id, created_at DESC);

CREATE OR REPLACE FUNCTION prevent_admin_audit_log_mutation()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'admin audit logs are immutable';
END;
$$;

DROP TRIGGER IF EXISTS admin_audit_logs_immutable ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_immutable
  BEFORE UPDATE OR DELETE ON admin_audit_logs
  FOR EACH ROW EXECUTE FUNCTION prevent_admin_audit_log_mutation();

DROP TRIGGER IF EXISTS admin_audit_logs_no_truncate ON admin_audit_logs;
CREATE TRIGGER admin_audit_logs_no_truncate
  BEFORE TRUNCATE ON admin_audit_logs
  FOR EACH STATEMENT EXECUTE FUNCTION prevent_admin_audit_log_mutation();

COMMIT;
