<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChoiceCards, { type ChoiceCard } from './ChoiceCards.vue'
import ExportActions from './ExportActions.vue'
import { isSaved, type DeliveryMode } from '../logic/export-delivery'
import { openAppSettings } from '../logic/export-storage-access'
import { pdfExportFileName } from '../logic/pdf-content'
import { showSavedExportToast } from '../logic/saved-export-toast'
import { usePdfExport } from '../composables/use-pdf-export'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { showToast } from '@/shared/utils/toast'

export type PdfExportAnimal = {
  id: string
  name: string
  species: 'dog' | 'cat'
}

const props = defineProps<{
  animals: PdfExportAnimal[]
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { pendingMode, isPreparing, hasFailed, saveAccess, run, reset } = usePdfExport()

const needsPicker = computed(() => props.animals.length > 1)
const selected = ref<string | null>(props.animals[0]?.id ?? null)
const openedAt = ref(new Date())
const groupLabelId = useId()

const choices = computed<ChoiceCard<string>[]>(() =>
  props.animals.map((animal) => ({
    value: animal.id,
    icon: 'ms:pets',
    label: animal.name,
    description: t(`animals.form.species.${animal.species}`),
  })),
)

const onlyAnimal = computed(() => (needsPicker.value ? null : (props.animals[0] ?? null)))

const subtitle = computed(() => {
  if (needsPicker.value) return t('settings.pdf.sheet.subtitlePick')
  return onlyAnimal.value
    ? t('settings.pdf.sheet.subtitleOne', { name: onlyAnimal.value.name })
    : ''
})

const fileName = computed(() =>
  onlyAnimal.value
    ? pdfExportFileName(t('settings.pdf.fileNamePrefix'), onlyAnimal.value.name, openedAt.value)
    : null,
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    selected.value = props.animals[0]?.id ?? null
    openedAt.value = new Date()
    reset()
  },
  { immediate: true },
)

async function deliver(mode: DeliveryMode): Promise<void> {
  if (selected.value === null) return
  const outcome = await run(selected.value, mode, openedAt.value)
  if (isSaved(outcome)) {
    open.value = false
    showSavedExportToast(outcome.file, {
      message: t('settings.pdf.saved'),
      openAriaLabel: t('settings.pdf.openLabel'),
    })
  } else if (outcome === 'shared') {
    open.value = false
    showToast(t('settings.pdf.success'))
  }
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="pdf-export-sheet"
    :title="t('settings.pdf.sheet.title')"
    :subtitle="subtitle"
    :close-label="t('settings.pdf.sheet.close')"
    :persistent="isPreparing"
    :focus-fallback="focusFallback"
  >
    <template v-if="needsPicker">
      <p :id="groupLabelId" class="pdf-export-sheet__group-label" aria-hidden="true">
        {{ t('settings.pdf.sheet.pickAnimalLabel') }}
      </p>
      <ChoiceCards
        v-model="selected"
        :choices="choices"
        :labelledby="groupLabelId"
        :disabled="isPreparing"
      />
    </template>

    <div v-else-if="fileName" class="pdf-export-sheet__file">
      <span class="pdf-export-sheet__file-icon" aria-hidden="true">
        <v-icon icon="ms:picture_as_pdf" size="22" />
      </span>
      <span class="pdf-export-sheet__file-text">
        <span class="pdf-export-sheet__file-name">{{ fileName }}</span>
        <span class="pdf-export-sheet__file-content">
          {{ t('settings.pdf.sheet.fileContent') }}
        </span>
      </span>
    </div>

    <p v-if="hasFailed" class="pdf-export-sheet__error" role="alert">
      {{ t('settings.pdf.sheet.error') }}
    </p>

    <ExportActions
      :access="saveAccess"
      :pending-mode="pendingMode"
      :disabled="selected === null"
      @save="deliver('save')"
      @share="deliver('share')"
      @open-settings="openAppSettings"
    />
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.pdf-export-sheet__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.pdf-export-sheet__file {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 14px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: rgb(var(--v-theme-surface));
}

.pdf-export-sheet__file-icon {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}

.pdf-export-sheet__file-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.pdf-export-sheet__file-name {
  overflow: hidden;
  font-size: 14px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pdf-export-sheet__file-content {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 12px;
}

.pdf-export-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
