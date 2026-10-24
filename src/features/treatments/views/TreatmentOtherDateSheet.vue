<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentExtraQuestion from './TreatmentExtraQuestion.vue'
import TreatmentHourChoices from './TreatmentHourChoices.vue'
import TreatmentShiftCheckbox from './TreatmentShiftCheckbox.vue'
import { notifiedPlan, otherDateTexts } from '../logic/treatment-other-date'
import { otherDateSheetPlan } from '../logic/treatment-other-date-sheet'
import { otherDateBox, otherDateNote } from '../logic/treatment-shift-box'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { ExtraAnswer } from '@/shared/domain/dose-calendar'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import type { NoteGesture } from '../logic/treatment-dose-change'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

const props = withDefaults(
  defineProps<{
    name: string
    animal: string
    icon: string
    treatment: TreatmentWithPeriods
    reading: TreatmentReading
    today: string
    min?: string | null
    busy?: boolean
    /** « Donnée quand ? » : l'échéance de la notification, que le jour choisi ne change pas. */
    notified?: NotifiedDue | null
    /** Feuille du soin : une échéance notée oubliée repasse en donnée (TR-22). */
    reopensMissed?: boolean
    /** Fiche : l'échéance de la carte, ou sa journée à plusieurs heures, que le jour choisi ne change pas (Q28). */
    target?: NotifiedDue | null
    /** Flèche de l'étape du jour, qui émet `back` : la feuille qui l'a ouverte reprend la main. */
    backLabel?: string | null
  }>(),
  {
    min: null,
    busy: false,
    notified: null,
    reopensMissed: false,
    target: null,
    backLabel: null,
  },
)

const emit = defineEmits<{
  note: [gesture: NoteGesture]
  back: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const step = ref<'day' | 'hour'>('day')
const givenOn = ref<string | null>(props.today)
const hour = ref<string | null>(null)
const shifts = ref(true)
const answer = ref<ExtraAnswer | null>(null)

const named = computed(() => props.target ?? props.notified)
const plan = computed(() => {
  if (givenOn.value === null || named.value === null) return null
  return notifiedPlan(t, props.reading.view, named.value, props.reopensMissed)
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
const due = computed(() => {
  if (step.value === 'day') return severalTimes.value ? null : (plan.value?.due ?? null)
  return plan.value?.hours.find(({ time }) => time === hour.value)?.due ?? null
})
const sheet = computed(() =>
  otherDateSheetPlan(t, {
    treatment: props.treatment,
    reading: props.reading,
    today: props.today,
    min: props.min,
    target: props.target,
    due: due.value,
    givenOn: givenOn.value,
    answer: answer.value,
    shifts: shifts.value,
  }),
)
const box = computed(() =>
  otherDateBox(
    t,
    due.value,
    givenOn.value,
    { treatment: props.treatment, reading: props.reading, today: props.today },
    shifts.value,
    sheet.value.asked,
  ),
)

const gesture = computed(() =>
  otherDateNote(due.value, givenOn.value, box.value, shifts.value, sheet.value.asked),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 'day'
  givenOn.value = props.today
})

watch([givenOn, step], () => {
  hour.value = null
})

watch([givenOn, step, hour], () => {
  shifts.value = true
  answer.value = null
})

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
    :back-label="step === 'hour' ? t('treatments.detail.otherDate.back') : backLabel"
    :persistent="busy"
    @back="step === 'hour' ? (step = 'day') : emit('back')"
  >
    <DateCalendar
      v-if="step === 'day'"
      v-model="givenOn"
      class="treatment-other-date__calendar"
      :min="sheet.min"
      :max="today"
      :excluded="sheet.excluded"
    />
    <TreatmentHourChoices
      v-else
      v-model="hour"
      :hours="plan?.hours ?? []"
      :busy="busy"
      selectable
    />
    <p v-if="step === 'day' && sheet.earlierHelp" class="treatment-other-date__earlier">
      {{ t('treatments.detail.otherDate.earlierHelp') }}
    </p>

    <TreatmentExtraQuestion v-if="sheet.question" v-model="answer" :question="sheet.question" />
    <p v-if="sheet.recap" class="treatment-other-date__recap">
      <v-icon icon="ms:event_available" size="22" />
      <span>{{ sheet.recap }}</span>
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

.treatment-other-date__earlier {
  margin: 8px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  line-height: 1.45;
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
