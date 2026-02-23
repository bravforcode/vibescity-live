import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
	const missing = [
		!supabaseUrl && "VITE_SUPABASE_URL",
		!supabaseAnonKey && "VITE_SUPABASE_ANON_KEY",
	]
		.filter(Boolean)
		.join(", ");
	throw new Error(`Missing required env vars: ${missing}. Check your .env file.`);
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
