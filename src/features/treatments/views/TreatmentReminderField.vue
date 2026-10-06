<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { ReminderOffsetMinutes } from '../schema/treatment-period.schema'
import { DEFAULT_REMINDER_TIME } from '@/shared/domain/reminder-plan'
import { formatClockTime } from '@/shared/utils/format'

const props = defineProps<{
  hasTimes: boolean
  offset: ReminderOffsetMinutes | null
  time: string | null
  choices: readonly ReminderOffsetMinutes[]
  lessPrecise: boolean
  suggestsExact: boolean
  labelId: string
  describedby?: string
}>()

const emit = defineEmits<{
  'update:offset': [offset: ReminderOffsetMinutes]
  'update:time': [time: string]
  explain: []
}>()

const { t } = useI18n()

const selected = computed(() => props.offset ?? 0)
const shownTime = computed(() => formatClockTime(props.time ?? DEFAULT_REMINDER_TIME))

function changeTime(event: Event): void {
  const { value } = event.target as HTMLInputElement
  if (value !== '') emit('update:time', value)
}
</script>

<template>
  <div class="treatment-reminder">
    <template v-if="hasTimes">
      <div
        class="treatment-reminder__choices"
        role="radiogroup"
        :aria-labelledby="labelId"
        :aria-describedby="describedby"
      >
        <button
          v-for="choice in choices"
          :key="choice"
          type="button"
          role="radio"
          class="treatment-reminder__choice"
          :class="{ 'treatment-reminder__choice--selected': selected === choice }"
          :aria-checked="selected === choice"
          @click="emit('update:offset', choice)"
        >
          <v-icon v-if="selected === choice" icon="ms:check" size="18" />
          {{ t(`treatments.form.reminder.offset.${choice}`) }}
        </button>
      </div>

      <div v-if="lessPrecise" class="treatment-reminder__less-precise">
        <v-icon icon="ms:alarm_off" size="18" />
        <div>
          <p>{{ t('treatments.form.reminder.lessPrecise') }}</p>
          <button type="button" class="treatment-reminder__link" @click="emit('explain')">
            {{ t('treatments.form.reminder.reactivate') }}
            <v-icon icon="ms:chevron_right" size="18" />
          </button>
        </div>
      </div>

      <button
        v-else-if="suggestsExact"
        type="button"
        class="treatment-reminder__suggest"
        @click="emit('explain')"
      >
        <v-icon icon="ms:alarm" size="20" />
        <span>{{ t('treatments.form.reminder.suggest') }}</span>
        <v-icon icon="ms:chevron_right" size="20" />
      </button>
    </template>

    <div v-else class="treatment-reminder__time form-field__input">
      <span aria-hidden="true">{{ t('treatments.form.reminder.at', { time: shownTime }) }}</span>
      <v-icon icon="ms:schedule" size="21" />
      <input
        class="treatment-reminder__time-input"
        type="time"
        :value="time ?? DEFAULT_REMINDER_TIME"
        :aria-label="t('treatments.form.reminder.atLabel', { time: shownTime })"
        :aria-describedby="describedby"
        @change="changeTime"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-reminder__choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.treatment-reminder__choice {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: tokens.$size-tap-target;
  padding: 0 14px;
  border: 1px solid tokens.$color-field-border;
  border-radius: tokens.$radius-pill;
  background: tokens.$color-field-surface;
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 600;
  white-space: nowrap;
}

.treatment-reminder__choice--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;
}

.treatment-reminder__less-precise,
.treatment-reminder__suggest {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  margin-top: 10px;
  padding: 12px 14px;
  border-radius: tokens.$radius-field;
  font-size: 13px;
  line-height: 1.4;
  text-align: start;
}

.treatment-reminder__less-precise {
  border: 1px solid tokens.$color-less-precise-border;
  background: tokens.$color-less-precise-surface;
  color: tokens.$color-less-precise-text;
  font-weight: 600;

  p {
    margin: 0;
  }

  > .v-icon {
    flex: 0 0 auto;
    margin-top: 1px;
  }
}

.treatment-reminder__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-size: 14px;
  font-weight: 700;
}

.treatment-reminder__suggest {
  align-items: center;
  border: 1px solid tokens.$color-exact-reminders-suggest-border;
  background: tokens.$color-exact-reminders-suggest-surface;
  color: rgb(var(--v-theme-primary));
  font-weight: 700;

  > span {
    flex: 1 1 auto;
  }

  > .v-icon {
    flex: 0 0 auto;
  }
}

.treatment-reminder__time {
  display: flex;
  position: relative;
  align-items: center;
  justify-content: space-between;
  height: tokens.$height-field;
  padding: 0 14px 0 16px;
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;

  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

// Le champ natif, invisible, couvre la ligne : la toucher ouvre le sélecteur d'heure du système.
.treatment-reminder__time-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.treatment-reminder__time-input::-webkit-calendar-picker-indicator {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}
</style>
