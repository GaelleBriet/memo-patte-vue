<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentHourChoices from './TreatmentHourChoices.vue'
import { givenDays, otherDatePlan, otherDateTexts } from '../logic/treatment-other-date'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    name: string
    animal: string
    icon: string
    schedule: TreatmentSchedule
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

const plan = computed(() =>
  givenOn.value === null ? null : otherDatePlan(t, props.schedule, givenOn.value),
)
const severalTimes = computed(() => (plan.value?.hours.length ?? 0) > 0)
const texts = computed(() =>
  otherDateTexts(
    t,
    { name: props.name, animal: props.animal, today: props.today },
    givenOn.value ?? props.today,
    severalTimes.value,
  ),
)
const excluded = computed(() => givenDays(props.schedule))

function submitDay(): void {
  if (givenOn.value === null || plan.value === null) return
  if (severalTimes.value) step.value = 'hour'
  else if (plan.value.due) emit('note', plan.value.due, givenOn.value)
}

function pick(due: Due): void {
  if (givenOn.value !== null) emit('note', due, givenOn.value)
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
        :disabled="busy || plan === null || (!severalTimes && plan.due === null)"
        @click="submitDay"
      >
        {{ texts.submit }}
      </v-btn>
    </template>

    <TreatmentHourChoices v-else :hours="plan?.hours ?? []" :busy="busy" @pick="pick" />
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
</style>
