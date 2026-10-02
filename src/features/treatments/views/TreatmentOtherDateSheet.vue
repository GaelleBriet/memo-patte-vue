<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  givenDueDays,
  hourChoices,
  otherDateDue,
  otherDateTexts,
} from '../logic/treatment-other-date'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    name: string
    animal: string
    icon: string
    schedule: TreatmentSchedule
    period: Pick<TreatmentPeriodRecord, 'times'>
    today: string
    min?: string | null
    busy?: boolean
  }>(),
  { min: null, busy: false },
)

const emit = defineEmits<{
  note: [due: Due, givenOn: string]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const step = ref<'day' | 'hour'>('day')
const givenOn = ref<string | null>(props.today)

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 'day'
  givenOn.value = props.today
})

const severalTimes = computed(() => props.period.times.length > 1)
const texts = computed(() =>
  otherDateTexts(
    t,
    { name: props.name, animal: props.animal, today: props.today },
    givenOn.value ?? props.today,
    severalTimes.value,
  ),
)
const excluded = computed(() => (severalTimes.value ? [] : givenDueDays(props.schedule)))
const dayDue = computed(() =>
  severalTimes.value ? null : otherDateDue(props.schedule, givenOn.value),
)
const choices = computed(() =>
  givenOn.value === null ? [] : hourChoices(t, props.schedule, props.period, givenOn.value),
)

function submitDay(): void {
  if (givenOn.value === null) return
  if (severalTimes.value) step.value = 'hour'
  else if (dayDue.value) emit('note', dayDue.value, givenOn.value)
}

function pick(due: Due | null): void {
  if (due !== null && givenOn.value !== null) emit('note', due, givenOn.value)
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="treatment-other-date"
    :title="step === 'day' ? t('reminderSheet.doneOtherDay') : texts.hourTitle"
    :subtitle="step === 'day' ? texts.daySubtitle : texts.hourSubtitle"
    :close-label="t('reminderSheet.close')"
    :icon="step === 'day' ? icon : null"
    :back-label="step === 'hour' ? t('treatments.detail.otherDate.back') : null"
    :persistent="busy"
    @back="step = 'day'"
  >
    <template v-if="step === 'day'">
      <DateCalendar
        v-model="givenOn"
        class="treatment-other-date__calendar"
        :min="min"
        :max="today"
        :excluded="excluded"
      />
      <v-btn
        class="treatment-other-date__submit"
        variant="flat"
        color="primary"
        :disabled="busy || givenOn === null || (!severalTimes && dayDue === null)"
        @click="submitDay"
      >
        {{ texts.submit }}
      </v-btn>
    </template>

    <div v-else class="treatment-other-date__hours">
      <button
        v-for="choice in choices"
        :key="choice.time"
        type="button"
        class="treatment-other-date__hour"
        :disabled="busy || choice.due === null"
        @click="pick(choice.due)"
      >
        <v-icon icon="ms:schedule" size="22" />
        <span class="treatment-other-date__hour-text">
          <span class="treatment-other-date__hour-label">{{ choice.label }}</span>
          <span class="treatment-other-date__hour-detail">{{ choice.detail }}</span>
        </span>
      </button>
    </div>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-other-date__calendar {
  margin-top: 12px;
}

.treatment-other-date__submit {
  width: 100%;
  height: 52px;
  margin-top: 14px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.treatment-other-date__hours {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
}

.treatment-other-date__hour {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 10px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.treatment-other-date__hour + .treatment-other-date__hour {
  border-top: 1px solid tokens.$color-divider;
}

.treatment-other-date__hour-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.treatment-other-date__hour-label {
  font-size: 15.5px;
  font-weight: 600;
}

.treatment-other-date__hour-detail {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}
</style>
