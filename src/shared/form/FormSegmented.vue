<script lang="ts">
export interface SegmentedOption<T extends string = string> {
  value: T
  label: string
  /** Seconde ligne sous le libellé ; l'option cochée ne porte alors plus de coche. */
  hint?: string
  ariaLabel?: string
}
</script>

<script setup lang="ts" generic="T extends string">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: T | null
  options: readonly SegmentedOption<T>[]
  labelId?: string
  /** Trois libellés sur une ligne : options serrées, l'option cochée sans coche. */
  compact?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T | null]
}>()

const isStacked = computed(() => props.options.some((option) => option.hint))

function select(value: unknown): void {
  emit('update:modelValue', props.options.find((option) => option.value === value)?.value ?? null)
}
</script>

<template>
  <v-btn-toggle
    class="form-segmented"
    :class="{ 'form-segmented--stacked': isStacked, 'form-segmented--compact': compact }"
    role="radiogroup"
    :aria-labelledby="labelId"
    :divided="!compact"
    variant="flat"
    base-color="surface"
    color="primary"
    selected-class="form-segmented__option--selected"
    :model-value="modelValue ?? undefined"
    @update:model-value="select"
  >
    <v-btn
      v-for="option in options"
      :key="option.value"
      class="form-segmented__option"
      :value="option.value"
      role="radio"
      :aria-checked="modelValue === option.value"
      :aria-label="option.ariaLabel"
    >
      <span v-if="isStacked" class="form-segmented__stack">
        <span class="form-segmented__label">{{ option.label }}</span>
        <span class="form-segmented__hint">{{ option.hint }}</span>
      </span>
      <template v-else>
        <v-icon v-if="!compact && modelValue === option.value" icon="ms:check" size="18" />
        <span>{{ option.label }}</span>
      </template>
    </v-btn>
  </v-btn-toggle>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.form-segmented {
  width: 100%;
  height: tokens.$height-segmented;
  border: 1px solid tokens.$color-segmented-border;
  border-radius: 999px;
  overflow: hidden;
}

.form-segmented--stacked {
  height: tokens.$height-segmented-stacked;
}

// Pas de `:deep(.v-btn)` : sa spécificité surclasserait la couleur de l'option cochée.
.form-segmented__option {
  flex: 1 1 0;
  // Parts égales tant que les libellés tiennent ; un libellé agrandi prend sa place.
  min-width: min-content;
  height: 100%;
  gap: 6px;
  border-radius: 0;
  color: tokens.$color-segment-inactive;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: normal;
}

.form-segmented__option--selected {
  color: tokens.$color-on-primary;
  font-weight: 700;
}

.form-segmented--compact {
  height: tokens.$height-segmented-compact;
  gap: 2px;
  padding: 3px;
  border-color: tokens.$color-field-border;
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
}

.form-segmented--compact .form-segmented__option {
  flex: 1 1 auto;
  min-width: 0;
  padding: 0 4px;
  border-radius: tokens.$radius-segment-compact;
  font-size: 13px;
}

.form-segmented__stack {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.2;
}

.form-segmented__label {
  font-size: 16px;
  font-weight: 700;
}

.form-segmented__hint {
  font-size: 12.5px;
  font-weight: 500;
}
</style>
