<template>
	<section
		class="mb-6 rounded-2xl border border-cyan-400/20 bg-black/30 p-4 backdrop-blur-md"
		data-testid="promotion-branding-panel"
	>
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div>
				<p class="text-[11px] font-black uppercase tracking-[0.25em] text-cyan-200/70">
					{{ t("promotion_setup_eyebrow") }}
				</p>
				<h3 class="mt-1 text-lg font-black text-white">{{ t("promotion_setup_title") }}</h3>
				<p class="mt-1 text-sm text-white/60">
					{{ t("promotion_setup_subtitle") }}
				</p>
			</div>
			<button
				type="button"
				class="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-white/80 transition hover:bg-white/10"
				@click="reloadStatus"
				:disabled="loading || saving"
			>
				{{ loading ? t("promotion_refreshing") : t("promotion_refresh") }}
			</button>
		</div>

		<div v-if="status" class="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_1fr]">
			<div class="space-y-4">
				<div class="grid grid-cols-1 gap-3 md:grid-cols-2">
					<div class="rounded-xl border border-white/10 bg-white/5 p-3">
						<p class="text-[11px] font-bold uppercase tracking-wide text-white/55">
							{{ t("promotion_logo_label") }}
						</p>
						<div class="mt-3 flex items-center gap-3">
							<img loading="lazy"
								v-if="status.branding?.logo_url"
								:src="status.branding.logo_url"
								:alt="t('promotion_logo_alt')"
								class="h-16 w-16 rounded-xl border border-white/10 bg-black/30 object-cover"
							/>
							<div
								v-else
								class="flex h-16 w-16 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 text-[10px] font-bold uppercase text-white/45"
							>
								{{ t("promotion_missing") }}
							</div>
							<div class="flex-1">
								<button
									type="button"
									class="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-slate-950 transition hover:bg-cyan-400"
									@click="triggerFilePicker('logo')"
									:disabled="saving"
								>
									{{
										status.branding?.logo_url
											? t("promotion_replace_logo")
											: t("promotion_upload_logo")
									}}
								</button>
								<p class="mt-2 text-[11px] text-white/45">{{ t("promotion_logo_help") }}</p>
							</div>
						</div>
					</div>

					<div class="rounded-xl border border-white/10 bg-white/5 p-3">
						<p class="text-[11px] font-bold uppercase tracking-wide text-white/55">
							{{ t("promotion_cover_label") }}
						</p>
						<div class="mt-3 flex items-center gap-3">
							<img loading="lazy"
								v-if="status.branding?.cover_url"
								:src="status.branding.cover_url"
								:alt="t('promotion_cover_alt')"
								class="h-16 w-24 rounded-xl border border-white/10 bg-black/30 object-cover"
							/>
							<div
								v-else
								class="flex h-16 w-24 items-center justify-center rounded-xl border border-dashed border-white/15 bg-black/20 text-[10px] font-bold uppercase text-white/45"
							>
								{{ t("promotion_missing") }}
							</div>
							<div class="flex-1">
								<button
									type="button"
									class="rounded-xl bg-cyan-500 px-3 py-2 text-xs font-black text-white transition hover:bg-cyan-400"
									@click="triggerFilePicker('cover')"
									:disabled="saving"
								>
									{{
										status.branding?.cover_url
											? t("promotion_replace_cover")
											: t("promotion_upload_cover")
									}}
								</button>
								<p class="mt-2 text-[11px] text-white/45">{{ t("promotion_cover_help") }}</p>
							</div>
						</div>
					</div>
				</div>

				<div class="rounded-xl border border-white/10 bg-white/5 p-3">
					<div class="flex items-center justify-between gap-2">
						<p class="text-[11px] font-bold uppercase tracking-wide text-white/55">
							{{ t("promotion_entitlements") }}
						</p>
						<span
							class="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-bold uppercase text-white/60"
						>
							{{ status.sign?.status || "ready" }}
						</span>
					</div>
					<div class="mt-3 grid grid-cols-2 gap-2 text-xs text-white/80 md:grid-cols-4">
						<div
							v-for="item in entitlementItems"
							:key="item.key"
							class="rounded-xl border px-3 py-2"
							:class="
								item.active
									? 'border-emerald-400/35 bg-emerald-500/15 text-emerald-200'
									: 'border-white/10 bg-black/20 text-white/55'
							"
						>
							{{ item.label }}
						</div>
					</div>
				</div>
			</div>

			<form class="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3" @submit.prevent="saveConfig">
				<p class="text-[11px] font-bold uppercase tracking-wide text-white/55">
					{{ t("promotion_map_placement") }}
				</p>
				<div class="grid grid-cols-2 gap-3">
					<label class="space-y-1">
						<span class="text-[11px] text-white/60">{{ t("promotion_latitude") }}</span>
						<input :aria-label="$t('a11y.input_field')"
							v-model.number="slotForm.lat"
							type="number"
							step="0.000001"
							class="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:border-cyan-400"
						/>
					</label>
					<label class="space-y-1">
						<span class="text-[11px] text-white/60">{{ t("promotion_longitude") }}</span>
						<input :aria-label="$t('a11y.input_field')"
							v-model.number="slotForm.lng"
							type="number"
							step="0.000001"
							class="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:border-cyan-400"
						/>
					</label>
				</div>
				<div class="grid grid-cols-2 gap-3">
					<label class="space-y-1">
						<span class="text-[11px] text-white/60">{{ t("promotion_placement") }}</span>
						<select
							v-model="slotForm.placement"
							class="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:border-cyan-400"
						>
							<option value="center">{{ t("promotion_placement_center") }}</option>
							<option value="top">{{ t("promotion_placement_top") }}</option>
							<option value="bottom">{{ t("promotion_placement_bottom") }}</option>
							<option value="left">{{ t("promotion_placement_left") }}</option>
							<option value="right">{{ t("promotion_placement_right") }}</option>
						</select>
					</label>
					<label class="space-y-1">
						<span class="text-[11px] text-white/60">{{ t("promotion_sign_mode") }}</span>
						<select
							v-model="signForm.mode"
							class="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:border-cyan-400"
						>
							<option value="metadata">{{ t("promotion_metadata_mode") }}</option>
							<option value="rendered">{{ t("promotion_rendered_mode") }}</option>
						</select>
					</label>
				</div>
				<label class="space-y-1">
					<span class="text-[11px] text-white/60">{{ t("promotion_template") }}</span>
					<input :aria-label="$t('a11y.input_field')"
						v-model.trim="signForm.template"
						type="text"
						class="w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/50 focus:border-cyan-400"
					/>
				</label>
				<p
					v-if="status?.warnings?.length"
					class="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100"
				>
					{{ t("promotion_warnings") }}: {{ status.warnings.join(", ") }}
				</p>
				<button
					type="submit"
					class="w-full rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 px-3 py-2 text-sm font-black text-slate-950 transition hover:from-cyan-400 hover:to-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
					:disabled="saving"
				>
					{{ saving ? t("promotion_saving") : t("promotion_save_config") }}
				</button>
			</form>
		</div>

		<input :aria-label="$t('a11y.input_field')"
			ref="logoInput"
			type="file"
			accept="image/png,image/jpeg,image/webp,image/svg+xml"
			class="hidden"
			@change="handleAssetSelected('logo', $event)"
		/>
		<input :aria-label="$t('a11y.input_field')"
			ref="coverInput"
			type="file"
			accept="image/png,image/jpeg,image/webp"
			class="hidden"
			@change="handleAssetSelected('cover', $event)"
		/>
	</section>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from "vue";
import { useI18n } from "vue-i18n";
import { useNotifications } from "@/composables/useNotifications";
import { supabase } from "@/lib/supabase";
import { ownerService } from "@/services/ownerService";

const props = defineProps({
	shopId: {
		type: [String, Number],
		required: true,
	},
});

const emit = defineEmits(["status-change"]);

const { t } = useI18n();
const { notifyError, notifySuccess } = useNotifications();
const loading = ref(false);
const saving = ref(false);
const status = ref(null);
const logoInput = ref(null);
const coverInput = ref(null);

const slotForm = reactive({
	lat: null,
	lng: null,
	placement: "center",
});

const signForm = reactive({
	mode: "metadata",
	template: "default-neon-v1",
});

const entitlementItems = computed(() => {
	const entitlements = status.value?.current_entitlements || {};
	return [
		{
			key: "verified",
			label: t("promotion_entitlement_verified"),
			active: Boolean(entitlements.verified),
		},
		{
			key: "glow",
			label: t("promotion_entitlement_glow"),
			active: Boolean(entitlements.glow),
		},
		{
			key: "boost",
			label: t("promotion_entitlement_boost"),
			active: Boolean(entitlements.boost),
		},
		{
			key: "giant",
			label: t("promotion_entitlement_giant"),
			active: Boolean(entitlements.giant),
		},
	];
});

const syncForms = (payload) => {
	status.value = payload || null;
	slotForm.lat =
		payload?.slot?.lat !== null && payload?.slot?.lat !== undefined
			? Number(payload.slot.lat)
			: null;
	slotForm.lng =
		payload?.slot?.lng !== null && payload?.slot?.lng !== undefined
			? Number(payload.slot.lng)
			: null;
	slotForm.placement = String(payload?.slot?.placement || "center");
	signForm.mode = String(payload?.sign?.mode || "metadata");
	signForm.template = String(payload?.sign?.template || "default-neon-v1");
	emit("status-change", payload || null);
};

const reloadStatus = async () => {
	loading.value = true;
	try {
		const payload = await ownerService.getPromotionStatus(props.shopId);
		syncForms(payload);
	} catch (error) {
		notifyError(error?.message || t("promotion_status_error"));
	} finally {
		loading.value = false;
	}
};

const triggerFilePicker = (assetType) => {
	if (assetType === "logo") {
		logoInput.value?.click();
		return;
	}
	coverInput.value?.click();
};

const uploadBrandingFile = async (assetType, file) => {
	const init = await ownerService.initBrandingUpload(props.shopId, {
		asset_type: assetType,
		mime_type: file.type,
		size_bytes: file.size,
	});
	const bucket = init?.bucket || "shop-branding";
	const storagePath = init?.storage_path;
	if (!storagePath) throw new Error(t("promotion_upload_missing_path"));

	const { error } = await supabase.storage
		.from(bucket)
		.upload(storagePath, file, { upsert: true, contentType: file.type });
	if (error) throw error;

	const payload = await ownerService.commitBrandingUpload(props.shopId, {
		asset_type: assetType,
		storage_path: storagePath,
		public_url: init?.public_url,
		width: null,
		height: null,
		checksum: `${file.name}:${file.size}:${file.lastModified}`,
	});
	syncForms(payload);
	notifySuccess(
		assetType === "logo"
			? t("promotion_logo_saved")
			: t("promotion_cover_saved"),
	);
};

const handleAssetSelected = async (assetType, event) => {
	const input = event?.target;
	const file = input?.files?.[0];
	if (!file) return;
	saving.value = true;
	try {
		await uploadBrandingFile(assetType, file);
	} catch (error) {
		notifyError(error?.message || t("promotion_upload_error"));
	} finally {
		saving.value = false;
		if (input) input.value = "";
	}
};

const saveConfig = async () => {
	saving.value = true;
	try {
		const payload = await ownerService.updatePromotionConfig(props.shopId, {
			slot: {
				lat: slotForm.lat,
				lng: slotForm.lng,
				placement: slotForm.placement,
			},
			sign: {
				mode: signForm.mode,
				template: signForm.template,
			},
		});
		syncForms(payload);
		notifySuccess(t("promotion_config_saved"));
	} catch (error) {
		notifyError(error?.message || t("promotion_config_error"));
	} finally {
		saving.value = false;
	}
};

onMounted(() => {
	void reloadStatus();
});
</script>
