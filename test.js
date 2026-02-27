import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.VITE_SUPABASE_ANON_KEY
);

async function main() {
  const { data, error } = await supabase.rpc('query_test', { sql: "SELECT c.oid, n.nspname, c.relname, c.relkind, pg_get_viewdef(c.oid, true) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relname = 'venues_public';" });
  console.log("Error:", error);
  console.log("Data:", data);
}
main();
