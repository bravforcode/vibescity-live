import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function check() {
  const { data: shops, error: sErr } = await supabase.from('shops').select('count', { count: 'exact' });
  const { data: buildings, error: bErr } = await supabase.from('buildings').select('count', { count: 'exact' });
  const { data: events, error: eErr } = await supabase.from('events').select('count', { count: 'exact' });

  console.log("Shops Count:", shops, sErr?.message || 'OK');
  console.log("Buildings Count:", buildings, bErr?.message || 'OK');
  console.log("Events Count:", events, eErr?.message || 'OK');
}

check();
