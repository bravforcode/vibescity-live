<script setup>
/**
 * SwipeCard.vue - Stabilized Version (Enterprise Grade)
 * * ✅ FIX: ลบระบบคำนวณ Touch Event ที่ซับซ้อนออกทั้งหมด
 * ✅ RESULT: แก้ปัญหาการ์ดสั่น, การ์ดเอียง, และการแย่ง Scroll กับ Browser
 * ✅ NOTE: การ Animation ขยาย/หด จะถูกจัดการโดย Class ใน App.vue แทน (ผ่าน CSS)
 */
import { ref } from "vue";

// Props เก็บไว้เหมือนเดิมเพื่อไม่ให้ Error ในไฟล์แม่ แต่ไม่ได้ใช้ Logic ภายในแล้ว
const props = defineProps({
  disabled: {
    type: Boolean,
    default: false,
  },
  threshold: {
    type: Number,
    default: 80,
  },
  showExpand: {
    type: Boolean,
    default: true,
  },
});

// Emits เก็บไว้กัน Error แต่ไม่ได้ใช้ Logic Swipe ภายในแล้ว
const emit = defineEmits(["swipe-left", "swipe-right", "expand"]);
</script>

<template>
  <div class="swipe-card-container">
    <div class="swipe-card-content">
      <slot />

      <!-- Expand Handle Button (Cinematic Pill) -->
      <div
        v-if="showExpand"
        class="absolute bottom-3 left-0 right-0 z-20 flex justify-center pointer-events-none"
      >
        <div
          @click.stop="$emit('expand')"
          class="group/handle cursor-grab active:cursor-grabbing pointer-events-auto py-4 px-6 -mb-4 hover:scale-110 transition-transform duration-300"
        >
          <!-- The Glowing Pill -->
          <div
            class="w-12 h-1.5 rounded-full bg-white/90 shadow-[0_0_8px_rgba(255,255,255,0.6)] backdrop-blur-sm transition-all duration-500 group-hover/handle:w-16 group-hover/handle:bg-white group-hover/handle:shadow-[0_0_15px_rgba(255,255,255,0.8)] animate-pulse-glow"
          ></div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Cinematic Pulse Glow Animation */
@keyframes pulse-glow {
  0%,
  100% {
    opacity: 0.8;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.4);
    transform: scale(1);
  }
  50% {
    opacity: 1;
    box-shadow: 0 0 15px rgba(255, 255, 255, 0.7);
    transform: scale(1.05);
  }
}

.animate-pulse-glow {
  animation: pulse-glow 3s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

.swipe-card-container {
  position: relative;
  /* สำคัญ: ใช้ flex-shrink 0 เพื่อไม่ให้การ์ดบี้ */
  flex-shrink: 0;

  /* สำคัญ: บอก Browser ว่าพื้นที่นี้อนุญาตให้ปัดได้ทุกทิศทาง */
  touch-action: pan-x pan-y;

  /* จัดการการแสดงผลให้เต็มพื้นที่ */
  height: 100%;
  display: flex;
  flex-direction: column;
}

.swipe-card-content {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;

  /* ใช้ will-change เพื่อบอก Browser ให้เตรียม Render แยก Layer
    ช่วยให้ Animation (Scale) ใน App.vue ลื่นขึ้น
  */
  will-change: transform;

  /* ป้องกันการกระพริบใน iOS */
  backface-visibility: hidden;
  transform: translateZ(0);
}
</style>
