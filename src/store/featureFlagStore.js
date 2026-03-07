import { defineStore } from "pinia";
import { computed, ref } from "vue";
import {
	getFlagGovernanceViolations,
	validateFlagDependencies,
} from "@/config/featureFlagGovernance";
import { isSupabaseSchemaCacheError, supabase } from "../lib/supabase";

const DEFAULT_FLAGS = Object.freeze({
	use_v2_feed: true,
	use_v2_search: true,
	enable_web_vitals: false,
	enable_partner_program: false,
	enable_cinema_mall_explorer: false,
	enable_header_layout_guard_v2: true,
	enable_search_overlay_guard_v2: true,
	enable_map_render_scheduler_v2: true,
	enable_map_effects_pipeline_v2: true,
	enable_feed_virtualization_v2: true,
	enable_perf_guardrails_v2: true,
	enable_neon_sign_map_v1: true,
	enable_map_2d_lock_v1: true,
	enable_neon_map_actions_v1: true,
	map_hybrid_layer: false,
	map_webgl_fallback_enabled: true,
	refresh_rate_sync_enabled: true,
	battery_adaptive_render: true,
	tier_c_mode: true,
	thermal_adaptive_fetch: true,
	enable_rum_beacon_v1: true,
	enable_speculation_rules_v1: true,
	neon_sign_v2_enabled: true,
});

const DEFAULT_FLAG_CONFIG = Object.freeze({
	experiment_id: "stable",
	signature_version: "2-stable",
	refresh_interval_ms: 30000,
	circuit_breaker_window_ms: 60000,
	sprite_error_rate_threshold: 0.05,
});

const ROLLOUT_SALT = "vibecity-neon-v2";

const toRolloutPercent = (value, fallback = 100) => {
	const numeric = Number(value);
	if (!Number.isFinite(numeric)) return fallback;
	return Math.min(100, Math.max(0, Math.round(numeric)));
};

const toSafeObject = (value, fallback = {}) =>
	value && typeof value === "object" && !Array.isArray(value)
		? value
		: fallback;

const fnv1aHash = (input) => {
	let hash = 0x811c9dc5;
	const text = String(input ?? "");
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
};

const buildDefaultFlagMeta = () => {
	const entries = {};
	for (const [key, enabled] of Object.entries(DEFAULT_FLAGS)) {
		entries[key] = {
			key,
			enabled: Boolean(enabled),
			rollout_percent: 100,
			kill_switch: false,
			config: {},
		};
	}
	entries.neon_sign_v2_enabled = {
		key: "neon_sign_v2_enabled",
		enabled: true,
		rollout_percent: 0,
		kill_switch: false,
		config: { ...DEFAULT_FLAG_CONFIG },
	};
	return entries;
};

const readPersistedFlagsForE2E = () => {
	if (typeof localStorage === "undefined") return {};
	try {
		const raw = JSON.parse(localStorage.getItem("pinia-feature-flags") || "{}");
		const persisted =
			raw &&
			typeof raw === "object" &&
			raw.flags &&
			typeof raw.flags === "object"
				? raw.flags
				: {};
		return Object.fromEntries(
			Object.entries(persisted).map(([key, value]) => [key, Boolean(value)]),
		);
	} catch {
		return {};
	}
};

export const useFeatureFlagStore = defineStore("feature-flags", () => {
	const flags = ref({ ...DEFAULT_FLAGS });
	const flagMeta = ref(buildDefaultFlagMeta());
	const loadedAt = ref(null);
	const isLoading = ref(false);

	const isStale = computed(() => {
		if (!loadedAt.value) return true;
		return Date.now() - loadedAt.value > 5 * 60 * 1000;
	});
	const governanceViolations = computed(() =>
		getFlagGovernanceViolations({ flags: flags.value }),
	);

	const getFlag = (key) => {
		const normalized = String(key || "").trim();
		if (!normalized) return null;
		return (
			flagMeta.value?.[normalized] || {
				key: normalized,
				enabled: false,
				rollout_percent: 0,
				kill_switch: false,
				config: {},
			}
		);
	};

	const isEnabled = (key) => {
		const flag = getFlag(key);
		if (!(Boolean(flag?.enabled) && !flag?.kill_switch)) return false;
		return validateFlagDependencies(String(key || ""), (candidate) => {
			const dep = getFlag(candidate);
			return Boolean(dep?.enabled) && !dep?.kill_switch;
		});
	};

	const getFlagConfig = (key, fallback = {}) => {
		const flag = getFlag(key);
		const safeFallback = toSafeObject(fallback, {});
		const config = toSafeObject(flag?.config, null);
		if (!config) return safeFallback;
		return { ...safeFallback, ...config };
	};

	const isEnabledForActor = (key, actorId, context = {}) => {
		const flag = getFlag(key);
		if (!flag || !flag.enabled || flag.kill_switch) return false;
		const rolloutPercent = toRolloutPercent(flag.rollout_percent, 100);
		if (rolloutPercent >= 100) return true;
		if (rolloutPercent <= 0) return false;
		const actor = String(actorId || context?.actorId || "anonymous").trim();
		const seed = `${String(key)}:${actor}:${ROLLOUT_SALT}`;
		const bucket = fnv1aHash(seed) % 100;
		return bucket < rolloutPercent;
	};

	const refreshFlags = async ({ force = false } = {}) => {
		if (isLoading.value) return;
		if (!force && !isStale.value) return;
		const isE2E =
			import.meta.env.VITE_E2E === "true" ||
			import.meta.env.VITE_E2E_MAP_REQUIRED === "true" ||
			import.meta.env.MODE === "e2e";
		if (isE2E) {
			const nextFlags = {
				...DEFAULT_FLAGS,
				...readPersistedFlagsForE2E(),
			};
			const nextMeta = buildDefaultFlagMeta();
			for (const [key, enabled] of Object.entries(nextFlags)) {
				if (!nextMeta[key]) {
					nextMeta[key] = {
						key,
						enabled: Boolean(enabled),
						rollout_percent: 100,
						kill_switch: false,
						config: {},
					};
					continue;
				}
				nextMeta[key] = {
					...nextMeta[key],
					enabled: Boolean(enabled),
					kill_switch: false,
				};
			}
			flagMeta.value = nextMeta;
			flags.value = nextFlags;
			loadedAt.value = Date.now();
			return;
		}

		isLoading.value = true;
		try {
			const result = await supabase
				.from("feature_flags_public")
				.select("*")
				.limit(200);
			if (result.error) throw result.error;

			const nextMeta = buildDefaultFlagMeta();
			for (const row of result.data || []) {
				if (!row?.key) continue;
				const key = String(row.key).trim();
				const current = nextMeta[key] || {
					key,
					enabled: false,
					rollout_percent: 100,
					kill_switch: false,
					config: {},
				};
				const fallbackConfig =
					key === "neon_sign_v2_enabled" ? DEFAULT_FLAG_CONFIG : {};
				nextMeta[key] = {
					...current,
					enabled: Boolean(row.enabled),
					rollout_percent: toRolloutPercent(
						row.rollout_percent,
						current.rollout_percent,
					),
					kill_switch: Boolean(row.kill_switch),
					config: {
						...toSafeObject(fallbackConfig, {}),
						...toSafeObject(row.config, {}),
					},
				};
			}
			const nextFlags = {};
			for (const [key, value] of Object.entries(nextMeta)) {
				nextFlags[key] = Boolean(value.enabled) && !value.kill_switch;
			}
			flagMeta.value = nextMeta;
			flags.value = nextFlags;
			loadedAt.value = Date.now();
		} catch (e) {
			// Fail-open with defaults to protect app startup.
			if (import.meta.env.DEV) {
				const label = isSupabaseSchemaCacheError(e)
					? "⚠️ feature_flags_public unavailable (schema cache retrying; using defaults):"
					: "⚠️ feature_flags_public fetch failed (using defaults):";
				console.warn(label, e?.message || e);
			}
			flagMeta.value = buildDefaultFlagMeta();
			flags.value = Object.fromEntries(
				Object.entries(flagMeta.value).map(([key, value]) => [
					key,
					Boolean(value.enabled) && !value.kill_switch,
				]),
			);
			loadedAt.value = Date.now();
		} finally {
			isLoading.value = false;
		}
	};

	return {
		flags,
		flagMeta,
		isLoading,
		isStale,
		governanceViolations,
		getFlag,
		getFlagConfig,
		isEnabled,
		isEnabledForActor,
		refreshFlags,
	};
});
