CREATE TABLE IF NOT EXISTS blog_posts (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  category TEXT NOT NULL,
  date_label TEXT NOT NULL,
  read_time TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  cover_image TEXT NOT NULL,
  cover_alt TEXT NOT NULL,
  intro TEXT NOT NULL,
  sections JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_blog_posts_published_at_desc
  ON blog_posts (published_at DESC NULLS LAST, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_blog_posts_is_published
  ON blog_posts (is_published);

CREATE INDEX IF NOT EXISTS idx_blog_posts_category
  ON blog_posts (category);
