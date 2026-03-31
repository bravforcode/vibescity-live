-- Phase 09: Pricing Unhardcode
-- Canonical server-side pricing table replacing hardcoded PRICES dict.

CREATE TABLE IF NOT EXISTS product_prices (
    sku TEXT PRIMARY KEY,
    price_satang INTEGER NOT NULL CHECK (price_satang > 0),
    currency TEXT NOT NULL DEFAULT 'thb',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial prices (satang = THB * 100)
INSERT INTO product_prices (sku, price_satang) VALUES
    ('verified', 19900),   -- 199.00 THB
    ('glow',      9900),   --  99.00 THB
    ('boost',     4900),   --  49.00 THB
    ('giant',    29900)    -- 299.00 THB
ON CONFLICT (sku) DO UPDATE
    SET price_satang = EXCLUDED.price_satang,
        updated_at   = NOW();

-- RLS: anyone can read active prices, only service_role can write.
ALTER TABLE product_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_prices_public_read"
    ON product_prices FOR SELECT
    USING (is_active = TRUE);

CREATE POLICY "product_prices_service_write"
    ON product_prices FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
