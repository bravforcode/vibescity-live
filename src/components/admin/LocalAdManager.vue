<template>
  <div class="local-ad-manager">
    <header class="lam-header">
      <h3>{{ $t("auto.k_12fed442") }}</h3>
      <button class="btn-new" @click="showForm = !showForm" :disabled="saving">
        {{ showForm ? "Cancel" : "+ New Ad" }}
      </button>
    </header>

    <!-- create / edit form -->
    <Transition name="slide-fade">
      <form v-if="showForm" class="ad-form" @submit.prevent="saveAd">
        <div class="form-grid">
          <div class="field">
            <label>{{ $t("auto.k_684f9913") }}</label>
            <label for="ad-title">{{ $t("auto.k_684f9913") }}</label>
            <input
              id="ad-title"
              name="ad-title"
              v-model="form.title"
              required
              :placeholder="$t('auto.k_2ee9bb96')"
            />
          </div>
          <div
            class="h-60 rounded-xl bg-slate-900 border border-slate-700/50 flex flex-col items-center justify-center gap-4 group"
          >
            <input
              id="ad-description"
              name="ad-description"
              v-model="form.description"
              :placeholder="$t('auto.k_55d8312d')"
            />
          </div>
          <div class="field">
            <label for="ad-image-url">{{ $t("auto.k_dbebc57f") }}</label>
            <input
              id="ad-image-url"
              name="ad-image-url"
              v-model="form.image_url"
              type="url"
              placeholder="https://..."
            />
          </div>
          <div class="field">
            <label for="ad-link-url">{{ $t("auto.k_dc2857dc") }}</label>
            <input
              id="ad-link-url"
              name="ad-link-url"
              v-model="form.link_url"
              type="url"
              placeholder="https://..."
            />
          </div>
          <div class="field half">
            <label for="ad-latitude">Latitude</label>
            <input
              id="ad-latitude"
              name="ad-latitude"
              v-model.number="form.lat"
              type="number"
              step="any"
              required
            />
          </div>
          <div class="field half">
            <label for="ad-longitude">Longitude</label>
            <input
              id="ad-longitude"
              name="ad-longitude"
              v-model.number="form.lng"
              type="number"
              step="any"
              required
            />
          </div>
          <div class="field half">
            <label for="ad-radius">{{ $t("auto.k_509d4222") }}</label>
            <input
              id="ad-radius"
              name="ad-radius"
              v-model.number="form.radius_km"
              type="number"
              min="0.1"
              step="0.1"
            />
          </div>
          <div class="field half">
            <label for="ad-status">Status</label>
            <select id="ad-status" name="ad-status" v-model="form.status">
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div class="field half">
            <label for="ad-starts-at">{{ $t("auto.k_f7ccfdd9") }}</label>
            <input
              id="ad-starts-at"
              name="ad-starts-at"
              v-model="form.starts_at"
              type="datetime-local"
            />
          </div>
          <div class="field half">
            <label for="ad-ends-at">{{ $t("auto.k_a6c4363c") }}</label>
            <input
              id="ad-ends-at"
              name="ad-ends-at"
              v-model="form.ends_at"
              type="datetime-local"
            />
          </div>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn-save" :disabled="saving">
            {{ saving ? "Saving…" : editingId ? "Update" : "Create" }}
          </button>
        </div>
        <p v-if="formError" class="form-error">{{ formError }}</p>
      </form>
    </Transition>

    <!-- loading -->
    <div v-if="loading" class="lam-loading">{{ $t("auto.k_4353cba5") }}</div>

    <!-- list -->
    <div v-else-if="ads.length" class="ad-list">
      <div
        v-for="ad in ads"
        :key="ad.id"
        class="ad-card"
        :class="{ paused: ad.status !== 'active' }"
      >
        <div class="ad-card-top">
          <img loading="lazy"
            v-if="ad.image_url"
            :src="ad.image_url"
            class="ad-thumb"
            :alt="ad.title"
          />
          <div class="ad-info">
            <strong>{{ ad.title }}</strong>
            <span class="ad-meta"> {{ $t("auto.k_105403f8") }}{{ ad.radius_km }}{{ $t("auto.k_cdb32198") }} {{ ad.status }}
            </span>
            <span v-if="ad.description" class="ad-card-desc">{{
              ad.description
            }}</span>
          </div>
        </div>
        <div class="ad-card-actions">
          <button class="btn-sm" @click="editAd(ad)" :disabled="saving || isAdPending(ad.id)">Edit</button>
          <button class="btn-sm" @click="toggleStatus(ad)" :disabled="saving || isAdPending(ad.id)">
            {{ ad.status === "active" ? "Pause" : "Activate" }}
          </button>
          <button class="btn-sm btn-danger" @click="deleteAd(ad.id)" :disabled="saving || isAdPending(ad.id)">
            Delete
          </button>
        </div>
      </div>
    </div>

    <p v-else class="lam-empty">{{ $t("auto.k_b7292eb7") }}</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { useNotifications } from "@/composables/useNotifications";
import {
	cloneOptimisticValue,
	runOptimisticMutation,
} from "@/composables/useOptimisticUpdate";
import i18n from "@/i18n.js";
import { localAdService } from "@/services/localAdService";

const ads = ref([]);
const loading = ref(false);
const showForm = ref(false);
const saving = ref(false);
const formError = ref(null);
const editingId = ref(null);
const pendingActionIds = ref(new Set());
const { notify, notifyError, notifySuccess } = useNotifications();

const defaultForm = () => ({
	title: "",
	description: "",
	image_url: "",
	link_url: "",
	lat: 13.7563,
	lng: 100.5018,
	radius_km: 5,
	status: "active",
	starts_at: "",
	ends_at: "",
});

const form = ref(defaultForm());

const setAdPending = (id, isPending) => {
	const next = new Set(pendingActionIds.value);
	if (isPending) next.add(id);
	else next.delete(id);
	pendingActionIds.value = next;
};

const isAdPending = (id) => pendingActionIds.value.has(id);

const resetForm = () => {
	form.value = defaultForm();
	editingId.value = null;
	showForm.value = false;
	formError.value = null;
};

const toFormPayload = () => {
	const payload = { ...form.value };
	if (!payload.starts_at) delete payload.starts_at;
	if (!payload.ends_at) delete payload.ends_at;
	return payload;
};

const buildOptimisticAd = (payload, id) => ({
	id,
	title: payload.title,
	description: payload.description || "",
	image_url: payload.image_url || "",
	link_url: payload.link_url || "",
	radius_km: payload.radius_km || 5,
	status: payload.status || "active",
	starts_at: payload.starts_at || null,
	ends_at: payload.ends_at || null,
	location: `POINT(${payload.lng} ${payload.lat})`,
});

async function loadAds() {
	loading.value = true;
	try {
		ads.value = await localAdService.getAll();
	} catch (e) {
		notifyError(e?.message || "Failed to load ads");
	} finally {
		loading.value = false;
	}
}

async function saveAd() {
	saving.value = true;
	formError.value = null;
	try {
		const payload = toFormPayload();

		if (editingId.value) {
			const currentId = editingId.value;
			const optimisticAd = buildOptimisticAd(payload, currentId);
			await runOptimisticMutation({
				capture: () => cloneOptimisticValue(ads.value),
				applyOptimistic: () => {
					ads.value = ads.value.map((ad) =>
						ad.id === currentId ? { ...ad, ...optimisticAd } : ad,
					);
				},
				rollback: (snapshot) => {
					ads.value = snapshot || [];
				},
				commit: () => localAdService.update(currentId, payload),
				onSuccess: async (savedAd) => {
					if (savedAd) {
						ads.value = ads.value.map((ad) =>
							ad.id === currentId ? { ...ad, ...savedAd } : ad,
						);
					} else {
						await loadAds();
					}
					resetForm();
					notifySuccess("Ad updated.");
				},
				onError: (error) => {
					formError.value = error?.message || "Save failed";
				},
				notify,
				errorMessage: (error) => error?.message || "Save failed",
			});
		} else {
			const tempId = `local-ad-temp-${Date.now()}`;
			const optimisticAd = buildOptimisticAd(payload, tempId);
			await runOptimisticMutation({
				capture: () => cloneOptimisticValue(ads.value),
				applyOptimistic: () => {
					ads.value = [optimisticAd, ...ads.value];
				},
				rollback: (snapshot) => {
					ads.value = snapshot || [];
				},
				commit: () => localAdService.create(payload),
				onSuccess: async (createdAd) => {
					if (createdAd) {
						ads.value = ads.value.map((ad) =>
							ad.id === tempId ? createdAd : ad,
						);
					} else {
						await loadAds();
					}
					resetForm();
					notifySuccess("Ad created.");
				},
				onError: (error) => {
					formError.value = error?.message || "Save failed";
				},
				notify,
				errorMessage: (error) => error?.message || "Save failed",
			});
		}
	} catch (e) {
		formError.value = e.message || "Save failed";
	} finally {
		saving.value = false;
	}
}

function editAd(ad) {
	editingId.value = ad.id;
	// Extract lat/lng from the geography if stored as an object
	let lat = 13.7563;
	let lng = 100.5018;
	if (ad.location) {
		// Handle WKT point format "POINT(lng lat)" or ST_AsText output
		const m = String(ad.location).match(/POINT\(([^ ]+) ([^ ]+)\)/i);
		if (m) {
			lng = parseFloat(m[1]);
			lat = parseFloat(m[2]);
		}
	}
	form.value = {
		title: ad.title || "",
		description: ad.description || "",
		image_url: ad.image_url || "",
		link_url: ad.link_url || "",
		lat,
		lng,
		radius_km: ad.radius_km || 5,
		status: ad.status || "active",
		starts_at: ad.starts_at ? ad.starts_at.slice(0, 16) : "",
		ends_at: ad.ends_at ? ad.ends_at.slice(0, 16) : "",
	};
	showForm.value = true;
}

async function toggleStatus(ad) {
	if (isAdPending(ad.id)) return;

	const nextStatus = ad.status === "active" ? "paused" : "active";
	setAdPending(ad.id, true);
	try {
		await runOptimisticMutation({
			capture: () => cloneOptimisticValue(ads.value),
			applyOptimistic: () => {
				ads.value = ads.value.map((item) =>
					item.id === ad.id ? { ...item, status: nextStatus } : item,
				);
			},
			rollback: (snapshot) => {
				ads.value = snapshot || [];
			},
			commit: () => localAdService.toggleStatus(ad.id, ad.status),
			onSuccess: async (savedAd) => {
				if (savedAd) {
					ads.value = ads.value.map((item) =>
						item.id === ad.id ? { ...item, ...savedAd } : item,
					);
				} else {
					await loadAds();
				}
				notifySuccess(nextStatus === "active" ? "Ad activated." : "Ad paused.");
			},
			notify,
			errorMessage: (error) => error?.message || "Failed to update ad status",
		});
	} finally {
		setAdPending(ad.id, false);
	}
}

async function deleteAd(id) {
	if (!confirm(i18n.global.t("auto.k_d6607f1b"))) return;
	if (isAdPending(id)) return;

	setAdPending(id, true);
	try {
		await runOptimisticMutation({
			capture: () => cloneOptimisticValue(ads.value),
			applyOptimistic: () => {
				ads.value = ads.value.filter((ad) => ad.id !== id);
			},
			rollback: (snapshot) => {
				ads.value = snapshot || [];
			},
			commit: () => localAdService.remove(id),
			onSuccess: () => {
				if (editingId.value === id) resetForm();
				notifySuccess("Ad deleted.");
			},
			notify,
			errorMessage: (error) => error?.message || "Failed to delete ad",
		});
	} finally {
		setAdPending(id, false);
	}
}

onMounted(loadAds);
</script>

<style scoped>
.local-ad-manager {
  padding: 0;
}

.lam-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.lam-header h3 {
  margin: 0;
  font-size: 18px;
}

.btn-new {
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: linear-gradient(135deg, #6366f1, #0ea5e9);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-new:hover {
  opacity: 0.85;
}
.btn-new:disabled,
.btn-sm:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* form */
.ad-form {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 20px;
}
.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.field {
  grid-column: span 2;
}
.field.half {
  grid-column: span 1;
}
.field label {
  display: block;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
}
.field input,
.field select {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
  font-size: 14px;
}
.field input::placeholder {
  color: rgba(255, 255, 255, 0.3);
}

.form-actions {
  margin-top: 14px;
  text-align: right;
}
.btn-save {
  padding: 8px 24px;
  border: none;
  border-radius: 8px;
  background: #22c55e;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}
.btn-save:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.form-error {
  color: #f87171;
  margin-top: 8px;
  font-size: 13px;
}

/* list */
.ad-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ad-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  transition: opacity 0.2s;
}
.ad-card.paused {
  opacity: 0.55;
}
.ad-card-top {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.ad-thumb {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}
.ad-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.ad-info strong {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ad-meta {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}
.ad-card-desc {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ad-card-actions {
  display: flex;
  gap: 6px;
}
.btn-sm {
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 6px;
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-sm:hover {
  background: rgba(255, 255, 255, 0.08);
}
.btn-sm:disabled:hover {
  background: transparent;
}
.btn-danger {
  border-color: rgba(248, 113, 113, 0.3);
  color: #f87171;
}
.btn-danger:hover {
  background: rgba(248, 113, 113, 0.12);
}

.lam-loading,
.lam-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  padding: 24px 0;
  font-size: 14px;
}

/* transitions */
.slide-fade-enter-active,
.slide-fade-leave-active {
  transition:
    opacity,
    transform,
    background-color,
    border-color,
    color,
    fill,
    stroke,
    box-shadow 0.25s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
