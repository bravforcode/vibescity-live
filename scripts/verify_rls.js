
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import fs from "node:fs";

// Load .env
if (fs.existsSync(".env")) {
  const envConfig = dotenv.parse(fs.readFileSync(".env"));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error("❌ Missing Supabase credentials in .env");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

function log(msg) {
  console.log(msg);
  fs.appendFileSync("scripts/verify_rls_result.txt", msg + "\n");
}

async function verifyRLS() {
  fs.writeFileSync("scripts/verify_rls_result.txt", "STARTING VERIFICATION\n");
  log("🛡️ Verifying RLS on 'analytics_logs'...");

  // Test 1: Try to INSERT as Anon (Should FAIL)
  const { error: insertError } = await supabase
    .from("analytics_logs")
    .insert([{ event_type: "security_test", data: { test: true } }]);

  // Expecting 401 Unauthorized or 403 Forbidden, or just an RLS error
  // If RLS is enabled and no policy allows insert for anon, this should error.
  if (insertError) {
      log("✅ Insert blocked as expected: " + insertError.message);
  } else {
      log("❌ CRITICAL: Insert SUCCEEDED as Anon! RLS is missing or too permissive.");
  }

  // Test 2: Try to SELECT as Anon (Should return empty or error)
  const { data, error: selectError } = await supabase
    .from("analytics_logs")
    .select("*")
    .limit(1);

  if (selectError) {
       log("✅ Select blocked (Error): " + selectError.message);
  } else if (data && data.length === 0) {
       log("✅ Select returned 0 rows (RLS likely hiding data).");
  } else {
       log("❌ CRITICAL: Select returned data as Anon! " + JSON.stringify(data));
  }

  if (!insertError || (data && data.length > 0)) {
       log("\n⚠️  CONCLUSION: RLS FAILED. You must apply the migration.");
       process.exit(1);
  } else {
       log("\n✅ CONCLUSION: RLS appears active.");
  }
}

verifyRLS();
