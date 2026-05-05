CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  location TEXT NOT NULL,
  description TEXT NOT NULL,
  experience TEXT NOT NULL,
  job_type TEXT NOT NULL,
  salary_range TEXT NOT NULL DEFAULT '',
  skills JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'draft',
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT jobs_job_type_check CHECK (job_type IN ('full-time', 'part-time', 'contract')),
  CONSTRAINT jobs_status_check CHECK (status IN ('draft', 'published', 'closed'))
);

CREATE INDEX IF NOT EXISTS idx_jobs_updated_at_desc
  ON jobs (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_status_updated_at_desc
  ON jobs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_is_active_status
  ON jobs (is_active, status);

CREATE INDEX IF NOT EXISTS idx_jobs_country_city
  ON jobs (country, city);
