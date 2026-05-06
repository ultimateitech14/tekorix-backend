ALTER TABLE site_settings
  DROP COLUMN IF EXISTS notification_sms_provider,
  DROP COLUMN IF EXISTS notification_sms_api_key,
  DROP COLUMN IF EXISTS notification_sms_from,
  DROP COLUMN IF EXISTS notification_sms_test_to,
  ADD COLUMN IF NOT EXISTS notification_template_mappings JSONB NOT NULL DEFAULT '{}'::jsonb;
