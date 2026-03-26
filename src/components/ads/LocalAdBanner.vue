<template>
  <Transition name="ad-slide">
    <div v-if="ad" class="local-ad-banner" @click="handleClick">
      <!-- dismiss -->
      <button
        class="ad-dismiss"
        @click.stop="$emit('dismiss', ad.id)"
        aria-label="Dismiss ad"
      >
        ✕
      </button>

      <!-- image -->
      <div v-if="ad.image_url" class="ad-image">
        <img :src="ad.image_url" :alt="ad.title" loading="lazy" />
      </div>

      <!-- body -->
      <div class="ad-body">
        <span class="ad-badge">📍 Nearby</span>
        <h4 class="ad-title">{{ ad.title }}</h4>
        <p v-if="ad.description" class="ad-desc">{{ ad.description }}</p>
        <span v-if="ad.distance_km != null" class="ad-distance">
          {{ ad.distance_km }} km away
        </span>
      </div>
    </div>
  </Transition>
</template>

<script setup>
const props = defineProps({
	ad: { type: Object, default: null },
});

defineEmits(["dismiss"]);

function handleClick() {
	const targetUrl =
		typeof props.ad?.link_url === "string" ? props.ad.link_url.trim() : "";
	if (targetUrl) {
		window.open(targetUrl, "_blank", "noopener,noreferrer");
	}
}
</script>

<style scoped>
.local-ad-banner {
  position: absolute;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  left: 1rem;
  transform: none;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 380px;
  width: min(380px, calc(100% - 2rem));
  padding: 12px 14px;
  border-radius: 16px;
  background: rgba(20, 20, 30, 0.75);
  backdrop-filter: blur(18px) saturate(1.3);
  -webkit-backdrop-filter: blur(18px) saturate(1.3);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
  cursor: pointer;
  color: #fff;
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.local-ad-banner:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.45);
}

.ad-dismiss {
  position: absolute;
  top: 6px;
  right: 8px;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
  cursor: pointer;
  padding: 4px 6px;
  border-radius: 50%;
  transition:
    color 0.15s,
    background 0.15s;
}
.ad-dismiss:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.12);
}

.ad-image {
  flex-shrink: 0;
  width: 56px;
  height: 56px;
  border-radius: 12px;
  overflow: hidden;
}
.ad-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ad-body {
  flex: 1;
  min-width: 0;
}

.ad-badge {
  font-size: 11px;
  background: rgba(99, 102, 241, 0.4);
  padding: 2px 8px;
  border-radius: 100px;
  font-weight: 600;
  letter-spacing: 0.02em;
}

.ad-title {
  margin: 4px 0 2px;
  font-size: 14px;
  font-weight: 700;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ad-desc {
  margin: 0;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ad-distance {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 2px;
}

/* transitions */
.ad-slide-enter-active,
.ad-slide-leave-active {
  transition:
    opacity 0.35s cubic-bezier(0.4, 0, 0.2, 1),
    transform 0.35s cubic-bezier(0.4, 0, 0.2, 1);
}
.ad-slide-enter-from,
.ad-slide-leave-to {
  opacity: 0;
  transform: translateY(24px);
}

@media (max-width: 768px) {
  .local-ad-banner {
    left: 0.75rem;
    right: 0.75rem;
    width: auto;
    max-width: none;
    bottom: calc(5.5rem + env(safe-area-inset-bottom));
  }
}
</style>
