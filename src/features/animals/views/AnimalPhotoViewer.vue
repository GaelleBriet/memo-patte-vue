<script setup lang="ts">
import { onScopeDispose, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { onBackButton } from '@/core/app-lifecycle/back-button'

defineProps<{
  src: string
  name: string
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

let releaseBackButton: (() => void) | null = null

watch(
  open,
  (isOpen) => {
    releaseBack()
    if (isOpen) releaseBackButton = onBackButton(close)
  },
  { immediate: true },
)

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

function close(): void {
  open.value = false
}

onScopeDispose(releaseBack)
</script>

<template>
  <v-dialog
    v-model="open"
    fullscreen
    :scrim="false"
    transition="fade-transition"
    :aria-label="t('animals.carnet.photo.sheetTitle', { name })"
  >
    <div class="animal-photo-viewer__panel">
      <v-btn
        class="animal-photo-viewer__close"
        icon="ms:close"
        variant="text"
        :aria-label="t('animals.carnet.photo.close')"
        @click="close"
      />
      <img
        class="animal-photo-viewer__image"
        :src="src"
        :alt="t('animals.carnet.photo.sheetTitle', { name })"
      />
    </div>
  </v-dialog>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.animal-photo-viewer__panel {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  background: tokens.$color-overlay-scrim;
}

.animal-photo-viewer__close {
  position: absolute;
  top: 8px;
  left: 8px;
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  color: rgb(var(--v-theme-background));
}

.animal-photo-viewer__image {
  display: block;
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
</style>
