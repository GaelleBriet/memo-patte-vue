<script setup lang="ts" generic="T extends string">
defineProps<{
  modelValue: T | null
  options: readonly { value: T; label: string }[]
  labelId?: string
}>()

const emit = defineEmits<{
  /** `null` quand l'option cochée est touchée de nouveau : le choix reste facultatif. */
  'update:modelValue': [value: T | null]
}>()
</script>

<template>
  <div class="form-choices" role="radiogroup" :aria-labelledby="labelId">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      role="radio"
      class="form-choices__choice"
      :class="{ 'form-choices__choice--selected': modelValue === option.value }"
      :aria-checked="modelValue === option.value"
      @click="emit('update:modelValue', modelValue === option.value ? null : option.value)"
    >
      <v-icon v-if="modelValue === option.value" icon="ms:check" size="18" />
      {{ option.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.form-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.form-choices__choice {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  min-height: tokens.$size-tap-target;
  padding: 0 14px;
  border: 1px solid tokens.$color-choice-border;
  border-radius: tokens.$radius-pill;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    border-color: rgb(var(--v-theme-primary));
  }
}

.form-choices__choice--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
  color: rgb(var(--v-theme-primary));
}
</style>
