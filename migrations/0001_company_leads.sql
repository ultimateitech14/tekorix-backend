CREATE TABLE IF NOT EXISTS company_leads (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  company_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  need TEXT NOT NULL,
  message TEXT NOT NULL,
  source_page TEXT NOT NULL DEFAULT 'unknown',
  status TEXT NOT NULL DEFAULT 'new',
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT company_leads_source_page_check CHECK (source_page IN ('contact', 'find-talent', 'unknown')),
  CONSTRAINT company_leads_need_check CHECK (
    need IN (
      'on-roll-consultants',
      'dedicated-product-team',
      'permanent-hire',
      'contractual-hire',
      'hourly-hire',
      'bench-resources',
      'team-restructure-support',
      'mixed-requirement'
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_company_leads_created_at_desc
  ON company_leads (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_leads_status_created_at_desc
  ON company_leads (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_leads_is_read_created_at_desc
  ON company_leads (is_read, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_company_leads_email_lower
  ON company_leads (LOWER(email));
