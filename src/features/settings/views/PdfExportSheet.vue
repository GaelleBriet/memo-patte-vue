<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

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
}

const props = defineProps<{
  animals: PdfExportAnimal[]
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { pendingMode, isPreparing, hasFailed, saveAccess, run, reset } = usePdfExport()

const openedAt = ref(new Date())

const onlyAnimal = computed(() => (props.animals.length === 1 ? props.animals[0]! : null))

const subtitle = computed(() =>
  onlyAnimal.value
    ? t('settings.pdf.sheet.subtitleOne', { name: onlyAnimal.value.name })
    : t('settings.pdf.sheet.subtitleAll'),
)

const fileName = computed(() =>
  pdfExportFileName(
    t('settings.pdf.fileNamePrefix'),
    props.animals.map(({ name }) => name),
    openedAt.value,
  ),
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    openedAt.value = new Date()
    reset()
  },
  { immediate: true },
)

async function deliver(mode: DeliveryMode): Promise<void> {
  const outcome = await run(
    props.animals.map(({ id }) => id),
    mode,
    openedAt.value,
  )
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
    <div class="pdf-export-sheet__file">
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
      :disabled="animals.length === 0"
      @save="deliver('save')"
      @share="deliver('share')"
      @open-settings="openAppSettings"
    />
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

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
