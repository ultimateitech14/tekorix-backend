CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  owner_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT projects_status_check CHECK (status IN ('planned', 'active', 'completed'))
);

CREATE INDEX IF NOT EXISTS idx_projects_created_at_desc
  ON projects (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_projects_status_created_at_desc
  ON projects (status, created_at DESC);
