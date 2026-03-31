-- Add Video_URL column to venues if it doesn't exist
-- (Was only defined in the legacy/ migration folder, never applied to remote)
ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS "Video_URL" TEXT;
