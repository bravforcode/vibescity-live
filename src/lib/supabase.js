import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "YOUR_SUPABASE_URL";
const supabaseAnonKey =
	import.meta.env.VITE_SUPABASE_ANON_KEY || "YOUR_SUPABASE_ANON_KEY";

if (!supabaseAnonKey || supabaseAnonKey === "YOUR_SUPABASE_ANON_KEY") {
	console.error("🚨 Supabase API/Anon Key is missing! Check your .env file.");
}

const getVisitorHeader = () => {
	try {
		const vid = globalThis.localStorage?.getItem("vibe_visitor_id");
		return vid ? { vibe_visitor_id: vid } : {};
	} catch {
		return {};
	}
};

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
	global: {
		headers: getVisitorHeader(),
	},
});
