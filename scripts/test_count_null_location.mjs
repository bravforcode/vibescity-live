import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  const { count, error } = await supabase
    .from('venues')
    .select('*', { count: 'exact', head: true })
    .is('location', null);

  if (error) {
    console.error("Error:", error);
  } else {
    console.log("Venues with NULL location:", count);
  }
}

test();
