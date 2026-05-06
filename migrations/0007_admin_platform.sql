CREATE TABLE IF NOT EXISTS site_settings (
  settings_key TEXT PRIMARY KEY,
  company_name TEXT NOT NULL DEFAULT '',
  company_email TEXT NOT NULL DEFAULT '',
  company_phone TEXT NOT NULL DEFAULT '',
  company_address TEXT NOT NULL DEFAULT '',
  company_google_map_link TEXT NOT NULL DEFAULT '',
  careers_domain TEXT NOT NULL DEFAULT '',
  careers_headline TEXT NOT NULL DEFAULT '',
  careers_subtitle TEXT NOT NULL DEFAULT '',
  careers_published BOOLEAN NOT NULL DEFAULT TRUE,
  careers_show_team_photos BOOLEAN NOT NULL DEFAULT TRUE,
  careers_auto_publish_jobs BOOLEAN NOT NULL DEFAULT FALSE,
  careers_team_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  talent_profiles_eyebrow TEXT NOT NULL DEFAULT '',
  talent_profiles_headline TEXT NOT NULL DEFAULT '',
  talent_profiles_description TEXT NOT NULL DEFAULT '',
  talent_profiles JSONB NOT NULL DEFAULT '[]'::jsonb,
  notification_email_provider TEXT NOT NULL DEFAULT '',
  notification_email_api_key TEXT NOT NULL DEFAULT '',
  notification_from_email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_logs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  actor TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT admin_logs_category_check CHECK (category IN ('activity', 'audit', 'notification')),
  CONSTRAINT admin_logs_module_check CHECK (module IN ('Applications', 'Candidates', 'Jobs', 'Email & Notifications', 'Settings', 'System'))
);

CREATE INDEX IF NOT EXISTS idx_admin_logs_created_at_desc
  ON admin_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_logs_category_created_at_desc
  ON admin_logs (category, created_at DESC);

CREATE TABLE IF NOT EXISTS contact_submissions (
  id TEXT PRIMARY KEY,
  inquiry_type TEXT NOT NULL DEFAULT '',
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  industry TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  position TEXT NOT NULL DEFAULT '',
  phone_prefix TEXT NOT NULL DEFAULT '',
  phone_number TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  replies JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_created_at_desc
  ON contact_submissions (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_is_read_created_at_desc
  ON contact_submissions (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_contact_submissions_email_lower
  ON contact_submissions (LOWER(email));

CREATE TABLE IF NOT EXISTS email_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_templates_updated_at_desc
  ON email_templates (updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_email_templates_is_active
  ON email_templates (is_active);

CREATE TABLE IF NOT EXISTS job_applications (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_location TEXT NOT NULL,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  location TEXT NOT NULL,
  experience TEXT NOT NULL,
  cover_letter TEXT NOT NULL,
  admin_notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending review',
  reviewed_at TIMESTAMPTZ,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  resume_original_name TEXT NOT NULL,
  resume_stored_name TEXT NOT NULL,
  resume_content_type TEXT NOT NULL DEFAULT 'application/octet-stream',
  resume_size INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT job_applications_status_check CHECK (status IN ('pending review', 'shortlisted', 'rejected', 'interview'))
);

CREATE INDEX IF NOT EXISTS idx_job_applications_created_at_desc
  ON job_applications (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_status_created_at_desc
  ON job_applications (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_is_read_created_at_desc
  ON job_applications (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_job_applications_email_lower
  ON job_applications (LOWER(email));

CREATE TABLE IF NOT EXISTS resume_bank (
  application_id TEXT PRIMARY KEY REFERENCES job_applications(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  job_title TEXT NOT NULL,
  job_location TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resume_bank_updated_at_desc
  ON resume_bank (updated_at DESC);

CREATE TABLE IF NOT EXISTS admin_password_reset_tokens (
  token_hash TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_admin_password_reset_tokens_admin_id
  ON admin_password_reset_tokens (admin_id, expires_at DESC);
