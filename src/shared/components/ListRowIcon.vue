<script setup lang="ts">
withDefaults(defineProps<{ icon: string; muted?: boolean }>(), { muted: false })
</script>

<template>
  <span class="list-row-icon" :class="{ 'list-row-icon--muted': muted }" aria-hidden="true">
    <v-icon :icon="icon" size="19" />
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.list-row-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: tokens.$size-row-icon;
  height: tokens.$size-row-icon;
  border-radius: 50%;
  background: tokens.$color-row-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.list-row-icon--muted {
  background: tokens.$color-row-icon-muted-surface;
  color: tokens.$color-text-secondary;
}
</style>
