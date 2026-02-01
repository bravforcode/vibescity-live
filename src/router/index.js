import { createRouter, createWebHistory } from "vue-router";

// Lazy load views for performance
const HomeView = () => import("../views/HomeView.vue");
// Use the polished OwnerDashboard component as the view
const MerchantDashboard = () =>
	import("../components/dashboard/OwnerDashboard.vue");

const routes = [
	{
		path: "/",
		name: "Home",
		component: HomeView,
		meta: { title: "VibeCity - Chiang Mai Entertainment" },
	},
	{
		path: "/merchant",
		name: "MerchantDashboard",
		component: MerchantDashboard,
		meta: {
			title: "Merchant Portal - VibeCity",
			requiresAuth: true,
		},
	},
	// 404 Fallback
	{
		path: "/:pathMatch(.*)*",
		redirect: "/",
	},
];

const router = createRouter({
	history: createWebHistory(),
	routes,
	scrollBehavior(_to, _from, savedPosition) {
		if (savedPosition) return savedPosition;
		return { top: 0 };
	},
});

// Basic title updater
router.beforeEach((to, _from, next) => {
	document.title = to.meta.title || "VibeCity";
	next();
});

export default router;
