
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";

if (fs.existsSync(".env")) {
  const envConfig = dotenv.parse(fs.readFileSync(".env"));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkHealth() {
  fs.writeFileSync("scripts/db_health_result.txt", "CHECKING\n");

  // Try to read 'shops' which should be public
  const { data, error } = await supabase.from("shops").select("id").limit(1);

  if (error) {
    fs.appendFileSync("scripts/db_health_result.txt", "ERROR: " + error.message);
  } else {
    fs.appendFileSync("scripts/db_health_result.txt", "SUCCESS");
  }
}

checkHealth();
