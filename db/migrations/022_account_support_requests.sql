BEGIN;

CREATE TABLE IF NOT EXISTS support_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email         text NOT NULL,
  full_name     text NOT NULL,
  category      text NOT NULL CHECK (category IN ('account_access', 'suspension', 'ban_appeal', 'other')),
  subject       text NOT NULL CHECK (char_length(subject) BETWEEN 5 AND 160),
  message       text NOT NULL CHECK (char_length(message) BETWEEN 20 AND 5000),
  status        text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  admin_note    text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  resolved_at   timestamptz,
  resolved_by   uuid REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS support_requests_queue_idx
  ON support_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS support_requests_email_idx
  ON support_requests (lower(email), created_at DESC);

COMMIT;
