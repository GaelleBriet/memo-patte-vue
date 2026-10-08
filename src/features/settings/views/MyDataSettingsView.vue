<script setup lang="ts">
import { computed, defineAsyncComponent, ref, useId, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import ExportSheet from './ExportSheet.vue'
import ImportSheet from './ImportSheet.vue'
import { useExportAvailability } from '../composables/use-export-availability'
import { pdfExportChoice, toPdfExportAnimals } from '../logic/pdf-export-animals'
import { promptNotificationsIfReminders } from '@/app/reminders-priming'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { WEIGHT_UNITS, type WeightUnit } from '@/shared/domain/weight-unit'
import { chooseWeightUnit, currentWeightUnit } from '@/shared/domain/weight-unit-preference'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { returnTo } from '@/shared/utils/return-to'

const PdfExportSheet = defineAsyncComponent(() => import('./PdfExportSheet.vue'))

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const { hasLoadFailed, hasNothingToExport, canExport, retryLoad } = useExportAvailability()

const isExportSheetOpen = ref(false)
const isPdfExportSheetOpen = ref(false)
const hasOpenedPdfExportSheet = ref(false)
const importSheet = useTemplateRef('importSheet')
const isImporting = ref(false)
const weightUnitLabelId = useId()

const weightUnit = computed(currentWeightUnit)
const weightUnitOptions = computed(() =>
  WEIGHT_UNITS.map((unit) => ({
    value: unit,
    label: t(`weight.unit.${unit}`),
    hint: t(`weight.unitName.${unit}`),
    ariaLabel: t(`settings.data.weightUnit.spoken.${unit}`),
  })),
)
const followedPdfAnimals = computed(() => toPdfExportAnimals(animals.followedAnimals))
const unfollowedPdfAnimals = computed(() => toPdfExportAnimals(animals.unfollowedAnimals))
const exportPdfHint = computed(() => {
  const choice = pdfExportChoice(followedPdfAnimals.value, unfollowedPdfAnimals.value)
  if (choice?.kind === 'one') return t('settings.data.exportPdfHintOne', { name: choice.name })
  if (choice?.kind === 'oneOfSeveral') return t('settings.data.exportPdfHintOneOfSeveral')
  return t('settings.data.exportPdfHint')
})

function onExportRow(): void {
  if (hasLoadFailed.value) retryLoad()
  else isExportSheetOpen.value = true
}

function onExportPdfRow(): void {
  if (hasLoadFailed.value) {
    retryLoad()
  } else {
    hasOpenedPdfExportSheet.value = true
    isPdfExportSheetOpen.value = true
  }
}

function onImported(): void {
  void animals.load()
  void promptNotificationsIfReminders(router, 'settings-data')
}

function onWeightUnitChange(unit: WeightUnit | null): void {
  if (unit) chooseWeightUnit(unit)
}

function goBack(): void {
  returnTo(router, { name: 'settings' })
}
</script>

<template>
  <PushedScreen
    class="my-data-settings"
    :title="t('settings.data.title')"
    :back-label="t('form.back')"
    @back="goBack"
  >
    <div class="my-data-settings__content">
      <div class="settings-card">
        <div class="settings-row settings-row--weight-unit">
          <div class="my-data-settings__weight-unit-heading">
            <v-icon class="settings-row__icon" icon="ms:scale" size="22" />
            <span class="settings-row__text">
              <span :id="weightUnitLabelId" class="settings-row__label">
                {{ t('settings.data.weightUnit.label') }}
              </span>
              <span class="settings-row__hint">{{ t('settings.data.weightUnit.hint') }}</span>
            </span>
          </div>
          <FormSegmented
            :model-value="weightUnit"
            :options="weightUnitOptions"
            :label-id="weightUnitLabelId"
            @update:model-value="onWeightUnitChange"
          />
        </div>
      </div>

      <h2 class="settings-section-title">{{ t('settings.data.exportSection') }}</h2>
      <div class="settings-card">
        <button
          type="button"
          class="settings-row settings-row--export"
          :class="{ 'settings-row--disabled': !canExport && !hasLoadFailed }"
          :disabled="!canExport && !hasLoadFailed"
          @click="onExportRow"
        >
          <v-icon class="settings-row__icon" icon="ms:data_object" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.data.export') }}</span>
            <span v-if="hasLoadFailed" class="settings-row__hint settings-row__hint--error">
              {{ t('settings.data.loadError') }}
            </span>
            <span v-else-if="hasNothingToExport" class="settings-row__hint">
              {{ t('settings.data.exportEmpty') }}
            </span>
            <span v-else class="settings-row__hint">{{ t('settings.data.exportHint') }}</span>
          </span>
          <v-icon
            v-if="canExport"
            class="settings-row__chevron"
            icon="ms:chevron_right"
            size="20"
          />
        </button>
        <button
          type="button"
          class="settings-row settings-row--export-pdf"
          :class="{ 'settings-row--disabled': !canExport && !hasLoadFailed }"
          :disabled="!canExport && !hasLoadFailed"
          @click="onExportPdfRow"
        >
          <v-icon class="settings-row__icon" icon="ms:picture_as_pdf" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.data.exportPdf') }}</span>
            <span v-if="hasLoadFailed" class="settings-row__hint settings-row__hint--error">
              {{ t('settings.data.loadError') }}
            </span>
            <span v-else-if="hasNothingToExport" class="settings-row__hint">
              {{ t('settings.data.exportEmpty') }}
            </span>
            <span v-else class="settings-row__hint">{{ exportPdfHint }}</span>
          </span>
          <v-icon
            v-if="canExport"
            class="settings-row__chevron"
            icon="ms:chevron_right"
            size="20"
          />
        </button>
      </div>

      <h2 class="settings-section-title">{{ t('settings.data.importSection') }}</h2>
      <div class="settings-card">
        <button
          type="button"
          class="settings-row settings-row--import"
          :class="{ 'settings-row--busy': isImporting }"
          :disabled="isImporting"
          :aria-busy="isImporting"
          @click="importSheet?.pickFile()"
        >
          <v-icon class="settings-row__icon" icon="ms:upload_file" size="22" />
          <span class="settings-row__text">
            <span class="settings-row__label">{{ t('settings.data.import') }}</span>
            <span v-if="isImporting" class="settings-row__hint" role="status">
              {{ t('settings.import.importing') }}
            </span>
          </span>
          <v-progress-circular
            v-if="isImporting"
            class="settings-row__spinner"
            indeterminate
            :size="18"
            :width="2"
          />
          <v-icon v-else class="settings-row__chevron" icon="ms:chevron_right" size="20" />
        </button>
      </div>
    </div>

    <ExportSheet v-model="isExportSheetOpen" />
    <PdfExportSheet
      v-if="hasOpenedPdfExportSheet"
      v-model="isPdfExportSheetOpen"
      :animals="followedPdfAnimals"
      :unfollowed-animals="unfollowedPdfAnimals"
    />
    <ImportSheet ref="importSheet" v-model:busy="isImporting" @imported="onImported" />
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.my-data-settings__content {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px tokens.$padding-section-inline 32px;
}

.settings-row--weight-unit {
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  padding-block: 14px 16px;
}

.my-data-settings__weight-unit-heading {
  display: flex;
  align-items: center;
  gap: 14px;
}
</style>
