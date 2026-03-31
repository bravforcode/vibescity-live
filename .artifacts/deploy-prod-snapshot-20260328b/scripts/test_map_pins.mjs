import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);

async function test() {
  console.log("Testing get_map_pins...");
  const { data, error } = await supabase.rpc("get_map_pins", {
    p_min_lat: 18.7,
    p_min_lng: 98.9,
    p_max_lat: 18.8,
    p_max_lng: 99.0,
    p_zoom: 15
  });

  if (error) {
    console.error("RPC Error:", JSON.stringify(error, null, 2));
  } else {
    console.log("Success! Returned " + data.length + " pins.");
  }
}

test();
