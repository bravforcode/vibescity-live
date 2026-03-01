-- =============================================================================
-- Migration: Backfill Coin Ledger (Legacy Balances)
-- Date: 2026-03-01
--
-- Strategy:
--   1. Read existing balances from `user_stats` and `visitor_gamification_stats`.
--   2. Calculate the difference between current balance and the sum of ledger history.
--   3. Insert a single "legacy_backfill" transaction to make the ledger match the current balance.
-- =============================================================================

BEGIN;

-- 1. Backfill for Authenticated Users (coin_ledger)
WITH current_discrepancies AS (
  SELECT
    us.user_id,
    us.coins AS target_balance,
    COALESCE(SUM(cl.amount), 0)::INTEGER AS current_ledger_sum,
    us.coins - COALESCE(SUM(cl.amount), 0)::INTEGER AS delta_needed
  FROM public.user_stats us
  LEFT JOIN public.coin_ledger cl ON cl.user_id = us.user_id
  GROUP BY us.user_id, us.coins
  HAVING us.coins <> COALESCE(SUM(cl.amount), 0)::INTEGER
)
INSERT INTO public.coin_ledger (
  user_id, amount, description, transaction_type, idempotency_key, created_at
)
SELECT
  user_id,
  delta_needed,
  'legacy_balance_backfill',
  'adjustment',
  user_id::text || ':legacy_backfill',
  NOW() - interval '1 second' -- ensure it sorts slightly older than new txs
FROM current_discrepancies
WHERE delta_needed <> 0
ON CONFLICT (idempotency_key) DO NOTHING;

-- 2. Backfill for Anonymous Visitors (gamification_logs)
WITH current_visitor_discrepancies AS (
  SELECT
    vgs.visitor_id,
    vgs.balance AS target_balance,
    COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0) AS current_log_sum,
    vgs.balance - COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0) AS delta_needed
  FROM public.visitor_gamification_stats vgs
  LEFT JOIN public.gamification_logs gl
    ON gl.payload->>'visitor_id' = vgs.visitor_id
    AND gl.payload->>'source' = 'dual_write_v1'
  GROUP BY vgs.visitor_id, vgs.balance
  HAVING vgs.balance <> COALESCE(SUM((gl.payload->>'coin_delta')::INTEGER), 0)
)
INSERT INTO public.gamification_logs (
  user_id, event_name, payload, created_at
)
SELECT
  NULL,
  'legacy_balance_backfill',
  jsonb_build_object(
    'visitor_id', visitor_id,
    'coin_delta', delta_needed,
    'new_balance', target_balance,
    'source', 'dual_write_v1',
    'note', 'backfill'
  ),
  NOW() - interval '1 second'
FROM current_visitor_discrepancies
WHERE delta_needed <> 0;

COMMIT;
