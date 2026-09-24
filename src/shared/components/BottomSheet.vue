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
    /** Icône posée dans une pastille avant le titre. */
    icon?: string | null
    /** Flèche de retour libellée avant le titre, qui émet `back`. */
    backLabel?: string | null
    /** Feuille à étapes : le retour Android émet `back` au lieu de fermer, flèche ou non. */
    hasPreviousStep?: boolean
  }>(),
  {
    subtitle: null,
    showClose: false,
    persistent: false,
    focusFallback: null,
    icon: null,
    backLabel: null,
    hasPreviousStep: false,
  },
)

const emit = defineEmits<{
  back: []
}>()

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
        if (props.persistent) return
        if (props.hasPreviousStep || props.backLabel) emit('back')
        else close()
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
      <div
        class="bottom-sheet__header"
        :class="{ 'bottom-sheet__header--lead': icon || backLabel }"
      >
        <v-btn
          v-if="backLabel"
          class="bottom-sheet__back"
          icon="ms:arrow_back"
          variant="text"
          :aria-label="backLabel"
          @click="emit('back')"
        />
        <span v-else-if="icon" class="bottom-sheet__icon" aria-hidden="true">
          <v-icon :icon="icon" size="24" />
        </span>
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

      <!-- Dessinée en haut, lue en dernier : le titre s'annonce d'abord, et la croix suffit quand elle est là. -->
      <button
        type="button"
        class="bottom-sheet__handle"
        :aria-label="closeLabel"
        :aria-hidden="showClose || undefined"
        :tabindex="showClose ? -1 : undefined"
        @click="close"
      />
    </div>
  </v-bottom-sheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

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

// Le titre commence à 34 px du bord : la pilule à 12 px, 18 px sous elle.
.bottom-sheet__panel {
  position: relative;
  padding: 34px 20px 24px;
}

// La pilule visible (36 × 4) reste à 12 px du bord ; la zone de tap descend sur le titre.
.bottom-sheet__handle {
  position: absolute;
  top: 0;
  inset-inline: 0;
  z-index: 1;
  display: block;
  width: 96px;
  height: tokens.$size-tap-target;
  margin-inline: auto;
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

.bottom-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.bottom-sheet__header--lead {
  align-items: center;
  gap: 14px;
}

.bottom-sheet__heading {
  flex: 1 1 auto;
  min-width: 0;
}

.bottom-sheet__icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: tokens.$size-sheet-icon;
  height: tokens.$size-sheet-icon;
  border-radius: 50%;
  background: tokens.$color-sheet-icon-surface;
  color: rgb(var(--v-theme-primary));
}

.bottom-sheet__back {
  flex: 0 0 auto;
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  margin-inline: -12px -4px;
  color: rgb(var(--v-theme-primary));
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

  @include tap.tap-target;
}
</style>
