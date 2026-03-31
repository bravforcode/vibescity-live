-- Phase 2 Schema: Pricing Table
-- Externalizing hardcoded prices from code to database.

CREATE TABLE IF NOT EXISTS product_prices (
    sku TEXT PRIMARY KEY,
    price_satang INTEGER NOT NULL,
    currency TEXT DEFAULT 'thb',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed Initial Prices (Base prices in satang)
INSERT INTO product_prices (sku, price_satang) VALUES
('verified', 19900), -- 199.00 THB
('glow', 9900),      -- 99.00 THB
('boost', 4900),     -- 49.00 THB
('giant', 29900)     -- 299.00 THB
ON CONFLICT (sku) DO UPDATE
SET price_satang = EXCLUDED.price_satang,
    updated_at = NOW();

-- Create index if needed (pkey is already indexed)
-- CREATE INDEX IF NOT EXISTS idx_product_prices_active ON product_prices(is_active);
