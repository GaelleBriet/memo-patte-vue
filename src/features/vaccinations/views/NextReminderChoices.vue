<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import {
  NEXT_REMINDER_KINDS,
  type NextReminderChoice,
  type NextReminderKind,
} from '../logic/vaccination-done'

defineProps<{
  modelValue: NextReminderChoice | null
  labelId: string
}>()

const emit = defineEmits<{
  /** Tous les raccourcis sauf « Autre date », qui demande d'abord le jour. */
  'update:modelValue': [choice: NextReminderChoice]
  otherDate: []
}>()

const { t } = useI18n()

function choose(kind: NextReminderKind): void {
  if (kind === 'otherDate') emit('otherDate')
  else emit('update:modelValue', { kind })
}
</script>

<template>
  <div class="next-reminder-choices" role="radiogroup" :aria-labelledby="labelId">
    <button
      v-for="kind in NEXT_REMINDER_KINDS"
      :key="kind"
      type="button"
      role="radio"
      class="next-reminder-choices__choice"
      :class="{ 'next-reminder-choices__choice--selected': modelValue?.kind === kind }"
      :aria-checked="modelValue?.kind === kind"
      @click="choose(kind)"
    >
      <v-icon v-if="modelValue?.kind === kind" icon="ms:check" size="18" />
      {{ t(`vaccinations.sheet.done.choices.${kind}`) }}
    </button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.next-reminder-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.next-reminder-choices__choice {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 6px;
  min-height: tokens.$size-tap-target;
  padding: 0 14px;
  border: 1px solid tokens.$color-field-border;
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

.next-reminder-choices__choice--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
  color: rgb(var(--v-theme-primary));
}
</style>
