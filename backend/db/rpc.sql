-- 1. Get Nearby Shops (GIS Search)
CREATE OR REPLACE FUNCTION get_nearby_shops(
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    radius_meters DOUBLE PRECISION DEFAULT 5000,
    category_filter TEXT DEFAULT NULL,
    limit_count INTEGER DEFAULT 50
)
RETURNS TABLE (
    id BIGINT,
    name TEXT,
    category TEXT,
    lat DOUBLE PRECISION,
    lng DOUBLE PRECISION,
    distance DOUBLE PRECISION,
    images TEXT[],
    rating DOUBLE PRECISION,
    review_count INTEGER
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.name,
        s.category,
        s.lat,
        s.lng,
        st_distance(
            s.location,
            st_point(lng, lat)::geography
        ) as distance,
        s.images,
        s.rating,
        s.review_count
    FROM
        shops s
    WHERE
        st_dwithin(
            s.location,
            st_point(lng, lat)::geography,
            radius_meters
        )
        AND (category_filter IS NULL OR s.category ILIKE '%' || category_filter || '%')
        AND s.status = 'active'
    ORDER BY
        distance ASC
    LIMIT
        limit_count;
END;
$$;

-- 2. Award Coins (Transactional)
CREATE OR REPLACE FUNCTION award_coins(
    p_user_id UUID,
    p_amount INTEGER,
    p_txn_type TEXT,
    p_ref_id TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance INTEGER;
BEGIN
    -- Update profile balance
    UPDATE profiles
    SET coins = coins + p_amount
    WHERE id = p_user_id
    RETURNING coins INTO v_new_balance;

    -- Log transaction
    INSERT INTO user_coin_ledger (user_id, amount, transaction_type, reference_id)
    VALUES (p_user_id, p_amount, p_txn_type, p_ref_id);

    RETURN jsonb_build_object(
        'success', true,
        'new_balance', v_new_balance,
        'awarded', p_amount
    );
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'success', false,
        'error', SQLERRM
    );
END;
$$;

-- 3. Redeem Coupon (Transactional)
CREATE OR REPLACE FUNCTION redeem_coupon(
    p_user_id UUID,
    p_coupon_id BIGINT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_coupon coupons%ROWTYPE;
    v_profile profiles%ROWTYPE;
    v_code TEXT;
BEGIN
    -- Check Coupon
    SELECT * INTO v_coupon FROM coupons WHERE id = p_coupon_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coupon not found');
    END IF;

    IF v_coupon.status != 'active' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Coupon inactive');
    END IF;

    IF v_coupon.stock = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Out of stock');
    END IF;

    IF v_coupon.valid_until IS NOT NULL AND v_coupon.valid_until < now() THEN
         RETURN jsonb_build_object('success', false, 'error', 'Coupon expired');
    END IF;

    -- Check User Balance
    SELECT * INTO v_profile FROM profiles WHERE id = p_user_id FOR UPDATE;

    IF v_profile.coins < v_coupon.cost THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient coins');
    END IF;

    -- Deduct Coins
    UPDATE profiles
    SET coins = coins - v_coupon.cost
    WHERE id = p_user_id;

    -- Log Ledger
    INSERT INTO user_coin_ledger (user_id, amount, transaction_type, reference_id)
    VALUES (p_user_id, -v_coupon.cost, 'redeem', p_coupon_id::text);

    -- Reduce Stock (if not infinite)
    IF v_coupon.stock > 0 THEN
        UPDATE coupons SET stock = stock - 1 WHERE id = p_coupon_id;
    END IF;

    -- Generate Code
    v_code := upper(substring(md5(random()::text) from 1 for 8));

    -- Create User Coupon
    INSERT INTO user_coupons (user_id, coupon_id, code)
    VALUES (p_user_id, p_coupon_id, v_code);

    RETURN jsonb_build_object(
        'success', true,
        'code', v_code,
        'new_balance', v_profile.coins - v_coupon.cost
    );
END;
$$;

-- 4. Match Shop (Deduplication)
CREATE OR REPLACE FUNCTION match_shop(
    p_name TEXT,
    p_lat DOUBLE PRECISION,
    p_lng DOUBLE PRECISION,
    p_threshold_meters DOUBLE PRECISION DEFAULT 50
)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE
    v_shop_id BIGINT;
BEGIN
    SELECT id INTO v_shop_id
    FROM shops
    WHERE
        st_dwithin(
            location,
            st_point(p_lng, p_lat)::geography,
            p_threshold_meters
        )
        AND (
            name ILIKE p_name
            OR levenshtein(lower(name), lower(p_name)) <= 3
        )
    LIMIT 1;

    RETURN v_shop_id;
END;
$$;

-- 5. Grant Rewards (Gamification)
CREATE OR REPLACE FUNCTION grant_rewards(
    target_user_id UUID,
     reward_coins INTEGER,
    reward_xp INTEGER,
    action_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_coins INTEGER;
    v_new_xp INTEGER;
BEGIN
    -- Upsert user_stats
    INSERT INTO user_stats (user_id, coins, xp)
    VALUES (target_user_id, reward_coins, reward_xp)
    ON CONFLICT (user_id)
    DO UPDATE SET
        coins = user_stats.coins + EXCLUDED.coins,
        xp = user_stats.xp + EXCLUDED.xp
    RETURNING coins, xp INTO v_new_coins, v_new_xp;

    -- Log transaction
    INSERT INTO user_coin_ledger (user_id, amount, transaction_type, reference_id)
    VALUES (target_user_id, reward_coins, 'reward', action_name);

    RETURN jsonb_build_object(
        'success', true,
        'new_coins', v_new_coins,
        'new_xp', v_new_xp
    );
END;
$$;

-- 6. Increment Venue Views (Analytics)
CREATE OR REPLACE FUNCTION increment_venue_views(venue_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Note: metadata column in shops table is JSONB
    UPDATE shops
    SET metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{total_views}',
        (COALESCE((metadata->>'total_views')::int, 0) + 1)::text::jsonb
    )
    WHERE id = venue_id;
END;
$$;
