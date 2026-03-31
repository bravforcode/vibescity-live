-- Partner payout secret storage (extended TH + international fields)
-- Idempotent migration: creates/extends secure table used by backend /partner/bank endpoint.

CREATE TABLE IF NOT EXISTS public.partner_bank_secrets (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  bank_code text,
  account_name text,
  account_number text,
  promptpay_id text,
  bank_country text,
  currency text,
  swift_code text,
  iban text,
  routing_number text,
  bank_name text,
  branch_name text,
  account_type text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.partner_bank_secrets
  ADD COLUMN IF NOT EXISTS bank_code text,
  ADD COLUMN IF NOT EXISTS account_name text,
  ADD COLUMN IF NOT EXISTS account_number text,
  ADD COLUMN IF NOT EXISTS promptpay_id text,
  ADD COLUMN IF NOT EXISTS bank_country text,
  ADD COLUMN IF NOT EXISTS currency text,
  ADD COLUMN IF NOT EXISTS swift_code text,
  ADD COLUMN IF NOT EXISTS iban text,
  ADD COLUMN IF NOT EXISTS routing_number text,
  ADD COLUMN IF NOT EXISTS bank_name text,
  ADD COLUMN IF NOT EXISTS branch_name text,
  ADD COLUMN IF NOT EXISTS account_type text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_partner_bank_secrets_updated_at
  ON public.partner_bank_secrets (updated_at DESC);

ALTER TABLE public.partner_bank_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partner_bank_secrets_service_role_all ON public.partner_bank_secrets;
CREATE POLICY partner_bank_secrets_service_role_all
  ON public.partner_bank_secrets
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.partner_bank_secrets FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.partner_bank_secrets TO service_role;
