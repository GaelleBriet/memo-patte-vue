<script setup lang="ts">
import { computed, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChoiceCards from './ChoiceCards.vue'
import type { ImportMode } from '../service/data-import.service'
import { useDataImport } from '../composables/use-data-import'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { showToast } from '@/shared/utils/toast'

const emit = defineEmits<{ imported: [] }>()

/** Les anciens Android typent un `.json` en octet-stream ou en texte : sans eux, le fichier serait grisé. */
const ACCEPTED_TYPES = '.json,application/json,application/octet-stream,text/plain'

const busy = defineModel<boolean>('busy', { default: false })

const { t } = useI18n()
const fileInput = useTemplateRef<HTMLInputElement>('fileInput')

const { step, error, isImporting, selectFile, choose, confirmReplace, cancelReplace, close } =
  useDataImport(undefined, () => {
    showToast(t('settings.import.success'))
    emit('imported')
  })

watch(isImporting, (value) => (busy.value = value))

const modes = computed(() => [
  {
    value: 'merge' as const,
    icon: 'ms:merge',
    label: t('settings.import.merge.label'),
    description: t('settings.import.merge.description'),
  },
  {
    value: 'replace' as const,
    icon: 'ms:delete_sweep',
    label: t('settings.import.replace.label'),
    description: t('settings.import.replace.description'),
    danger: true,
  },
])

const errorMessage = computed(() => {
  switch (error.value) {
    case 'invalid':
      return t('settings.import.errors.invalid')
    case 'newer':
      return t('settings.import.errors.newer')
    case 'outOfRange':
      return t('settings.import.errors.outOfRange')
    case 'reattached':
      return t('settings.import.errors.reattached')
    case 'failed':
      return t('settings.import.errors.failed')
    default:
      return null
  }
})

const selected = ref<ImportMode | null>(null)
const groupLabelId = useId()

const isSheetOpen = computed({
  get: () => step.value !== 'idle',
  set: (isOpen) => {
    if (!isOpen) close()
  },
})

const isConfirmOpen = computed({
  get: () => step.value === 'confirm',
  set: (isOpen) => {
    if (!isOpen) cancelReplace()
  },
})

watch(step, (current, previous) => {
  if (current === 'choice' && previous !== 'confirm') selected.value = null
})

function pickFile(): void {
  fileInput.value?.click()
}

async function onFileChange(): Promise<void> {
  const input = fileInput.value
  const file = input?.files?.[0]
  if (!input || !file) return
  input.value = ''
  await selectFile(file)
}

async function submit(): Promise<void> {
  if (selected.value !== null) await choose(selected.value)
}

defineExpose({ pickFile })
</script>

<template>
  <input
    ref="fileInput"
    class="import-sheet__file-input"
    type="file"
    :accept="ACCEPTED_TYPES"
    tabindex="-1"
    aria-hidden="true"
    @change="onFileChange"
  />

  <BottomSheet
    v-model="isSheetOpen"
    class="import-sheet"
    :title="t('settings.import.title')"
    :subtitle="step === 'error' ? null : t('settings.import.subtitle')"
    :close-label="t('settings.import.close')"
    :persistent="isImporting"
  >
    <template v-if="step === 'error'">
      <div class="import-sheet__error">
        <span class="import-sheet__error-badge" aria-hidden="true">
          <v-icon icon="ms:error" size="28" />
        </span>
        <p class="import-sheet__error-message" role="alert">{{ errorMessage }}</p>
      </div>
      <v-btn class="import-sheet__button" variant="outlined" color="primary" @click="pickFile">
        {{ t('settings.import.pickAnother') }}
      </v-btn>
    </template>

    <template v-else>
      <p :id="groupLabelId" class="import-sheet__group-label" aria-hidden="true">
        {{ t('settings.import.modes') }}
      </p>
      <ChoiceCards
        v-model="selected"
        :choices="modes"
        :labelledby="groupLabelId"
        :disabled="isImporting"
        :show-radio="false"
      />
      <v-btn
        class="import-sheet__button import-sheet__submit"
        variant="flat"
        color="primary"
        :disabled="selected === null || isImporting"
        @click="submit"
      >
        <v-progress-circular
          v-if="isImporting"
          class="import-sheet__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
        {{ isImporting ? t('settings.import.importing') : t('settings.import.submit') }}
      </v-btn>
    </template>
  </BottomSheet>

  <v-dialog
    v-model="isConfirmOpen"
    class="import-confirm-overlay"
    content-class="import-confirm"
    max-width="340"
    :aria-label="t('settings.import.confirm.title')"
  >
    <div class="import-confirm__panel">
      <h2 class="import-confirm__title">{{ t('settings.import.confirm.title') }}</h2>
      <p class="import-confirm__body">{{ t('settings.import.confirm.body') }}</p>
      <div class="import-confirm__actions">
        <v-btn class="import-confirm__cancel" variant="text" color="primary" @click="cancelReplace">
          {{ t('settings.import.confirm.cancel') }}
        </v-btn>
        <v-btn class="import-confirm__submit" variant="flat" color="error" @click="confirmReplace">
          {{ t('settings.import.confirm.submit') }}
        </v-btn>
      </div>
    </div>
  </v-dialog>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.import-sheet__file-input,
.import-sheet__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.import-sheet__error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  margin-top: 22px;
  text-align: center;
}

.import-sheet__error-badge {
  display: grid;
  place-items: center;
  width: tokens.$size-import-error-badge;
  height: tokens.$size-import-error-badge;
  border-radius: 50%;
  background: rgb(var(--v-theme-error-container));
  color: rgb(var(--v-theme-error));
}

.import-sheet__error-message {
  max-width: 280px;
  margin: 0;
  color: rgb(var(--v-theme-error));
  font-size: 15px;
  font-weight: 700;
  line-height: 1.4;
}

.import-sheet__button {
  width: 100%;
  height: 52px;
  margin-top: 22px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.import-sheet__submit:disabled,
.import-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}

.import-sheet__spinner {
  margin-inline-end: 8px;
}

.import-confirm-overlay {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.import-confirm__panel {
  padding: 22px 22px 18px;
  border-radius: tokens.$radius-sheet;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
}

.import-confirm__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 19px;
  font-weight: 700;
}

.import-confirm__body {
  margin: 10px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.5;
}

.import-confirm__actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 20px;
}

.import-confirm__actions .v-btn {
  height: 44px;
  padding-inline: 18px;
  border-radius: 999px;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}
</style>
