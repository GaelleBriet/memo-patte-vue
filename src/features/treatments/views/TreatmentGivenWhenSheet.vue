<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentDoneConfirm from './TreatmentDoneConfirm.vue'
import TreatmentHourChoices from './TreatmentHourChoices.vue'
import TreatmentOtherDateSheet from './TreatmentOtherDateSheet.vue'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { alreadyNotedText, doseActionTexts, hasSeveralTimes } from '../logic/treatment-gestures'
import {
  givenWhenMin,
  givenWhenTexts,
  isEveryDay,
  notificationTarget,
} from '../logic/treatment-notification'
import { notifiedPlan, otherDateTexts } from '../logic/treatment-other-date'
import { readableScheduleOf } from '../logic/treatment-schedule'
import { doneGesture } from '../logic/treatment-shift-box'
import type { DoseAction } from '../logic/treatment-dose-writes'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import { useTreatmentsStore } from '../store/treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { dosageText } from '@/shared/domain/dosage'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import type { Due, DoseGesture } from '@/shared/domain/treatment-schedule'
import { showToast } from '@/shared/utils/toast'

const props = defineProps<{
  treatmentId: string | null
  /** L'échéance de la notification touchée. */
  due: NotifiedDue | null
}>()

const emit = defineEmits<{
  /** Une prise ou son annulation a changé le traitement. */
  changed: []
  /** L'échéance n'est plus à noter : à l'accueil d'ouvrir la feuille du soin. */
  unavailable: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()
const { today, refresh: refreshToday } = useToday()
const gestures = useTreatmentGestures(() => emit('changed'))
const isBusy = gestures.isBusy

const history = ref<TreatmentWithHistory | null>(null)
const step = ref<'when' | 'hour'>('when')
const givenOn = ref<string | null>(null)
const isOtherDateOpen = ref(false)
const isConfirmOpen = ref(false)
const confirming = ref<Due | null>(null)

const isShown = computed({
  get: () => open.value && history.value !== null,
  set: (shown) => {
    if (!shown) open.value = false
  },
})

const schedule = computed(() => readableScheduleOf(history.value, today.value))
const plan = computed(() =>
  schedule.value && props.due ? notifiedPlan(t, schedule.value, props.due) : null,
)
const firstDue = computed(
  () => plan.value?.due ?? plan.value?.hours.find(({ due }) => due !== null)?.due ?? null,
)
const period = computed(() =>
  history.value?.periods.find(({ id }) => id === firstDue.value?.periodId),
)
const named = computed(() => ({
  name: history.value?.name ?? '',
  animal: history.value ? (animals.byId(history.value.animalId)?.name ?? '') : '',
}))
const icon = computed(() => (history.value ? reminderIcon('treatment', history.value.type) : ''))
const texts = computed(() =>
  givenWhenTexts(
    t,
    {
      ...named.value,
      today: today.value,
      dosage: period.value ? dosageText(t, period.value) : null,
    },
    plan.value?.due ?? { dueOn: props.due?.dueOn ?? today.value, dueTime: null },
  ),
)
const everyDay = computed(() => period.value !== undefined && isEveryDay(period.value))
const hourTexts = computed(() =>
  otherDateTexts(t, { ...named.value, today: today.value }, givenOn.value ?? today.value, true),
)
const otherDateMin = computed(() => {
  if (!schedule.value || !period.value || !firstDue.value || !history.value) return null
  const birth = animals.byId(history.value.animalId)?.birthDate ?? null
  return givenWhenMin(schedule.value, period.value, firstDue.value, birth)
})

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    refreshToday()
    step.value = 'when'
    givenOn.value = null
    history.value = null
    if (!animals.hasLoaded) void animals.load()
    const id = props.treatmentId
    history.value = id ? await treatments.getWithHistory(id).catch(() => null) : null
    if (!open.value) return
    if (history.value === null) {
      open.value = false
      showToast(t('treatments.form.errors.load'), { tone: 'error' })
      return
    }
    settleUnavailable()
  },
  { immediate: true },
)

// La notification a pu être notée ailleurs entre-temps.
function settleUnavailable(): void {
  const target =
    schedule.value && props.due ? notificationTarget(schedule.value, props.due, today.value) : null
  if (target?.kind === 'given-when') return
  open.value = false
  if (target?.kind === 'already') {
    showToast(alreadyNotedText(t, { ...named.value, today: today.value }, target.givenOn), {
      tone: 'info',
    })
  } else emit('unavailable')
}

function choose(date: string): void {
  givenOn.value = date
  if ((plan.value?.hours.length ?? 0) > 0) {
    step.value = 'hour'
    return
  }
  if (plan.value?.due) proceed(plan.value.due)
}

function proceed(due: Due): void {
  const date = givenOn.value
  if (date === null || schedule.value === null) return
  if (date === due.dueOn) {
    void note({ kind: 'given', due, givenOn: date, shiftsFollowing: false })
    return
  }
  const tapped = doneGesture(schedule.value, due, today.value)
  if (!tapped.confirm) {
    void note(tapped.gesture)
    return
  }
  confirming.value = due
  open.value = false
  isConfirmOpen.value = true
}

function chooseOtherDate(): void {
  open.value = false
  isOtherDateOpen.value = true
}

async function note(gesture: DoseGesture): Promise<void> {
  const current = history.value
  if (current === null) return
  const action: DoseAction = { kind: 'note', gesture }
  const toast = doseActionTexts(
    t,
    {
      ...named.value,
      today: today.value,
      severalTimes: hasSeveralTimes(current, gesture.due.periodId),
    },
    action,
    null,
  )
  if (!(await gestures.applyDose(current, action, toast))) return
  open.value = false
  isConfirmOpen.value = false
  isOtherDateOpen.value = false
}
</script>

<template>
  <BottomSheet
    v-model="isShown"
    class="treatment-given-when"
    :title="step === 'when' ? t('treatments.givenWhen.title') : hourTexts.hourTitle"
    :subtitle="step === 'when' ? texts.subtitle : hourTexts.hourSubtitle"
    :close-label="t('reminderSheet.close')"
    :icon="step === 'when' ? icon : null"
    :back-label="step === 'hour' ? t('treatments.givenWhen.back') : null"
    :persistent="isBusy"
    @back="step = 'when'"
  >
    <template v-if="step === 'when' && props.due">
      <p class="treatment-given-when__due">
        <v-icon icon="ms:event" size="22" />
        <span>{{ texts.due }}</span>
      </p>
      <div class="treatment-given-when__choices">
        <button
          v-if="everyDay"
          type="button"
          class="treatment-given-when__choice"
          :aria-label="texts.everyDay.aria"
          :disabled="isBusy"
          @click="choose(props.due.dueOn)"
        >
          <v-icon icon="ms:event" size="22" />
          <span class="treatment-given-when__label">{{ texts.everyDay.label }}</span>
        </button>
        <template v-else>
          <button
            type="button"
            class="treatment-given-when__choice"
            :aria-label="texts.scheduled.aria"
            :disabled="isBusy"
            @click="choose(props.due.dueOn)"
          >
            <v-icon icon="ms:event" size="22" />
            <span class="treatment-given-when__text">
              <span class="treatment-given-when__label">{{ texts.scheduled.label }}</span>
              <span class="treatment-given-when__detail">{{ texts.scheduled.detail }}</span>
            </span>
          </button>
          <button
            type="button"
            class="treatment-given-when__choice"
            :aria-label="texts.today.aria"
            :disabled="isBusy"
            @click="choose(today)"
          >
            <v-icon icon="ms:today" size="22" />
            <span class="treatment-given-when__text">
              <span class="treatment-given-when__label">{{ texts.today.label }}</span>
              <span class="treatment-given-when__detail">{{ texts.today.detail }}</span>
            </span>
          </button>
          <button
            type="button"
            class="treatment-given-when__choice"
            :aria-label="texts.other.aria"
            :disabled="isBusy"
            @click="chooseOtherDate"
          >
            <v-icon icon="ms:calendar_month" size="22" />
            <span class="treatment-given-when__label">{{ texts.other.label }}</span>
            <v-icon class="treatment-given-when__chevron" icon="ms:chevron_right" size="22" />
          </button>
        </template>
      </div>
      <v-btn
        v-if="everyDay"
        class="treatment-given-when__cancel"
        variant="text"
        color="primary"
        :disabled="isBusy"
        @click="open = false"
      >
        {{ t('form.cancel') }}
      </v-btn>
    </template>
    <TreatmentHourChoices
      v-else-if="step === 'hour'"
      :hours="plan?.hours ?? []"
      :busy="isBusy"
      @pick="proceed"
    />
  </BottomSheet>

  <TreatmentOtherDateSheet
    v-if="history && schedule"
    v-model="isOtherDateOpen"
    :name="named.name"
    :animal="named.animal"
    :icon="icon"
    :history="history"
    :schedule="schedule"
    :today="today"
    :min="otherDateMin"
    :notified="props.due"
    :busy="isBusy"
    @note="note"
  />

  <TreatmentDoneConfirm
    v-if="history && schedule"
    v-model="isConfirmOpen"
    :name="named.name"
    :animal="named.animal"
    :icon="icon"
    :history="history"
    :schedule="schedule"
    :today="today"
    :due="confirming"
    :busy="isBusy"
    @note="note"
  />
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-given-when__due {
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

.treatment-given-when__choices {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
}

.treatment-given-when__choice {
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

.treatment-given-when__choice + .treatment-given-when__choice {
  border-top: 1px solid tokens.$color-divider;
}

.treatment-given-when__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.treatment-given-when__label {
  font-size: 15.5px;
  font-weight: 600;
}

.treatment-given-when__detail {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.treatment-given-when__chevron {
  margin-inline-start: auto;
}

.treatment-given-when__cancel {
  width: 100%;
  margin-top: 8px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;

  @include tap.tap-target;
}
</style>
