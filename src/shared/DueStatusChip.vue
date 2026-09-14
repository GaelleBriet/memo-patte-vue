<script lang="ts">
import type { ReminderStatus } from '@/shared/reminders'

/** `none` est le style neutre : « Pas de rappel », et badge de fréquence des traitements. */
export type DueStatus = ReminderStatus | 'up-to-date' | 'none'
</script>

<script setup lang="ts">
defineProps<{
  status: DueStatus
  label: string
  icon?: string | null
}>()
</script>

<template>
  <span class="due-status-chip" :class="`due-status-chip--${status}`">
    <v-icon v-if="icon" :icon="icon" size="16" />
    <span>{{ label }}</span>
  </span>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.due-status-chip {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

.due-status-chip--overdue {
  background: rgb(var(--v-theme-overdue-container));
  color: rgb(var(--v-theme-on-overdue-container));
}

.due-status-chip--today {
  background: rgb(var(--v-theme-today-container));
  color: rgb(var(--v-theme-on-today-container));
}

.due-status-chip--tomorrow,
.due-status-chip--later {
  background: rgb(var(--v-theme-soon-container));
  color: rgb(var(--v-theme-on-soon-container));
}

.due-status-chip--up-to-date {
  background: tokens.$color-badge-up-to-date-bg;
  color: tokens.$color-badge-up-to-date-text;
}

.due-status-chip--none {
  border: 1px solid tokens.$color-badge-frequency-border;
  background: tokens.$color-badge-frequency-bg;
  color: tokens.$color-badge-frequency-text;
  font-weight: 600;
}
</style>
