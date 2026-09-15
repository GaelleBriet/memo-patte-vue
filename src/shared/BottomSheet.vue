<script setup lang="ts">
import { nextTick, onScopeDispose, useId, watch } from 'vue'

import { onBackButton } from '@/core/app-lifecycle/back-button'

const props = withDefaults(
  defineProps<{
    title: string
    closeLabel: string
    subtitle?: string | null
    showClose?: boolean
    persistent?: boolean
    /** Reçoit le focus à la fermeture si le contrôle qui a ouvert la feuille a disparu. */
    focusFallback?: HTMLElement | null
  }>(),
  { subtitle: null, showClose: false, persistent: false, focusFallback: null },
)

const open = defineModel<boolean>({ default: false })

defineSlots<{
  default(): unknown
}>()

const titleId = useId()

// Pilotée par v-model, la feuille n'a pas d'activateur Vuetify pour lui rendre le focus.
let opener: HTMLElement | null = null
let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

watch(
  open,
  async (isOpen) => {
    releaseBack()
    if (isOpen) {
      releaseBackButton = onBackButton(() => {
        if (!props.persistent) close()
      })
      const active = document.activeElement
      opener = active instanceof HTMLElement && active !== document.body ? active : null
      return
    }

    const returnTo = opener
    opener = null
    await nextTick()
    if (open.value) return
    const target = returnTo?.isConnected ? returnTo : props.focusFallback
    target?.focus({ preventScroll: true })
  },
  { immediate: true },
)

function close(): void {
  open.value = false
}
</script>

<template>
  <v-bottom-sheet
    v-model="open"
    class="bottom-sheet"
    content-class="bottom-sheet__content"
    :persistent="persistent"
    :aria-labelledby="titleId"
  >
    <div class="bottom-sheet__panel">
      <button type="button" class="bottom-sheet__handle" :aria-label="closeLabel" @click="close" />

      <div class="bottom-sheet__header">
        <div class="bottom-sheet__heading">
          <h2 :id="titleId" class="bottom-sheet__title">{{ title }}</h2>
          <p v-if="subtitle" class="bottom-sheet__subtitle">{{ subtitle }}</p>
        </div>
        <v-btn
          v-if="showClose"
          class="bottom-sheet__close"
          icon="ms:close"
          variant="text"
          :aria-label="closeLabel"
          @click="close"
        />
      </div>

      <slot />
    </div>
  </v-bottom-sheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant, et le voile comme le
// conteneur appartiennent à Vuetify.
.bottom-sheet {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.bottom-sheet__content {
  margin: 0;
  overflow: visible;
  border-radius: tokens.$radius-sheet tokens.$radius-sheet 0 0;
  background: rgb(var(--v-theme-background));
  box-shadow: tokens.$shadow-sheet;
}

.bottom-sheet__panel {
  padding: 0 20px 24px;
}

// Zone de tap de 44 px de haut ; la pilule visible (36 × 4) reste à 12 px du bord.
.bottom-sheet__handle {
  // Au-dessus du titre qui remonte sous elle : les 44 px restent tous tapables.
  position: relative;
  z-index: 1;
  display: block;
  width: 96px;
  height: 44px;
  margin: 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.bottom-sheet__handle::before {
  position: absolute;
  top: 12px;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: tokens.$color-sheet-handle;
  content: '';
  transform: translateX(-50%);
}

// La zone de tap de la poignée descend sous la pilule : le titre remonte d'autant
// pour garder 18 px entre la pilule et lui.
.bottom-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-top: -10px;
}

.bottom-sheet__heading {
  min-width: 0;
}

.bottom-sheet__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.bottom-sheet__subtitle {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.bottom-sheet__close {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  margin: -8px -8px 0 0;
  color: tokens.$color-segment-inactive;
}
</style>
