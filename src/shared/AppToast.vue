<script setup lang="ts">
import { computed } from 'vue'

import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'
import { dismissToast, toastMessage } from './toast'

const TOAST_DURATION_MS = 3000
const GAP_ABOVE_BOTTOM_NAV = 12

const isOpen = computed({
  get: () => toastMessage.value !== null,
  set: (open) => {
    if (!open) dismissToast()
  },
})
</script>

<template>
  <v-snackbar
    v-model="isOpen"
    class="app-toast"
    :timeout="TOAST_DURATION_MS"
    location="bottom"
    :offset="heightBottomNav + paddingBottomNav + GAP_ABOVE_BOTTOM_NAV"
    rounded="lg"
  >
    <span class="app-toast__content">
      <v-icon icon="ms:check_circle" size="20" />
      <span>{{ toastMessage }}</span>
    </span>
  </v-snackbar>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.app-toast :deep(.v-snackbar__wrapper) {
  min-width: 0;
  width: calc(100% - 40px);
  border-radius: tokens.$radius-toast;
  background: tokens.$color-toast-surface;
  color: tokens.$color-on-primary;
}

.app-toast__content {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 15px;
  font-weight: 600;
}
</style>
