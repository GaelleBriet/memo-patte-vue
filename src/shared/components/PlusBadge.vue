<script setup lang="ts">
withDefaults(defineProps<{ on?: 'surface' | 'primary' }>(), { on: 'surface' })
</script>

<template>
  <span class="plus-badge" :class="`plus-badge--on-${on}`" aria-hidden="true">
    <v-icon icon="ms:workspace_premium_fill" size="11" />
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.plus-badge {
  position: absolute;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-sizing: content-box;
  width: 16px;
  height: 16px;
  border: 2px solid;
  border-radius: 50%;
  background: tokens.$color-plus-badge-surface;
  color: rgb(var(--v-theme-primary));
  pointer-events: none;
}

.plus-badge--on-surface {
  border-color: rgb(var(--v-theme-surface));
}

.plus-badge--on-primary {
  border-color: rgb(var(--v-theme-primary));
}
</style>
