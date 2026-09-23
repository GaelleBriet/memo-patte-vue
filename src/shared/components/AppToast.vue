<script setup lang="ts">
import { computed } from 'vue'

import { fixedBottomBarHeight } from '../composables/use-fixed-bottom-bar'
import { dismissToast, toastAnnouncement, toastMessage } from '../utils/toast'

const isOpen = computed({
  get: () => toastMessage.value !== null,
  set: (open) => {
    if (!open) dismissToast()
  },
})
</script>

<template>
  <p class="app-toast__live" role="status" aria-live="polite">{{ toastAnnouncement }}</p>
  <!-- Annoncé par la région ci-dessus, déjà en place : celle de Vuetify naît avec le message. -->
  <v-snackbar
    v-model="isOpen"
    class="app-toast"
    :timeout="-1"
    location="bottom"
    :style="{ '--fixed-bottom-bar-height': `${fixedBottomBarHeight}px` }"
    :content-props="{ 'aria-hidden': 'true' }"
  >
    <span class="app-toast__content">
      <v-icon class="app-toast__icon" icon="ms:check_circle_fill" size="20" />
      <span class="app-toast__message">{{ toastMessage }}</span>
    </span>
  </v-snackbar>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.app-toast {
  margin: 0 14px 24px;
  padding-bottom: calc(var(--v-layout-bottom) + var(--fixed-bottom-bar-height, 0px));
}

.app-toast :deep(.v-snackbar__wrapper) {
  width: 100%;
  min-width: 0;
  min-height: 56px;
  border-radius: tokens.$radius-toast;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
  box-shadow: tokens.$shadow-toast;
}

.app-toast :deep(.v-snackbar__content) {
  padding: 6px 16px;
  letter-spacing: normal;
}

.app-toast__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.app-toast__content {
  display: flex;
  align-items: center;
  gap: 10px;
}

.app-toast__icon {
  flex-shrink: 0;
  color: tokens.$color-toast-icon;
}

.app-toast__message {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
}
</style>
