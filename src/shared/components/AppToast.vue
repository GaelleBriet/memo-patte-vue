<script setup lang="ts">
import { computed } from 'vue'

import { fixedBottomBarHeight } from '../composables/use-fixed-bottom-bar'
import {
  dismissToast,
  pauseToast,
  resumeToast,
  runToastAction,
  toastAction,
  toastAnnouncement,
  toastMessage,
  toastTone,
  type ToastTone,
} from '../utils/toast'

const ICONS: Record<ToastTone, string> = {
  success: 'ms:check_circle_fill',
  info: 'ms:info_fill',
  error: 'ms:error_fill',
}

const isOpen = computed({
  get: () => toastMessage.value !== null,
  set: (open) => {
    if (!open) dismissToast()
  },
})
</script>

<template>
  <p class="app-toast__live" role="status" aria-live="polite">{{ toastAnnouncement }}</p>
  <!-- Annoncé par la région ci-dessus, déjà en place : le contenu de Vuetify, qui porte son propre
       `role="status"` et naît avec le message, n'est pas utilisé. -->
  <v-snackbar
    v-model="isOpen"
    class="app-toast"
    :class="[`app-toast--${toastTone}`, { 'app-toast--with-action': toastAction }]"
    :timeout="-1"
    location="bottom"
    :style="{ '--fixed-bottom-bar-height': `${fixedBottomBarHeight}px` }"
  >
    <template #prepend>
      <span class="app-toast__content" aria-hidden="true">
        <v-icon class="app-toast__icon" :icon="ICONS[toastTone]" size="20" />
        <span class="app-toast__message">{{ toastMessage }}</span>
      </span>
    </template>
    <template v-if="toastAction" #actions>
      <v-btn
        class="app-toast__action"
        variant="text"
        :aria-label="toastAction.ariaLabel"
        @click="runToastAction"
        @focus="pauseToast"
        @blur="resumeToast"
      >
        {{ toastAction.label }}
      </v-btn>
    </template>
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

.app-toast--error :deep(.v-snackbar__wrapper) {
  background: rgb(var(--v-theme-error));
  color: rgb(var(--v-theme-on-error));
  box-shadow: tokens.$shadow-toast-error;
}

.app-toast :deep(.v-snackbar__prepend) {
  flex: 1 1 0;
  min-width: 0;
  margin: 0;
  padding: 6px 16px;
  letter-spacing: normal;
}

.app-toast--with-action :deep(.v-snackbar__prepend) {
  padding-inline-end: 4px;
}

.app-toast :deep(.v-snackbar__actions) {
  margin-inline-end: 6px;
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

.app-toast--error .app-toast__icon {
  color: inherit;
}

.app-toast__message {
  min-width: 0;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.35;
}

.app-toast__action {
  height: 48px;
  padding-inline: 10px;
  color: tokens.$color-toast-icon;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.app-toast--error .app-toast__action {
  color: inherit;
}
</style>
