#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

const args = process.argv.slice(2);
const email = String(args[0] || "").trim().toLowerCase();
const redirectTo = String(args[1] || "http://localhost:5173/admin").trim();

if (!email) {
	console.error(
		"Usage: node scripts/generate-admin-magic-link.cjs <email> [redirectTo]",
	);
	process.exit(1);
}

const envPath = path.resolve(process.cwd(), ".env");
const parsed = fs.existsSync(envPath)
	? dotenv.parse(fs.readFileSync(envPath, "utf8"))
	: {};
const env = { ...parsed, ...process.env };

const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
	console.error(
		"Missing SUPABASE_URL/VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
	);
	process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
	auth: { autoRefreshToken: false, persistSession: false },
});

const rewriteRedirect = (rawLink, nextRedirect) => {
	try {
		const url = new URL(String(rawLink || ""));
		url.searchParams.set("redirect_to", nextRedirect);
		return url.toString();
	} catch {
		return String(rawLink || "");
	}
};

async function main() {
	const { data, error } = await supabase.auth.admin.generateLink({
		type: "magiclink",
		email,
		options: {
			redirectTo,
		},
	});

	if (error) {
		throw new Error(error.message || "Failed to generate magic link");
	}

	const actionLink = rewriteRedirect(data?.properties?.action_link, redirectTo);
	const output = {
		success: true,
		email,
		redirect_to_requested: redirectTo,
		action_link: actionLink,
		email_otp: data?.properties?.email_otp || null,
		notice:
			"Open action_link in browser to sign in immediately (SMTP fallback mode).",
	};

	console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
	console.error(
		JSON.stringify(
			{
				success: false,
				error: error?.message || String(error),
			},
			null,
			2,
		),
	);
	process.exit(1);
});
