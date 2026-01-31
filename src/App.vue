<template>
  <router-view />
</template>

<style>
/* Restore Global Scrollbar from Original App.vue */
::-webkit-scrollbar {
  width: 8px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background-color: rgba(255, 255, 255, 0.2);
  border-radius: 4px;
}

/* ✅ UI Transitions */
.ui-slide-down-enter-active,
.ui-slide-down-leave-active,
.ui-slide-up-enter-active,
.ui-slide-up-leave-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1); /* iOS Ease */
}

.ui-slide-down-enter-from,
.ui-slide-down-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.ui-slide-up-enter-from,
.ui-slide-up-leave-to {
  transform: translateY(100%);
  opacity: 0;
}
</style>
