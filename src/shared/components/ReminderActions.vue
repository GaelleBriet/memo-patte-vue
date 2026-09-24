<script setup lang="ts">
import { useI18n } from 'vue-i18n'

withDefaults(
  defineProps<{
    /** « Prochaine dose le 28 sept. » ; absent, la ligne n'est pas affichée. */
    dueText?: string | null
    doneTodayAriaLabel: string
    editHint: string
    busy?: boolean
  }>(),
  { dueText: null, busy: false },
)

const emit = defineEmits<{
  doneToday: []
  otherDate: []
  edit: []
}>()

defineSlots<{
  footer?(): unknown
}>()

const { t } = useI18n()
</script>

<template>
  <div class="reminder-actions">
    <p v-if="dueText" class="reminder-actions__due">
      <v-icon icon="ms:event" size="22" />
      <span>{{ dueText }}</span>
    </p>

    <v-btn
      class="reminder-actions__done-today"
      variant="flat"
      color="primary"
      :aria-label="doneTodayAriaLabel"
      :disabled="busy"
      @click="emit('doneToday')"
    >
      <v-progress-circular
        v-if="busy"
        class="reminder-actions__spinner"
        indeterminate
        :size="18"
        :width="2"
      />
      <v-icon v-else icon="ms:check" size="22" />
      {{ t('reminderSheet.doneToday') }}
    </v-btn>

    <div class="reminder-actions__card">
      <button
        type="button"
        class="reminder-actions__row reminder-actions__row--other-date"
        :disabled="busy"
        @click="emit('otherDate')"
      >
        <v-icon class="reminder-actions__row-icon" icon="ms:history" size="22" />
        <span class="reminder-actions__row-text">
          <span class="reminder-actions__row-label">{{ t('reminderSheet.doneOtherDay') }}</span>
        </span>
        <v-icon class="reminder-actions__chevron" icon="ms:chevron_right" size="22" />
      </button>
      <button
        type="button"
        class="reminder-actions__row reminder-actions__row--edit"
        :disabled="busy"
        @click="emit('edit')"
      >
        <v-icon class="reminder-actions__row-icon" icon="ms:edit_calendar" size="22" />
        <span class="reminder-actions__row-text">
          <span class="reminder-actions__row-label">{{ t('reminderSheet.edit') }}</span>
          <span class="reminder-actions__row-hint">{{ editHint }}</span>
        </span>
        <v-icon class="reminder-actions__chevron" icon="ms:chevron_right" size="22" />
      </button>
    </div>

    <div v-if="$slots.footer" class="reminder-actions__footer">
      <slot name="footer" />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.reminder-actions__due {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 0 0;
  font-size: 15.5px;
  font-weight: 600;

  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.reminder-actions__done-today {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 18px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.reminder-actions__spinner {
  margin-inline-end: 4px;
}

.reminder-actions__card {
  margin-top: 12px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
}

.reminder-actions__row {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 58px;
  padding: 10px 16px 10px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  @media (hover: hover) {
    &:hover {
      background: rgba(var(--v-theme-primary), 0.04);
    }
  }

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.reminder-actions__row + .reminder-actions__row {
  border-top: 1px solid tokens.$color-divider;
}

.reminder-actions__row-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.reminder-actions__row-text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.reminder-actions__row-label {
  font-size: 15.5px;
  font-weight: 600;
}

.reminder-actions__row-hint {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.reminder-actions__chevron {
  flex: 0 0 auto;
  color: tokens.$color-settings-chevron;
}

.reminder-actions__footer {
  margin-top: 14px;
  padding-top: 6px;
  border-top: 1px solid tokens.$color-divider;
}
</style>
