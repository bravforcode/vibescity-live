require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://rukyitpjfmzhqjlfmbie.supabase.co';
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseKey) {
  console.error("No anon key.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testRpc() {
  console.log("Calling get_feed_cards...");
  const { data, error } = await supabase.rpc('get_feed_cards', {
    p_lat: 18.7883,
    p_lng: 98.9853
  });

  if (error) {
    console.error("RPC Error:", error);
  } else {
    console.log("RPC Success. Items:", data ? data.length : 0);
  }
}

testRpc();
