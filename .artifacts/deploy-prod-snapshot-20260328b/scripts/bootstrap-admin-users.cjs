#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const dotenv = require("dotenv");
const { createClient } = require("@supabase/supabase-js");

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

const defaultEmails = ["nxme176@gmail.com", "omchai.g44@gmail.com"];
const args = process.argv.slice(2);
const shouldResetPassword = args.includes("--reset-password");
const shouldRecreate = args.includes("--recreate");
let explicitPassword = "";
const rawEmails = [];
for (let index = 0; index < args.length; index += 1) {
	const arg = args[index];
	if (arg === "--reset-password" || arg === "--recreate") continue;
	if (arg === "--password") {
		explicitPassword = String(args[index + 1] || "");
		index += 1;
		continue;
	}
	rawEmails.push(arg);
}
const targetEmails = (rawEmails.length
	? rawEmails
	: defaultEmails
)
	.map((email) => String(email || "").trim().toLowerCase())
	.filter(Boolean);

const generateTempPassword = () =>
	`VibeAdmin#${crypto.randomBytes(6).toString("hex")}!`;

async function findUserByEmail(email) {
	let page = 1;
	const perPage = 200;
	while (true) {
		const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
		if (error) throw error;
		const users = data?.users || [];
		const hit = users.find(
			(user) => String(user.email || "").trim().toLowerCase() === email,
		);
		if (hit) return hit;
		if (users.length < perPage) return null;
		page += 1;
	}
}

async function ensureAdmin(email, options = {}) {
	const { resetPassword = false, recreate = false, passwordOverride = "" } = options;
	const existing = await findUserByEmail(email);
	const resolvedPassword =
		String(passwordOverride || "").trim() || generateTempPassword();

	if (existing && recreate) {
		const { error: deleteError } = await supabase.auth.admin.deleteUser(existing.id);
		if (deleteError) throw new Error(`${email}: ${deleteError.message}`);
	}

	if (!existing || recreate) {
		const { data, error } = await supabase.auth.admin.createUser({
			email,
			password: resolvedPassword,
			email_confirm: true,
			app_metadata: { role: "admin", roles: ["admin"] },
		});
		if (error) throw new Error(`${email}: ${error.message}`);
		return {
			email,
			id: data?.user?.id || null,
			created: true,
			recreated: Boolean(existing && recreate),
			tempPassword: resolvedPassword,
		};
	}

	const appMeta = existing.app_metadata || {};
	const currentRoles = Array.isArray(appMeta.roles) ? appMeta.roles : [];
	const roles = Array.from(
		new Set([...currentRoles.map((role) => String(role || "")), "admin"]),
	).filter(Boolean);
	const role = appMeta.role === "super_admin" ? "super_admin" : "admin";
	const maybePassword = resetPassword ? resolvedPassword : null;

	const { error } = await supabase.auth.admin.updateUserById(existing.id, {
		password: maybePassword || undefined,
		email_confirm: true,
		app_metadata: {
			...appMeta,
			role,
			roles,
		},
	});
	if (error) throw new Error(`${email}: ${error.message}`);

	return {
		email,
		id: existing.id,
		created: false,
		recreated: false,
		tempPassword: maybePassword,
	};
}

async function main() {
	if (!targetEmails.length) {
		throw new Error("No target emails provided");
	}

	const results = [];
	for (const email of targetEmails) {
		const result = await ensureAdmin(email, {
			resetPassword: shouldResetPassword,
			recreate: shouldRecreate,
			passwordOverride: explicitPassword,
		});
		results.push(result);
	}

	console.log(
		JSON.stringify(
			{
				success: true,
				results,
			},
			null,
			2,
		),
	);
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
