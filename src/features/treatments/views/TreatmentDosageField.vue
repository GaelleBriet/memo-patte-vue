<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { doseQuantityTextFor, parseDoseQuantity, tabletShortcuts } from '../logic/treatment-form'
import { DOSE_UNITS, doseUnitText, type DoseUnit } from '@/shared/domain/dosage'

const props = defineProps<{
  quantity: string
  unit: DoseUnit | null
  describedby?: string
  invalid?: boolean
}>()

const emit = defineEmits<{
  'update:quantity': [quantity: string]
  'update:unit': [unit: DoseUnit | null]
}>()

const { t } = useI18n()

const parsed = computed(() => parseDoseQuantity(props.quantity))
const count = computed(() =>
  parsed.value === null || Number.isNaN(parsed.value) ? 1 : parsed.value,
)
const units = computed(() =>
  DOSE_UNITS.map((unit) => ({ value: unit, title: doseUnitText(t, unit, count.value) })),
)
const shortcuts = computed(() =>
  tabletShortcuts().map(({ value, label }) => ({
    value,
    label,
    spoken: t('dosage.value', { quantity: label, unit: doseUnitText(t, 'tablet', value) }),
  })),
)

function selectUnit(unit: DoseUnit | null): void {
  emit('update:unit', unit)
  emit('update:quantity', doseQuantityTextFor(props.quantity, unit))
}
</script>

<template>
  <div class="treatment-dosage">
    <div class="treatment-dosage__row">
      <v-text-field
        id="treatment-dose-quantity"
        class="form-field__input treatment-dosage__quantity"
        inputmode="decimal"
        variant="outlined"
        hide-details
        :model-value="quantity"
        :placeholder="t('treatments.form.dosage.quantity')"
        :aria-label="t('treatments.form.dosage.quantity')"
        :aria-describedby="describedby"
        :aria-invalid="invalid"
        :error="invalid"
        @update:model-value="emit('update:quantity', $event)"
      />
      <v-select
        id="treatment-dose-unit"
        class="form-field__input treatment-dosage__unit"
        variant="outlined"
        hide-details
        clearable
        :items="units"
        :model-value="unit"
        :placeholder="t('treatments.form.dosage.unit')"
        :aria-label="t('treatments.form.dosage.unit')"
        :aria-describedby="describedby"
        :error="invalid"
        @update:model-value="selectUnit"
      />
    </div>
    <div
      v-if="unit === 'tablet'"
      class="treatment-dosage__shortcuts"
      role="radiogroup"
      :aria-label="t('treatments.form.dosage.shortcuts')"
    >
      <button
        v-for="shortcut in shortcuts"
        :key="shortcut.value"
        type="button"
        class="treatment-dosage__shortcut"
        :class="{ 'treatment-dosage__shortcut--selected': parsed === shortcut.value }"
        role="radio"
        :aria-checked="parsed === shortcut.value"
        :aria-label="shortcut.spoken"
        @click="emit('update:quantity', shortcut.label)"
      >
        {{ shortcut.label }}
      </button>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-dosage__row {
  display: flex;
  gap: 8px;
}

.treatment-dosage__quantity {
  flex: 0 0 92px;
}

.treatment-dosage__quantity :deep(.v-field__input) {
  padding-inline: 6px;
}

.treatment-dosage__quantity :deep(input) {
  font-weight: 600;
  text-align: center;
}

.treatment-dosage__unit {
  flex: 1 1 0;
  min-width: 0;
}

.treatment-dosage__unit :deep(.v-field__input) {
  align-items: center;
}

.treatment-dosage__unit :deep(.v-field__input input) {
  align-self: center;
}

.treatment-dosage__shortcuts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 8px;
}

.treatment-dosage__shortcut {
  flex: 0 0 auto;
  min-width: 52px;
  height: tokens.$size-tap-target;
  padding: 0 10px;
  border: 1px solid tokens.$color-field-border;
  border-radius: tokens.$radius-pill;
  background: tokens.$color-field-surface;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 700;
  white-space: nowrap;
}

.treatment-dosage__shortcut--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}
</style>
