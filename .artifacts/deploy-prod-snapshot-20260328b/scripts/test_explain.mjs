import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

// Send the raw SQL through a direct fetch to the postgres engine via restful API (not possible without admin).
// Oh wait, anon key cannot execute raw SQL.
// I can just create an RPC to run EXPLAIN!
