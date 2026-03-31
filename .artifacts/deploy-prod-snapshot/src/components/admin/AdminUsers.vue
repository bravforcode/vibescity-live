<template>
  <div class="admin-users space-y-6 text-slate-200">
    <div
      class="bg-blue-500/10 border border-blue-500/20 text-blue-400 p-4 rounded-xl flex items-start gap-3 text-sm"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        class="mt-0.5 shrink-0"
      >
        <path
          d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"
        />
        <line x1="12" y1="9" x2="12" y2="13" />
        <line x1="12" y1="17" x2="12.01" y2="17" />
      </svg>
      <div>
        <strong>Notice:</strong> User data is loaded from Supabase Auth and
        `user_profiles`. Profile data may be unavailable or empty if Row Level
        Security (RLS) restrictions prevent admin access. Ensure your admin user
        has the correct RLS bypass role.
      </div>
    </div>

    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 shadow-sm">
      <h3
        class="text-sm font-semibold text-slate-300 mb-4 pb-2 border-b border-slate-700 flex items-center gap-2"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          class="text-slate-400"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        Registered Users
      </h3>
      <DataTable
        :columns="columns"
        :fetch-fn="fetchUsers"
        search-placeholder="Search users by name, email..."
        default-sort="created_at"
        :auto-load="true"
      />
    </div>
  </div>
</template>

<script setup>
import { adminDataService } from "../../services/adminDataService";
import DataTable from "./DataTable.vue";

const fetchUsers = async (opts) => {
	try {
		// Utilizing the queryTable from adminDataService for consistency
		// with pagination, sorting, and searching.
		return await adminDataService.queryTable("user_profiles", {
			orderBy: "created_at",
			searchColumns: ["user_id", "username", "display_name", "email"],
			...opts,
		});
	} catch (e) {
		console.warn("User list failed:", e.message);
		return {
			rows: [],
			total: 0,
			page: 1,
			pageSize: opts.pageSize,
			totalPages: 0,
		};
	}
};

const columns = [
	{ key: "user_id", label: "User ID", width: "160px" },
	{ key: "username", label: "Username", width: "130px" },
	{ key: "display_name", label: "Display Name", width: "150px" },
	{ key: "email", label: "Email", width: "180px" },
	{
		key: "level",
		label: "Level",
		type: "number",
		width: "60px",
		render: (v) =>
			`<span class="bg-blue-500/20 text-blue-400 px-2 rounded font-mono font-bold">${v || 0}</span>`,
	},
	{
		key: "xp",
		label: "XP",
		type: "number",
		width: "70px",
		render: (v) => `<span class="tabular-nums font-semibold">${v || 0}</span>`,
	},
	{
		key: "total_coins",
		label: "Coins",
		type: "number",
		width: "80px",
		render: (v) =>
			`<span class="text-amber-400 font-bold tabular-nums">${v || 0}</span>`,
	},
	{ key: "created_at", label: "Joined", type: "date", width: "140px" },
	{ key: "updated_at", label: "Updated", type: "date", width: "140px" },
];
</script>
