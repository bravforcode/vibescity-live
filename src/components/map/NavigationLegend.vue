<script setup>
import { computed, ref, onMounted, onUnmounted, watch } from "vue";
import PoiIcon from "./PoiIcon.vue";

const emit = defineEmits(['height-change']);

// ✅ Collapse state for right-side panel
const isCollapsed = ref(false);

const props = defineProps({
  isDarkMode: { type: Boolean, default: true },
  isVisible: { type: Boolean, default: true },

  buildingName: { type: String, default: "" },
  floorName: { type: String, default: "" },

  poiLegendMeta: { type: Object, default: () => ({}) },
  poiItems: { type: Array, default: () => [] },
});

/**
 * ✅ Step 1: เอา “ชนิดไม่ซ้ำ” จาก poiItems
 */
const uniqueTypes = computed(() => {
  const items = Array.isArray(props.poiItems) ? props.poiItems : [];
  const out = [];
  const used = new Set();
  for (const p of items) {
    const t = p?.type || "other";
    if (used.has(t)) continue;
    used.add(t);
    out.push(t);
  }
  return out;
});

/**
 * ✅ Step 2: สร้าง legend entries (ใช้ meta เป็นหลัก)
 * - ถ้า meta ไม่มี group/order/sort ก็ยังทำงานได้
 */
const legendEntries = computed(() => {
  const meta = props.poiLegendMeta || {};
  const types = uniqueTypes.value;

  // ถ้ามี poiItems ให้โชว์เฉพาะ types ที่มีอยู่จริงในชั้นนั้น
  if (types.length) {
    return types.map((t) => {
      const m = meta?.[t] || {};
      return {
        id: t,
        type: t,
        label: m.label || t,
        color: m.color || "#94A3B8",
        icon: m.icon || "📍",
        group: m.group || "Other",
        order: Number.isFinite(m.order) ? m.order : 99,
        sort: Number.isFinite(m.sort) ? m.sort : 999,
      };
    });
  }

  // fallback: ไม่มี poiItems -> เอาทุก meta มาโชว์
  return Object.keys(meta).map((t) => {
    const m = meta[t] || {};
    return {
      id: t,
      type: t,
      label: m.label || t,
      color: m.color || "#94A3B8",
      icon: m.icon || "📍",
      group: m.group || "Other",
      order: Number.isFinite(m.order) ? m.order : 99,
      sort: Number.isFinite(m.sort) ? m.sort : 999,
    };
  });
});

/**
 * ✅ Step 3: Grouping + sorting
 */
const groupedLegend = computed(() => {
  const groups = new Map();

  for (const e of legendEntries.value) {
    const key = e.group || "Other";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(e);
  }

  // sort items within group
  const groupedArr = Array.from(groups.entries()).map(([groupName, items]) => {
    items.sort((a, b) => (a.sort - b.sort) || String(a.label).localeCompare(String(b.label)));
    const order = items.reduce((min, it) => Math.min(min, it.order ?? 99), 99);
    return { groupName, order, items };
  });

  // sort groups
  groupedArr.sort((a, b) => (a.order - b.order) || String(a.groupName).localeCompare(String(b.groupName)));
  return groupedArr;
});

/**
 * ✅ ไม่รก: จำกัดจำนวนรายการที่โชว์รวมทั้งหมด (ปรับได้)
 */
const MAX_TOTAL = 18;
const flattened = computed(() => groupedLegend.value.flatMap(g => g.items.map(i => ({...i, groupName: g.groupName, order: g.order }))));
const visibleFlat = computed(() => flattened.value.slice(0, MAX_TOTAL));
const hasMore = computed(() => flattened.value.length > visibleFlat.value.length);

/**
 * ✅ สร้าง grouped แบบ “หลังจำกัด MAX_TOTAL”
 */
const visibleGrouped = computed(() => {
  const map = new Map();
  for (const e of visibleFlat.value) {
    const key = e.groupName || "Other";
    if (!map.has(key)) map.set(key, { groupName: key, order: e.order ?? 99, items: [] });
    map.get(key).items.push(e);
  }
  const arr = Array.from(map.values());
  arr.sort((a,b) => (a.order - b.order) || String(a.groupName).localeCompare(String(b.groupName)));
  return arr;
});

const groupLabel = (g) => {
  // ถ้าคุณอยากเปลี่ยนเป็นไทย แก้ตรงนี้ได้เลย
  const dict = {
    Access: "การเดินทาง",
    Facilities: "สิ่งอำนวยความสะดวก",
    Services: "บริการ",
    Food: "อาหาร",
    Parking: "ที่จอดรถ",
    Other: "อื่นๆ",
  };
  return dict[g] || g;
};

// ✅ Track panel height and emit to parent (MapContainer)
const panelRef = ref(null);
const resizeObserver = ref(null);

const updateHeight = () => {
  if (panelRef.value) {
    const height = panelRef.value.offsetHeight;
    emit('height-change', height);
  }
};

onMounted(() => {
  if (panelRef.value) {
    resizeObserver.value = new ResizeObserver(updateHeight);
    resizeObserver.value.observe(panelRef.value);
    updateHeight(); // Initial emission
  }
});

onUnmounted(() => {
  if (resizeObserver.value) {
    resizeObserver.value.disconnect();
  }
});

// Watch for visibility changes
watch(() => props.isVisible, (newVal) => {
  if (newVal) {
    // When becoming visible, measure after DOM update
    setTimeout(updateHeight, 100);
  }
});

// ✅ Watch for POI items changes (when floor changes, items change)
watch(() => props.poiItems, () => {
  // Wait for DOM to update with new items, then measure height
  setTimeout(updateHeight, 150);
}, { deep: true });

// ✅ Watch for floor name changes
watch(() => props.floorName, () => {
  setTimeout(updateHeight, 150);
});

// ✅ Watch for building name changes (when switching buildings)
watch(() => props.buildingName, () => {
  setTimeout(updateHeight, 150);
});
</script>

<template>
  <transition name="nav-slide-right">
    <!-- ✅ Right-side morphing panel -->
    <div 
      v-if="isVisible" 
      class="fixed right-0 top-1/2 -translate-y-1/2 z-[2500] shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] overflow-hidden border"
      :class="[
        isCollapsed ? 'w-9 h-24 rounded-l-xl cursor-pointer hover:w-10' : 'w-[160px] max-h-[60vh] rounded-l-2xl',
        isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-200'
      ]"
      @click="isCollapsed ? (isCollapsed = false) : null"
    >
      <!-- ✅ Content Wrapper for Fade -->
      <transition name="fade" mode="out-in">
        
        <!-- STATE 1: COLLAPSED BUTTON -->
        <div 
          v-if="isCollapsed" 
          key="collapsed"
          class="w-full h-full flex flex-col items-center justify-center gap-1"
          :class="isDarkMode ? 'text-white' : 'text-gray-700'"
        >
          <span class="text-sm">🧭</span>
          <svg class="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
          </svg>
        </div>

        <!-- STATE 2: EXPANDED PANEL -->
        <div 
          v-else 
          key="expanded"
          class="w-full h-full flex flex-col"
        >
          <!-- Header -->
          <div class="px-3 py-2 border-b flex items-center justify-between shrink-0" :class="isDarkMode ? 'border-white/10' : 'border-gray-200'">
            <div class="flex items-center gap-2">
              <span class="text-xs">🧭</span>
              <span :class="['text-[9px] font-bold tracking-widest uppercase', isDarkMode ? 'text-white' : 'text-gray-900']">
                NAV
              </span>
            </div>
            <button 
              @click.stop="isCollapsed = true"
              class="w-5 h-5 flex items-center justify-center rounded-full transition-all hover:bg-black/5"
              :class="isDarkMode ? 'text-white/60 hover:bg-white/10' : 'text-gray-500'"
            >
              <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <!-- Scrollable Content -->
          <div class="overflow-y-auto flex-1 custom-scrollbar">
            <!-- Building Info -->
            <div v-if="buildingName" class="px-3 py-2 border-b" :class="isDarkMode ? 'border-white/10' : 'border-gray-200'">
              <div :class="['text-xs font-semibold truncate', isDarkMode ? 'text-white' : 'text-gray-900']">{{ buildingName }}</div>
              <div v-if="floorName" :class="['text-[10px]', isDarkMode ? 'text-gray-400' : 'text-gray-500']">{{ floorName }}</div>
            </div>

            <!-- List -->
            <div class="px-3 py-2 space-y-3">
              <template v-if="visibleGrouped.length">
                <div v-for="g in visibleGrouped" :key="g.groupName">
                  <div class="mb-1 text-[9px] font-bold tracking-widest uppercase opacity-70" :class="isDarkMode ? 'text-gray-400' : 'text-gray-500'">
                    {{ groupLabel(g.groupName) }}
                  </div>
                  <div class="space-y-1.5">
                    <div v-for="p in g.items" :key="p.id" class="flex items-center gap-2">
                      <span class="w-2 h-2 rounded-full shrink-0" :style="{ backgroundColor: p.color }" />
                      <span :class="['text-[10px] truncate', isDarkMode ? 'text-white/90' : 'text-gray-700']" :title="p.label">
                        {{ p.label }}
                      </span>
                    </div>
                  </div>
                </div>
                <!-- More count -->
                <div v-if="hasMore" class="pt-1 text-[9px] opacity-50" :class="isDarkMode ? 'text-white' : 'text-black'">
                  + {{ flattened.length - visibleFlat.length }} more
                </div>
              </template>
              <div v-else class="text-[10px] italic opacity-50 text-center py-2">
                (No POIs)
              </div>
            </div>
          </div>
        </div>
      </transition>
    </div>
  </transition>
</template>

<style scoped>
.nav-slide-right-enter-active,
.nav-slide-right-leave-active {
  transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s;
}
.nav-slide-right-enter-from,
.nav-slide-right-leave-to {
  transform: translateX(120%);
  opacity: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
