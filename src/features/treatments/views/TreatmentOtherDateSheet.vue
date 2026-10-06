<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentHourChoices from './TreatmentHourChoices.vue'
import TreatmentShiftCheckbox from './TreatmentShiftCheckbox.vue'
import { hasSeveralTimes } from '../logic/treatment-gestures'
import {
  givenDays,
  notifiedPlan,
  otherDatePlan,
  otherDateTexts,
} from '../logic/treatment-other-date'
import { otherDateBox, otherDateNote, otherDateRecap } from '../logic/treatment-shift-box'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import type { DoseGesture, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    name: string
    animal: string
    icon: string
    history: TreatmentWithHistory
    schedule: TreatmentSchedule
    today: string
    min?: string | null
    busy?: boolean
    /** « Donnée quand ? » : l'échéance de la notification, que le jour choisi ne change pas. */
    notified?: NotifiedDue | null
  }>(),
  { min: null, busy: false, notified: null },
)

const emit = defineEmits<{
  note: [gesture: DoseGesture]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const step = ref<'day' | 'hour'>('day')
const givenOn = ref<string | null>(props.today)
const hour = ref<string | null>(null)
const shifts = ref(true)

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 'day'
  givenOn.value = props.today
})

watch([givenOn, step], () => {
  hour.value = null
  shifts.value = true
})

const plan = computed(() => {
  if (givenOn.value === null) return null
  return props.notified === null
    ? otherDatePlan(t, props.schedule, givenOn.value)
    : notifiedPlan(t, props.schedule, props.notified)
})
const severalTimes = computed(() => (plan.value?.hours.length ?? 0) > 0)
const texts = computed(() =>
  otherDateTexts(
    t,
    { name: props.name, animal: props.animal, today: props.today },
    givenOn.value ?? props.today,
    severalTimes.value,
  ),
)
const excluded = computed(() => (props.notified === null ? givenDays(props.schedule) : []))
const due = computed(() => {
  if (step.value === 'day') return severalTimes.value ? null : (plan.value?.due ?? null)
  return plan.value?.hours.find(({ time }) => time === hour.value)?.due ?? null
})
const recap = computed(() =>
  otherDateRecap(
    t,
    due.value,
    givenOn.value,
    due.value !== null && hasSeveralTimes(props.history, due.value.periodId),
  ),
)
const box = computed(() =>
  otherDateBox(
    t,
    due.value,
    givenOn.value,
    { history: props.history, schedule: props.schedule, today: props.today },
    shifts.value,
  ),
)

const gesture = computed(() => otherDateNote(due.value, givenOn.value, box.value, shifts.value))

function submit(): void {
  if (givenOn.value === null || plan.value === null) return
  if (step.value === 'day' && severalTimes.value) {
    step.value = 'hour'
    return
  }
  if (gesture.value !== null) emit('note', gesture.value)
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
    <DateCalendar
      v-if="step === 'day'"
      v-model="givenOn"
      class="treatment-other-date__calendar"
      :min="min"
      :max="today"
      :excluded="excluded"
    />
    <TreatmentHourChoices
      v-else
      v-model="hour"
      :hours="plan?.hours ?? []"
      :busy="busy"
      selectable
    />

    <p v-if="recap" class="treatment-other-date__recap">
      <v-icon icon="ms:event_available" size="22" />
      <span>{{ recap }}</span>
    </p>
    <TreatmentShiftCheckbox
      v-if="box.shown"
      v-model="shifts"
      class="treatment-other-date__shift"
      :help="box.help"
    />

    <v-btn
      class="treatment-other-date__submit"
      variant="flat"
      color="primary"
      :disabled="busy || plan === null || (!(step === 'day' && severalTimes) && gesture === null)"
      @click="submit"
    >
      {{ step === 'hour' ? t('treatments.shift.save') : texts.submit }}
    </v-btn>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-other-date__calendar {
  margin-top: 12px;
}

.treatment-other-date__recap {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  margin: 12px 0 0;
  padding: 12px 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
  font-size: 15px;
  font-weight: 600;
  line-height: 1.4;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-other-date__shift {
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
</style>
