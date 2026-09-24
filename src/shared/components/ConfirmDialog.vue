<script setup lang="ts">
import { onScopeDispose, useTemplateRef, watch } from 'vue'

import { onBackButton } from '@/core/app-lifecycle/back-button'

const props = withDefaults(
  defineProps<{
    title: string
    text: string
    cancelLabel: string
    confirmLabel: string
    cancelAriaLabel?: string
    confirmAriaLabel?: string
    /** `danger` : action destructive, en couleur système d'erreur ; `primary` : action principale. */
    tone?: 'danger' | 'primary'
  }>(),
  { cancelAriaLabel: undefined, confirmAriaLabel: undefined, tone: 'danger' },
)

const emit = defineEmits<{
  confirm: []
  cancel: []
}>()

const open = defineModel<boolean>({ default: false })

const cancelButton = useTemplateRef<{ $el: HTMLElement }>('cancelButton')

let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

watch(
  open,
  (isOpen) => {
    releaseBack()
    if (isOpen) releaseBackButton = onBackButton(close)
  },
  { immediate: true },
)

function close(): void {
  open.value = false
}

function focusCancel(): void {
  cancelButton.value?.$el.focus({ preventScroll: true })
}

function cancel(): void {
  close()
  emit('cancel')
}

function confirm(): void {
  close()
  emit('confirm')
}
</script>

<template>
  <v-dialog
    v-model="open"
    class="confirm-dialog"
    content-class="confirm-dialog__content"
    max-width="340"
    :aria-label="props.title"
    @after-enter="focusCancel"
  >
    <div class="confirm-dialog__panel" :class="`confirm-dialog__panel--${props.tone}`">
      <h2 class="confirm-dialog__title">{{ props.title }}</h2>
      <p class="confirm-dialog__text">{{ props.text }}</p>
      <div class="confirm-dialog__actions">
        <v-btn
          ref="cancelButton"
          class="confirm-dialog__cancel"
          variant="outlined"
          :aria-label="props.cancelAriaLabel"
          @click="cancel"
        >
          {{ props.cancelLabel }}
        </v-btn>
        <v-btn
          class="confirm-dialog__confirm"
          :variant="props.tone === 'danger' ? 'text' : 'flat'"
          :color="props.tone === 'danger' ? 'error' : 'primary'"
          :aria-label="props.confirmAriaLabel"
          @click="confirm"
        >
          {{ props.confirmLabel }}
        </v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

// Non scopé : le dialogue est téléporté hors du composant.
.confirm-dialog {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.confirm-dialog__panel {
  padding: 24px 24px 20px;
  border-radius: tokens.$radius-sheet;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.confirm-dialog__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.25;
}

.confirm-dialog__text {
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  line-height: 1.5;
}

.confirm-dialog__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.confirm-dialog__actions .v-btn {
  height: 46px;
  padding-inline: 18px;
  border-radius: tokens.$radius-pill;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}

.confirm-dialog__cancel {
  border: 2px solid tokens.$color-dialog-cancel-border;
  color: rgb(var(--v-theme-primary));
}
</style>
