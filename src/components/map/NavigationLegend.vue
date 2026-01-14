<script setup>
import { computed } from "vue";
import PoiIcon from "./PoiIcon.vue";

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
</script>

<template>
  <transition name="nav-slide-up">
    <!-- ✅ outer wrapper: ไม่บล็อกการลาก/ซูม map -->
    <div v-if="isVisible" class="absolute left-0 right-0 bottom-0 z-[2500] pointer-events-none">
      <!-- ✅ panel - Solid colors, no glassmorphism -->
      <div
        class="pointer-events-auto mx-2 mb-2 overflow-hidden rounded-3xl shadow-2xl border"
        :class="isDarkMode ? 'bg-zinc-900 border-zinc-700' : 'bg-white border-gray-300'"
      >
        <!-- ✅ handle -->
        <div class="flex justify-center pt-2">
          <div class="h-1 w-10 rounded-full" :class="isDarkMode ? 'bg-white/30' : 'bg-gray-400'" />
        </div>

        <!-- Header -->
        <div class="px-4 pt-2 pb-3 border-b" :class="isDarkMode ? 'border-white/10' : 'border-gray-200'">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-sm">🧭</span>
              <span
                :class="[
                  'text-xs font-bold tracking-widest uppercase',
                  isDarkMode ? 'text-white' : 'text-gray-900'
                ]"
              >
                NAVIGATION
              </span>
            </div>

            <div
              v-if="buildingName"
              :class="[
                'text-xs font-semibold truncate max-w-[55%]',
                isDarkMode ? 'text-gray-300' : 'text-gray-700'
              ]"
            >
              {{ buildingName }}<span v-if="floorName"> • {{ floorName }}</span>
            </div>
          </div>

          <div class="mt-1 text-xs" :class="isDarkMode ? 'text-gray-400' : 'text-gray-600'">
            จุดสำคัญในตึก (POI)
          </div>
        </div>

        <!-- Content -->
        <div class="px-4 pt-3 pb-3">
          <template v-if="visibleGrouped.length">
            <div class="space-y-3">
              <div v-for="g in visibleGrouped" :key="g.groupName">
                <div
                  class="mb-2 text-xs font-bold tracking-widest uppercase"
                  :class="isDarkMode ? 'text-gray-400' : 'text-gray-600'"
                >
                  {{ groupLabel(g.groupName) }}
                </div>

                <div class="grid gap-x-4 gap-y-2 grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">
                  <div v-for="p in g.items" :key="p.id" class="flex items-center gap-2 min-w-0">
                    <span class="w-2.5 h-2.5 rounded-full flex-shrink-0 shadow-sm" :style="{ backgroundColor: p.color }" />
                    <span
                      :class="[
                        'text-sm leading-tight truncate',
                        isDarkMode ? 'text-white' : 'text-gray-800'
                      ]"
                      :title="p.label"
                    >
                      <PoiIcon :type="p.type" :size="14" :color="p.color" class="mr-1.5 flex-shrink-0" />{{ p.label }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="hasMore" class="mt-3 text-[10px]" :class="isDarkMode ? 'text-white/40' : 'text-gray-500'">
              + อีก {{ flattened.length - visibleFlat.length }} รายการ
            </div>
          </template>

          <div
            v-else
            :class="['text-[11px] italic', isDarkMode ? 'text-white/40' : 'text-gray-400']"
          >
            (ยังไม่มี POI ของชั้นนี้)
          </div>
        </div>

        <!-- ✅ safe area -->
        <div class="h-[env(safe-area-inset-bottom)]" />
      </div>
    </div>
  </transition>
</template>

<style scoped>
.nav-slide-up-enter-active {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.25s ease;
}
.nav-slide-up-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.nav-slide-up-enter-from,
.nav-slide-up-leave-to {
  transform: translateY(110%);
  opacity: 0;
}
.nav-slide-up-enter-to,
.nav-slide-up-leave-from {
  transform: translateY(0);
  opacity: 1;
}
</style>
