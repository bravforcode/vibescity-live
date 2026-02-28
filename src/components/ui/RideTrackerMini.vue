<script setup>
import { computed, onMounted, onUnmounted, ref, watch } from "vue";

/**
 * RideTrackerMini
 * A self-contained PiP (Picture-in-Picture) ready ride tracker.
 * This runs natively in the browser's Document PiP window if supported.
 */

const props = defineProps({
  etaMinutes: { type: Number, default: 5 },
  driverName: { type: String, default: "Sompong" },
  driverAvatar: {
    type: String,
    default: "https://api.dicebear.com/7.x/notionists/svg?seed=Sompong",
  },
  licensePlate: { type: String, default: "กท 5555" },
  status: { type: String, default: "arriving" }, // arriving, arrived
});

// Auto ETAs tick down realistically
const currentEta = ref(props.etaMinutes);
let ticker = null;

onMounted(() => {
  // Fake ticking for demo
  ticker = setInterval(() => {
    if (currentEta.value > 1) {
      currentEta.value -= 1;
    } else {
      currentEta.value = "Now";
    }
  }, 60000);
});

onUnmounted(() => {
  if (ticker) clearInterval(ticker);
});

watch(
  () => props.etaMinutes,
  (newVal) => {
    currentEta.value = newVal;
  },
);

const isArrivingSoon = computed(() => {
  if (currentEta.value === "Now") return true;
  return currentEta.value <= 2;
});

// PiP windows don't inherit Tailwind classes easily without injecting <style> tags.
// Using inline/scoped styles guarantees it looks good even in the PiP popup.
</script>

<template>
  <div class="rtm-container" data-testid="ride-tracker-mini">
    <!-- Background Glow -->
    <div
      class="rtm-glow"
      :class="isArrivingSoon ? 'rtm-glow--arriving' : 'rtm-glow--driving'"
    />

    <div class="rtm-content">
      <!-- Driver Avatar -->
      <div class="rtm-avatar-ring">
        <img :src="driverAvatar" :alt="driverName" class="rtm-avatar" />
        <div
          class="rtm-badge"
          :class="isArrivingSoon ? 'bg-amber-500' : 'bg-emerald-500'"
        />
      </div>

      <!-- Info -->
      <div class="rtm-info">
        <h3 class="rtm-name">{{ driverName }}</h3>
        <span class="rtm-plate">{{ licensePlate }}</span>
      </div>

      <!-- ETA Box -->
      <div class="rtm-eta-box" :class="{ 'rtm-pulse': isArrivingSoon }">
        <span class="rtm-eta-val">{{ currentEta }}</span>
        <span class="rtm-eta-unit" v-if="currentEta !== 'Now'">MIN</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Scoped & Portable Styles for Document PiP */
.rtm-container {
  position: relative;
  width: 100%;
  min-width: 280px;
  height: 80px;
  border-radius: 20px;
  background: #18191c;
  overflow: hidden;
  display: flex;
  align-items: center;
  padding: 0 16px;
  font-family:
    system-ui,
    -apple-system,
    sans-serif;
  color: white;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
}

.rtm-glow {
  position: absolute;
  inset: 0;
  opacity: 0.15;
  transition: background-color 1s ease;
  pointer-events: none;
}
.rtm-glow--driving {
  background: radial-gradient(circle at left, #10b981 0%, transparent 70%);
}
.rtm-glow--arriving {
  background: radial-gradient(circle at left, #f59e0b 0%, transparent 70%);
  animation: pulse-bg 2s infinite alternate;
}

@keyframes pulse-bg {
  0% {
    opacity: 0.1;
  }
  100% {
    opacity: 0.25;
  }
}

.rtm-content {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  z-index: 10;
}

.rtm-avatar-ring {
  position: relative;
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: #2a2b30;
  padding: 2px;
}
.rtm-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
  background: #333;
}
.rtm-badge {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #18191c;
}

.bg-amber-500 {
  background: #f59e0b;
}
.bg-emerald-500 {
  background: #10b981;
}

.rtm-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.rtm-name {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.rtm-plate {
  font-size: 12px;
  font-weight: 600;
  color: #9ca3af;
  background: rgba(255, 255, 255, 0.08);
  padding: 2px 6px;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
}

.rtm-eta-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.05);
  min-width: 56px;
  height: 48px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}
.rtm-eta-val {
  font-size: 20px;
  font-weight: 800;
  line-height: 1.1;
  color: #fff;
}
.rtm-eta-unit {
  font-size: 9px;
  font-weight: 700;
  color: #9ca3af;
  letter-spacing: 0.05em;
}

.rtm-pulse {
  background: rgba(245, 158, 11, 0.15);
  border-color: rgba(245, 158, 11, 0.3);
  color: #fcd34d;
}
.rtm-pulse .rtm-eta-val,
.rtm-pulse .rtm-eta-unit {
  color: #fbbf24;
}
</style>
