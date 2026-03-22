-- Phase 2: Anonymous Identity + Claim Flow migration
-- Run via Supabase SQL Editor (Dashboard > SQL Editor > New Query)

-- ============================================================
-- Tables
-- ============================================================

-- visitor_gamification: stores anonymous visitor coin balance
CREATE TABLE IF NOT EXISTS public.visitor_gamification (
  visitor_id    TEXT NOT NULL PRIMARY KEY,
  balance       INTEGER NOT NULL DEFAULT 0,
  total_earned  INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- venue_claims: one claim per visitor per venue per calendar day
CREATE TABLE IF NOT EXISTS public.venue_claims (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  visitor_id    TEXT NOT NULL,
  venue_id      TEXT NOT NULL,
  claim_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  coins_awarded INTEGER NOT NULL DEFAULT 10,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (visitor_id, venue_id, claim_date)
);

-- Index for fast lookups by visitor + date
CREATE INDEX IF NOT EXISTS idx_venue_claims_visitor_date
  ON public.venue_claims (visitor_id, claim_date);

-- ============================================================
-- RLS
-- ============================================================

ALTER TABLE public.visitor_gamification ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_claims ENABLE ROW LEVEL SECURITY;

-- Allow service_role (used by FastAPI supabase_admin) full access
CREATE POLICY "Service role full access" ON public.visitor_gamification
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON public.venue_claims
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: claim_vibe
-- Atomic claim + idempotency check.
-- Uses INSERT ON CONFLICT DO NOTHING for the venue_claims row.
-- If conflict (already claimed today): returns {already_claimed: true, balance: N}
-- Otherwise awards 10 coins and returns full result with lucky_wheel_spin: true
-- ============================================================

CREATE OR REPLACE FUNCTION public.claim_vibe(p_visitor_id TEXT, p_venue_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance   INTEGER;
  v_total     INTEGER;
  v_row_count INTEGER;
BEGIN
  -- Ensure visitor row exists
  INSERT INTO public.visitor_gamification (visitor_id)
  VALUES (p_visitor_id)
  ON CONFLICT (visitor_id) DO NOTHING;

  -- Attempt idempotent claim (one per venue per calendar day)
  INSERT INTO public.venue_claims (visitor_id, venue_id, coins_awarded)
  VALUES (p_visitor_id, p_venue_id, 10)
  ON CONFLICT (visitor_id, venue_id, claim_date) DO NOTHING;

  -- ROW_COUNT = 0 means the ON CONFLICT path was taken (no row inserted).
  -- Using GET DIAGNOSTICS instead of NOT FOUND because NOT FOUND after
  -- INSERT ON CONFLICT DO NOTHING is unreliable in some Postgres versions.
  GET DIAGNOSTICS v_row_count = ROW_COUNT;

  IF v_row_count = 0 THEN
    -- Already claimed today: return current balance without awarding coins
    SELECT balance INTO v_balance
    FROM public.visitor_gamification
    WHERE visitor_id = p_visitor_id;

    RETURN jsonb_build_object(
      'already_claimed', true,
      'balance', COALESCE(v_balance, 0)
    );
  END IF;

  -- Award coins atomically
  UPDATE public.visitor_gamification
  SET balance      = balance + 10,
      total_earned = total_earned + 10,
      updated_at   = now()
  WHERE visitor_id = p_visitor_id
  RETURNING balance, total_earned INTO v_balance, v_total;

  RETURN jsonb_build_object(
    'already_claimed',  false,
    'coins_awarded',    10,
    'balance',          COALESCE(v_balance, 10),
    'total_earned',     COALESCE(v_total, 10),
    'lucky_wheel_spin', true
  );
END;
$$;

-- ============================================================
-- RPC: get_my_claims
-- Returns venue IDs claimed today by this visitor + current balance.
-- Used on page load for MAP-02 marker glow (GAME-06 coin sync).
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_my_claims(p_visitor_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venue_ids TEXT[];
  v_balance   INTEGER;
BEGIN
  SELECT array_agg(venue_id) INTO v_venue_ids
  FROM public.venue_claims
  WHERE visitor_id = p_visitor_id
    AND claim_date = CURRENT_DATE;

  SELECT balance INTO v_balance
  FROM public.visitor_gamification
  WHERE visitor_id = p_visitor_id;

  RETURN jsonb_build_object(
    'venue_ids', COALESCE(v_venue_ids, ARRAY[]::TEXT[]),
    'balance',   COALESCE(v_balance, 0)
  );
END;
$$;
