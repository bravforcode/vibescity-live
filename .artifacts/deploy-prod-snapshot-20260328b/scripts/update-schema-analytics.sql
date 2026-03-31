-- Add Analytics Columns
ALTER TABLE shops ADD COLUMN IF NOT EXISTS total_views INTEGER DEFAULT 0;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pin_clicks INTEGER DEFAULT 0;

-- Add Pro Feature Columns
ALTER TABLE shops ADD COLUMN IF NOT EXISTS is_glowing BOOLEAN DEFAULT false;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pin_expiration TIMESTAMP WITH TIME ZONE;
ALTER TABLE shops ADD COLUMN IF NOT EXISTS pro_status VARCHAR(50) DEFAULT 'FREE'; -- FREE, PRO, ELITE

-- Add Trigger for Updated At (if not exists)
-- CREATE OR REPLACE FUNCTION update_modified_column()
-- RETURNS TRIGGER AS $$
-- BEGIN
--    NEW.updated_at = now();
--    RETURN NEW;
-- END;
-- $$ language 'plpgsql';

-- Atomic Increment Functions
-- DROP functions first to allow parameter name changes
DROP FUNCTION IF EXISTS increment_shop_view(INT);
DROP FUNCTION IF EXISTS increment_shop_click(INT);

CREATE OR REPLACE FUNCTION increment_shop_view(shop_id_param INT)
RETURNS VOID AS $$
BEGIN
  UPDATE shops SET total_views = total_views + 1 WHERE id = shop_id_param;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION increment_shop_click(shop_id_param INT)
RETURNS VOID AS $$
BEGIN
  UPDATE shops SET pin_clicks = pin_clicks + 1 WHERE id = shop_id_param;
END;
$$ LANGUAGE plpgsql;
