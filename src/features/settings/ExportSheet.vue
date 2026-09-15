<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ExportFormat } from './export-format'
import { useDataExport } from './use-data-export'
import BottomSheet from '@/shared/BottomSheet.vue'
import { showToast } from '@/shared/toast'

defineProps<{
  focusFallback?: HTMLElement | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const { isPreparing, hasFailed, run, reset } = useDataExport()

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

watch(open, (isOpen) => {
  if (!isOpen) return
  selected.value = 'json'
  reset()
})

async function submit(): Promise<void> {
  const outcome = await run(selected.value)
  if (outcome !== 'shared') return
  open.value = false
  showToast(t('settings.export.success'))
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
    <p :id="groupLabelId" class="export-sheet__group-label">{{ t('settings.export.formats') }}</p>
    <div class="export-sheet__choices" role="radiogroup" :aria-labelledby="groupLabelId">
      <button
        v-for="format in formats"
        :key="format.value"
        type="button"
        role="radio"
        class="export-sheet__choice"
        :class="{ 'export-sheet__choice--selected': selected === format.value }"
        :aria-checked="selected === format.value"
        :disabled="isPreparing"
        @click="selected = format.value"
      >
        <v-icon class="export-sheet__choice-icon" :icon="format.icon" size="22" />
        <span class="export-sheet__choice-text">
          <span class="export-sheet__choice-label">{{ format.label }}</span>
          <span class="export-sheet__choice-description">{{ format.description }}</span>
        </span>
        <span class="export-sheet__radio" aria-hidden="true" />
      </button>
    </div>

    <p v-if="hasFailed" class="export-sheet__error" role="alert">
      {{ t('settings.export.error') }}
    </p>

    <v-btn
      class="export-sheet__submit"
      variant="flat"
      color="primary"
      :disabled="isPreparing"
      @click="submit"
    >
      <v-progress-circular
        v-if="isPreparing"
        class="export-sheet__spinner"
        indeterminate
        :size="18"
        :width="2"
      />
      {{ isPreparing ? t('settings.export.preparing') : t('settings.export.submit') }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.export-sheet__group-label {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.export-sheet__choices {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.export-sheet__choice {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: tokens.$height-export-choice;
  padding: 12px 18px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.export-sheet__choice--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
}

.export-sheet__choice-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.export-sheet__choice-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.export-sheet__choice-label {
  font-size: 15px;
  font-weight: 700;
}

.export-sheet__choice-description {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.export-sheet__radio {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1.5px solid tokens.$color-radio-border;
  border-radius: 50%;
}

.export-sheet__choice--selected .export-sheet__radio {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}

.export-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.export-sheet__submit {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 22px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.export-sheet__submit:disabled,
.export-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}
</style>
