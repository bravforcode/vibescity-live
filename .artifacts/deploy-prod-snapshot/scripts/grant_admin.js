import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const targetEmail = String(
	process.argv[2] || process.env.ADMIN_GRANT_EMAIL || "omchai.g44@gmail.com",
)
	.trim()
	.toLowerCase();

if (!supabaseUrl || !supabaseServiceKey) {
	console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");
	process.exit(1);
}

if (!targetEmail) {
	console.error("Missing target email. Usage: node scripts/grant_admin.js <email>");
	process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
	auth: {
		autoRefreshToken: false,
		persistSession: false,
	},
});

const findUserByEmail = async (email) => {
	let page = 1;
	const perPage = 100;
	while (true) {
		const {
			data: { users },
			error,
		} = await supabase.auth.admin.listUsers({
			page,
			perPage,
		});
		if (error) throw error;
		const match = (users || []).find(
			(user) => String(user.email || "").trim().toLowerCase() === email,
		);
		if (match) return match;
		if (!users || users.length < perPage) return null;
		page += 1;
	}
};

const ensureAdminRole = async (user) => {
	const appMeta = user?.app_metadata || {};
	const roles = Array.isArray(appMeta.roles) ? [...appMeta.roles] : [];
	if (!roles.includes("admin")) roles.push("admin");
	const nextRole = appMeta.role === "super_admin" ? "super_admin" : "admin";

	const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
		app_metadata: {
			...appMeta,
			role: nextRole,
			roles,
		},
	});
	if (error) throw error;
	return data?.user || null;
};

const main = async () => {
	console.log(`Looking up user: ${targetEmail}`);
	const user = await findUserByEmail(targetEmail);
	if (!user) {
		console.error(`User ${targetEmail} not found. User must sign up first.`);
		process.exit(1);
	}

	const updated = await ensureAdminRole(user);
	console.log("✅ Admin role granted");
	console.log({
		id: updated?.id || user.id,
		email: updated?.email || user.email,
		app_metadata: updated?.app_metadata || user.app_metadata,
	});
};

main().catch((error) => {
	console.error("Failed to grant admin role:", error?.message || error);
	process.exit(1);
});
