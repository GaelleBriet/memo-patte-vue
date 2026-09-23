<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import ChoiceCards from './ChoiceCards.vue'
import ExportActions from './ExportActions.vue'
import type { DeliveryMode } from '../logic/export-delivery'
import type { ExportFormat } from '../logic/export-format'
import { openAppSettings } from '../logic/export-storage-access'
import { useDataExport } from '../composables/use-data-export'
import { SAVED_TOAST_MS } from '../composables/use-export-run'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { showToast } from '@/shared/utils/toast'

defineProps<{
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { pendingMode, isPreparing, hasFailed, saveAccess, run, reset } = useDataExport()

const formats = computed(() => [
  {
    value: 'json' as const,
    icon: 'ms:description',
    label: t('settings.export.json.label'),
    description: t('settings.export.json.description'),
  },
  {
    value: 'csv' as const,
    icon: 'ms:table',
    label: t('settings.export.csv.label'),
    description: t('settings.export.csv.description'),
  },
])

const selected = ref<ExportFormat>('json')
const groupLabelId = useId()

watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    selected.value = 'json'
    reset()
  },
  { immediate: true },
)

async function deliver(mode: DeliveryMode): Promise<void> {
  const format = selected.value
  const outcome = await run(format, mode)
  if (outcome === 'saved') {
    open.value = false
    const message =
      format === 'json' ? t('settings.export.saved.json') : t('settings.export.saved.csv')
    showToast(message, { durationMs: SAVED_TOAST_MS })
  } else if (outcome === 'shared') {
    open.value = false
    showToast(t('settings.export.success'))
  }
}
</script>

<template>
  <!-- Pendant la préparation, un tap sur le voile ne ferme pas : l'issue doit rester lisible. -->
  <BottomSheet
    v-model="open"
    class="export-sheet"
    :title="t('settings.export.title')"
    :subtitle="t('settings.export.subtitle')"
    :close-label="t('settings.export.close')"
    :persistent="isPreparing"
    :focus-fallback="focusFallback"
  >
    <p :id="groupLabelId" class="export-sheet__group-label" aria-hidden="true">
      {{ t('settings.export.formats') }}
    </p>
    <ChoiceCards
      v-model="selected"
      :choices="formats"
      :labelledby="groupLabelId"
      :disabled="isPreparing"
    />

    <p v-if="hasFailed" class="export-sheet__error" role="alert">
      {{ t('settings.export.error') }}
    </p>

    <ExportActions
      :access="saveAccess"
      :pending-mode="pendingMode"
      @save="deliver('save')"
      @share="deliver('share')"
      @open-settings="openAppSettings"
    />
  </BottomSheet>
</template>

<style lang="scss">
.export-sheet__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.export-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
