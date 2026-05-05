CREATE TABLE IF NOT EXISTS admin_credentials (
  admin_id TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  password_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
