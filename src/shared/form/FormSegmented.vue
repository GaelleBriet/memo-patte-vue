<script lang="ts">
export interface SegmentedOption<T extends string = string> {
  value: T
  label: string
}
</script>

<script setup lang="ts" generic="T extends string">
const props = defineProps<{
  modelValue: T | null
  options: readonly SegmentedOption<T>[]
  labelId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: T | null]
}>()

function select(value: unknown): void {
  emit('update:modelValue', props.options.find((option) => option.value === value)?.value ?? null)
}
</script>

<template>
  <v-btn-toggle
    class="form-segmented"
    role="radiogroup"
    :aria-labelledby="labelId"
    divided
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
    >
      <v-icon v-if="modelValue === option.value" icon="ms:check" size="18" />
      <span>{{ option.label }}</span>
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

// Pas de `:deep(.v-btn)` : sa spécificité surclasserait la couleur de l'option cochée.
.form-segmented__option {
  flex: 1 1 0;
  height: 100%;
  gap: 6px;
  border-radius: 0;
  color: tokens.$color-segment-inactive;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: normal;
}

.form-segmented__option--selected {
  color: tokens.$color-segment-selected;
  font-weight: 700;
}
</style>
