<!-- src/components/system/PortalLayer.vue --> 

<script setup>
defineOptions({ inheritAttrs: false });
</script>

<template>
  <Teleport to="body">
    <slot />
  </Teleport>
</template>
