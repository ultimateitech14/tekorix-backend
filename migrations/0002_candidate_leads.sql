CREATE TABLE IF NOT EXISTS candidate_leads (
  id UUID PRIMARY KEY,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  role TEXT NOT NULL,
  experience TEXT NOT NULL DEFAULT '',
  linked_in_url TEXT,
  desired_location TEXT,
  desired_salary_range TEXT,
  skills TEXT,
  submission_type TEXT NOT NULL,
  source_page TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'new',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  resume_object_key TEXT,
  resume_file_name TEXT,
  resume_content_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT candidate_leads_submission_type_check CHECK (
    submission_type IN ('contact-candidate', 'resume-submission', 'market-resume')
  ),
  CONSTRAINT candidate_leads_source_page_check CHECK (source_page IN ('contact', 'find-job', 'unknown'))
);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_created_at_desc
  ON candidate_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_submission_type_created_at_desc
  ON candidate_leads (submission_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_status_created_at_desc
  ON candidate_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_is_read_created_at_desc
  ON candidate_leads (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_source_page
  ON candidate_leads (source_page);

CREATE INDEX IF NOT EXISTS idx_candidate_leads_email_lower
  ON candidate_leads (LOWER(email));
