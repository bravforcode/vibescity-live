-- ============================================
-- Loki Mode: UGC & Gamification Schema
-- ============================================

-- 1. User Submissions Table (UGC)
CREATE TABLE IF NOT EXISTS user_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    latitude DECIMAL(10, 7) NOT NULL,
    longitude DECIMAL(10, 7) NOT NULL,
    province TEXT,
    images TEXT[], -- Array of image URLs
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    rejection_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for user_submissions
ALTER TABLE user_submissions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own submissions
CREATE POLICY "Users can view own submissions" ON user_submissions
    FOR SELECT USING (auth.uid() = user_id);

-- Policy: Users can insert submissions
CREATE POLICY "Users can insert submissions" ON user_submissions
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 2. User Stats Table (Gamification Profile)
CREATE TABLE IF NOT EXISTS user_stats (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id),
    coins INTEGER DEFAULT 0,
    xp INTEGER DEFAULT 0,
    level INTEGER DEFAULT 1,
    badges JSONB DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for user_stats
ALTER TABLE user_stats ENABLE ROW LEVEL SECURITY;

-- Policy: Public read access (for leaderboards/profiles)
CREATE POLICY "Public read access to user_stats" ON user_stats
    FOR SELECT USING (true);

-- 3. Gamification Logs (History)
CREATE TABLE IF NOT EXISTS gamification_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    action_type TEXT NOT NULL, -- 'add_shop', 'add_photo', 'review', 'check_in'
    coins_earned INTEGER DEFAULT 0,
    xp_earned INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS for gamification_logs
ALTER TABLE gamification_logs ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own logs
CREATE POLICY "Users can view own logs" ON gamification_logs
    FOR SELECT USING (auth.uid() = user_id);

-- 4. Trigger Function: Auto-create user_stats on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_stats (user_id)
  VALUES (new.id);
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger logic (only create if not exists to avoid error on rerun)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
    END IF;
END $$;

-- 5. Helper Function: Grant Rewards (Security Definer to bypass RLS)
CREATE OR REPLACE FUNCTION grant_rewards(target_user_id UUID, reward_coins INT, reward_xp INT, action_name TEXT)
RETURNS VOID AS $$
BEGIN
    -- Update Stats
    UPDATE user_stats
    SET coins = coins + reward_coins,
        xp = xp + reward_xp
    WHERE user_id = target_user_id;

    -- Log Transaction
    INSERT INTO gamification_logs (user_id, action_type, coins_earned, xp_earned)
    VALUES (target_user_id, action_name, reward_coins, reward_xp);

    -- Level Up Logic (Simple: Level = 1 + floor(xp / 1000))
    UPDATE user_stats
    SET level = 1 + floor(xp / 1000)
    WHERE user_id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
