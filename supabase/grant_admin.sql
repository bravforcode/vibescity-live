-- Run this in your Supabase SQL Editor to grant admin privileges
UPDATE auth.users
SET raw_app_meta_data =
  CASE
    WHEN raw_app_meta_data IS NULL THEN '{"role": "admin"}'::jsonb
    ELSE raw_app_meta_data || '{"role": "admin"}'::jsonb
  END
WHERE email = 'nxme176@gmail.com';

-- Verify the change
SELECT email, raw_app_meta_data
FROM auth.users
WHERE email = 'nxme176@gmail.com';
