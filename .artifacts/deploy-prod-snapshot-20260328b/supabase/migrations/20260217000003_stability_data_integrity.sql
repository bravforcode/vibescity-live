-- Migration: Stability & Data Integrity Fixes
-- 1. Atomic check-in RPC (prevents SELECT→INSERT race condition)
-- 2. Unique constraint on orders.slip_url (prevents duplicate slip submissions)
-- 3. Ensure orders table, slip_url, and venue_id exist (Fixes "relation does not exist" error)
-- 4. Correct parameter types for safe_check_in (venue_id should be UUID)

-- ============================================================
-- 0. Pre-requisites: Ensure table and columns exist
-- ============================================================

-- Ensure order_status enum exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'order_status') THEN
    CREATE TYPE order_status AS ENUM ('pending', 'paid', 'failed', 'refunded');
  END IF;
END $$;

-- Ensure orders table exists (Minimal required schema if missing)
-- Note: removed foreign keys to 'shops' or 'venues' to prevent dependency issues if they are views
CREATE TABLE IF NOT EXISTS public.orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  shop_id BIGINT, -- Legacy BigInt reference (optional)
  venue_id UUID,  -- Modern UUID reference (optional)
  provider TEXT NOT NULL DEFAULT 'stripe',
  provider_order_id TEXT,
  status order_status NOT NULL DEFAULT 'pending',
  total_amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'THB',
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ensure RLS is enabled on orders (Security best practice)
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

-- Ensure slip_url column exists
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS slip_url TEXT;

-- Ensure venue_id column exists (for modern orders)
ALTER TABLE public.orders
ADD COLUMN IF NOT EXISTS venue_id UUID;

-- ============================================================
-- 1. Atomic check-in with advisory lock
-- ============================================================
-- Note: p_venue_id changed to UUID to match modern venues/check_ins schema
CREATE OR REPLACE FUNCTION safe_check_in(
  p_user_id uuid,
  p_venue_id uuid, -- Changed from bigint to uuid
  p_note text DEFAULT ''
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_today_start timestamptz;
  v_existing_id bigint;
  v_new record;
BEGIN
  v_today_start := date_trunc('day', now());

  -- Advisory lock scoped to this transaction prevents concurrent duplicates
  PERFORM pg_advisory_xact_lock(
    hashtext(p_user_id::text || '::' || p_venue_id::text || '::' || v_today_start::text)
  );

  -- Check for existing check-in today
  SELECT id INTO v_existing_id
  FROM check_ins
  WHERE user_id = p_user_id
    AND venue_id = p_venue_id
    AND created_at >= v_today_start;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'already_checked_in');
  END IF;

  -- Safe to insert
  INSERT INTO check_ins (user_id, venue_id, note)
  VALUES (p_user_id, p_venue_id, p_note)
  RETURNING * INTO v_new;

  RETURN jsonb_build_object('success', true, 'data', row_to_json(v_new)::jsonb);
END;
$$;

-- ============================================================
-- 2. Prevent duplicate slip submissions (active orders only)
-- ============================================================
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_slip_url_active
ON orders (slip_url)
WHERE slip_url IS NOT NULL
  AND status NOT IN ('cancelled', 'rejected');
