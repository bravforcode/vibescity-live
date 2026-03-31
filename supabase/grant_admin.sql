-- Run this in your Supabase SQL Editor to grant admin privileges.
-- Replace admin@example.com with the real target email before running.
UPDATE auth.users
SET raw_app_meta_data =
  CASE
    WHEN raw_app_meta_data IS NULL THEN '{"role": "admin"}'::jsonb
    ELSE raw_app_meta_data || '{"role": "admin"}'::jsonb
  END
WHERE email = 'admin@example.com';

-- Verify the change
SELECT email, raw_app_meta_data
FROM auth.users
WHERE email = 'admin@example.com';
