<template>
  <div class="local-ad-manager">
    <header class="lam-header">
      <h3>📍 Local Ads</h3>
      <button class="btn-new" @click="showForm = !showForm">
        {{ showForm ? "Cancel" : "+ New Ad" }}
      </button>
    </header>

    <!-- create / edit form -->
    <Transition name="slide-fade">
      <form v-if="showForm" class="ad-form" @submit.prevent="saveAd">
        <div class="form-grid">
          <div class="field">
            <label>Title *</label>
            <input
              v-model="form.title"
              required
              placeholder="e.g. 50% off Coffee"
            />
          </div>
          <div class="field">
            <label>Description</label>
            <input v-model="form.description" placeholder="Short promo text" />
          </div>
          <div class="field">
            <label>Image URL</label>
            <input
              v-model="form.image_url"
              type="url"
              placeholder="https://..."
            />
          </div>
          <div class="field">
            <label>Link URL</label>
            <input
              v-model="form.link_url"
              type="url"
              placeholder="https://..."
            />
          </div>
          <div class="field half">
            <label>Latitude</label>
            <input
              v-model.number="form.lat"
              type="number"
              step="any"
              required
            />
          </div>
          <div class="field half">
            <label>Longitude</label>
            <input
              v-model.number="form.lng"
              type="number"
              step="any"
              required
            />
          </div>
          <div class="field half">
            <label>Radius (km)</label>
            <input
              v-model.number="form.radius_km"
              type="number"
              min="0.1"
              step="0.1"
            />
          </div>
          <div class="field half">
            <label>Status</label>
            <select v-model="form.status">
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <div class="field half">
            <label>Starts at</label>
            <input v-model="form.starts_at" type="datetime-local" />
          </div>
          <div class="field half">
            <label>Ends at</label>
            <input v-model="form.ends_at" type="datetime-local" />
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
    <div v-if="loading" class="lam-loading">Loading ads…</div>

    <!-- list -->
    <div v-else-if="ads.length" class="ad-list">
      <div
        v-for="ad in ads"
        :key="ad.id"
        class="ad-card"
        :class="{ paused: ad.status !== 'active' }"
      >
        <div class="ad-card-top">
          <img
            v-if="ad.image_url"
            :src="ad.image_url"
            class="ad-thumb"
            :alt="ad.title"
          />
          <div class="ad-info">
            <strong>{{ ad.title }}</strong>
            <span class="ad-meta">
              r={{ ad.radius_km }}km · {{ ad.status }}
            </span>
            <span v-if="ad.description" class="ad-card-desc">{{
              ad.description
            }}</span>
          </div>
        </div>
        <div class="ad-card-actions">
          <button class="btn-sm" @click="editAd(ad)">Edit</button>
          <button class="btn-sm" @click="toggleStatus(ad)">
            {{ ad.status === "active" ? "Pause" : "Activate" }}
          </button>
          <button class="btn-sm btn-danger" @click="deleteAd(ad.id)">
            Delete
          </button>
        </div>
      </div>
    </div>

    <p v-else class="lam-empty">No ads yet. Click "+ New Ad" to create one.</p>
  </div>
</template>

<script setup>
import { onMounted, ref } from "vue";
import { localAdService } from "@/services/localAdService";

const ads = ref([]);
const loading = ref(false);
const showForm = ref(false);
const saving = ref(false);
const formError = ref(null);
const editingId = ref(null);

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

async function loadAds() {
	loading.value = true;
	try {
		ads.value = await localAdService.getAll();
	} catch (e) {
		console.error("[LocalAdManager] load failed", e);
	} finally {
		loading.value = false;
	}
}

async function saveAd() {
	saving.value = true;
	formError.value = null;
	try {
		const payload = { ...form.value };
		// clean empty date strings
		if (!payload.starts_at) delete payload.starts_at;
		if (!payload.ends_at) delete payload.ends_at;

		if (editingId.value) {
			await localAdService.update(editingId.value, payload);
		} else {
			await localAdService.create(payload);
		}
		form.value = defaultForm();
		editingId.value = null;
		showForm.value = false;
		await loadAds();
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
	try {
		await localAdService.toggleStatus(ad.id, ad.status);
		await loadAds();
	} catch (e) {
		console.error("[LocalAdManager] toggle failed", e);
	}
}

async function deleteAd(id) {
	if (!confirm("Delete this ad permanently?")) return;
	try {
		await localAdService.remove(id);
		await loadAds();
	} catch (e) {
		console.error("[LocalAdManager] delete failed", e);
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
  background: linear-gradient(135deg, #6366f1, #8b5cf6);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-new:hover {
  opacity: 0.85;
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
  transition: all 0.25s ease;
}
.slide-fade-enter-from,
.slide-fade-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
