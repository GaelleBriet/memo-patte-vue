<script setup lang="ts">
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue'
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

type PdfExportChoice = {
  key: string
  icon: string
  label: string
  hint: string | null
  ariaLabel: string
  animals: PdfExportAnimal[]
}

const props = defineProps<{
  animals: PdfExportAnimal[]
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { pendingMode, isPreparing, hasFailed, saveAccess, run, reset } = usePdfExport()

const openedAt = ref(new Date())
const chosen = ref<PdfExportAnimal[] | null>(null)
const fileCard = useTemplateRef('fileCard')

const needsChoice = computed(() => props.animals.length > 1)

const choices = computed<PdfExportChoice[]>(() => {
  const names = props.animals.map(({ name }) => name).join(', ')
  return [
    {
      key: 'all',
      icon: 'ms:groups',
      label: t('settings.pdf.sheet.allAnimals'),
      hint: names,
      ariaLabel: t('settings.pdf.sheet.allAnimalsLabel', { names }),
      animals: props.animals,
    },
    ...props.animals.map((animal) => ({
      key: animal.id,
      icon: 'ms:pets',
      label: animal.name,
      hint: null,
      ariaLabel: animal.name,
      animals: [animal],
    })),
  ]
})

const exported = computed(() => (needsChoice.value ? chosen.value : props.animals))

const subtitle = computed(() =>
  needsChoice.value
    ? t('settings.pdf.sheet.subtitle')
    : t('settings.pdf.sheet.subtitleOne', { name: props.animals[0]?.name ?? '' }),
)

const fileName = computed(() =>
  exported.value
    ? pdfExportFileName(
        t('settings.pdf.fileNamePrefix'),
        exported.value.map(({ name }) => name),
        openedAt.value,
      )
    : null,
)

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    chosen.value = null
    openedAt.value = new Date()
    reset()
  },
  { immediate: true },
)

async function choose(choice: PdfExportChoice): Promise<void> {
  chosen.value = choice.animals
  await nextTick()
  fileCard.value?.focus()
}

async function deliver(mode: DeliveryMode): Promise<void> {
  if (!exported.value || !fileName.value) return
  const outcome = await run(
    {
      animalIds: exported.value.map(({ id }) => id),
      fileName: fileName.value,
      exportedAt: openedAt.value,
    },
    mode,
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
    <div v-if="fileName === null" class="settings-card pdf-export-sheet__choices">
      <button
        v-for="choice in choices"
        :key="choice.key"
        type="button"
        class="settings-row"
        :aria-label="choice.ariaLabel"
        @click="choose(choice)"
      >
        <v-icon class="settings-row__icon" :icon="choice.icon" size="22" />
        <span class="settings-row__text">
          <span class="settings-row__label">{{ choice.label }}</span>
          <span v-if="choice.hint" class="settings-row__hint">{{ choice.hint }}</span>
        </span>
        <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
      </button>
    </div>

    <template v-else>
      <div ref="fileCard" class="pdf-export-sheet__file" tabindex="-1">
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
    </template>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.pdf-export-sheet__choices {
  margin-top: 18px;
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

  &:focus {
    outline: none;
  }
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
