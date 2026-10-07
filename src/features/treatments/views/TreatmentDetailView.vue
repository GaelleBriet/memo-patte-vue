<script setup lang="ts">
import { computed, nextTick, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TreatmentChangeDateSheet from './TreatmentChangeDateSheet.vue'
import TreatmentChooseDays from './TreatmentChooseDays.vue'
import TreatmentDoneConfirm from './TreatmentDoneConfirm.vue'
import TreatmentDoseCard from './TreatmentDoseCard.vue'
import TreatmentHistory from './TreatmentHistory.vue'
import TreatmentOtherDateSheet from './TreatmentOtherDateSheet.vue'
import TreatmentStopDialog from './TreatmentStopDialog.vue'
import TreatmentUnloggedPrompt from './TreatmentUnloggedPrompt.vue'
import { useTreatmentDetail } from '../composables/use-treatment-detail'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { detailActions, doseCard, lessPreciseReminder } from '../logic/treatment-card'
import { choiceGestures, chooseDaysSubtitle, type DayChoice } from '../logic/treatment-choose-days'
import type { DoseAction } from '../logic/treatment-dose-writes'
import {
  dateChangeOf,
  doseActionTexts,
  hasSeveralTimes,
  lineAction,
  type DateChange,
} from '../logic/treatment-gestures'
import {
  treatmentDeleteTexts,
  treatmentHistory,
  type DoseLineAction,
  type DoseRow,
} from '../logic/treatment-history'
import { treatmentStopTexts } from '../logic/treatment-sheet'
import {
  dateChangeBox,
  doneGesture,
  restoredSuiteFor,
  type DateChangeBox,
} from '../logic/treatment-shift-box'
import { stopPrompt } from '../logic/treatment-stop'
import { promptChoice, unloggedBanner, type PromptActionId } from '../logic/treatment-unlogged'
import { useExactReminders } from '@/core/notifications/use-exact-reminders'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import ExactRemindersExplainer from '@/shared/components/ExactRemindersExplainer.vue'
import OverflowMenu, { type OverflowMenuItem } from '@/shared/components/OverflowMenu.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { originQuery } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import { takesNewCare } from '@/shared/domain/unfollowed-animals'
import type { DoseGesture, Due, MoveBounds } from '@/shared/domain/treatment-schedule'
import { returnTo } from '@/shared/utils/return-to'

const props = defineProps<{
  id: string
}>()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()

const { treatment, schedule, today, refreshToday, state, unreadable, reload } = useTreatmentDetail(
  () => props.id,
)
const gestures = useTreatmentGestures(() => {
  refreshToday()
  void reload()
})

const animal = computed(() => (treatment.value ? animals.byId(treatment.value.animalId) : null))
const named = computed(() => ({
  name: treatment.value?.name ?? '',
  animal: animal.value?.name ?? '',
}))
const subtitle = computed(() =>
  treatment.value
    ? t('treatments.detail.subtitle', {
        type: t(`treatments.type.${treatment.value.type}`),
        animal: named.value.animal,
      })
    : null,
)
const card = computed(() =>
  treatment.value && schedule.value
    ? doseCard(t, treatment.value, schedule.value, {
        animal: named.value.animal,
        today: today.value,
      })
    : null,
)
const exactReminders = useExactReminders()
const isExplainerOpen = ref(false)
const lessPrecise = computed(() =>
  treatment.value && schedule.value
    ? lessPreciseReminder(t, treatment.value, schedule.value, exactReminders.status.value)
    : null,
)
const unlogged = computed(() =>
  animals.hasLoaded && treatment.value && schedule.value
    ? unloggedBanner(t, treatment.value, schedule.value, today.value, {
        followed: (animal.value?.unfollowedOn ?? null) === null,
      })
    : null,
)
const stopping = computed(() =>
  treatment.value && schedule.value
    ? stopPrompt(t, treatment.value, schedule.value, today.value)
    : null,
)
const choosing = ref<'log' | 'stop'>('log')
const chosen = computed(() => (choosing.value === 'stop' ? stopping.value : unlogged.value))
const chooseDaysSubtitleText = computed(() =>
  chooseDaysSubtitle(named.value.name, named.value.animal, chosen.value?.when ?? null),
)
const history = computed(() =>
  treatment.value && schedule.value
    ? treatmentHistory(t, treatment.value, schedule.value, today.value)
    : null,
)
const actions = computed(() => (schedule.value ? detailActions(schedule.value) : null))
const canResume = computed(() => actions.value?.canResume === true && takesNewCare(animal.value))
const stopTexts = computed(() => treatmentStopTexts(t, named.value))
const deleteTexts = computed(() => treatmentDeleteTexts(t, named.value.name))

const failure = computed(() => {
  if (unreadable.value) return t('treatments.detail.errors.unreadable')
  return state.value === 'not-found'
    ? t('treatments.form.errors.notFound')
    : t('treatments.form.errors.load')
})

const menuItems = computed<OverflowMenuItem[]>(() => [
  { id: 'remove', label: t('treatments.detail.menu.remove'), icon: 'ms:delete', danger: true },
])

const isOtherDateOpen = ref(false)
const isDoneConfirmOpen = ref(false)
const confirming = ref<Due | null>(null)
const isChooseDaysOpen = ref(false)
const isDatePickerOpen = ref(false)
const isStopDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const changing = ref<{ row: DoseRow; change: DateChange; box: DateChangeBox | null } | null>(null)

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

const doseCardRef = useTemplateRef<InstanceType<typeof TreatmentDoseCard>>('doseCard')

watch(
  () => actions.value?.canStop,
  async (canStop, could) => {
    if (could !== true || canStop !== false) return
    await nextTick()
    doseCardRef.value?.focusEnd()
  },
)

function apply(action: DoseAction, line: Due | null, periodId: string): Promise<boolean> {
  if (!treatment.value) return Promise.resolve(false)
  const texts = doseActionTexts(
    t,
    {
      ...named.value,
      today: today.value,
      severalTimes: hasSeveralTimes(treatment.value, periodId),
    },
    action,
    line,
    restoredSuiteFor(treatment.value, action, today.value),
  )
  return gestures.applyDose(treatment.value, action, texts)
}

function note(gesture: DoseGesture): Promise<boolean> {
  return apply({ kind: 'note', gesture }, null, gesture.due.periodId)
}

function done(due: Due): void {
  refreshToday()
  if (!schedule.value) return
  const tapped = doneGesture(schedule.value, due, today.value)
  if (tapped.confirm) {
    confirming.value = due
    isDoneConfirmOpen.value = true
  } else void note(tapped.gesture)
}

async function noteConfirmed(gesture: DoseGesture): Promise<void> {
  if (await note(gesture)) isDoneConfirmOpen.value = false
}

async function noteOtherDate(gesture: DoseGesture): Promise<void> {
  if (await note(gesture)) isOtherDateOpen.value = false
}

function log(choice: DayChoice): Promise<'done' | 'stale' | 'failed'> {
  if (!treatment.value) return Promise.resolve('failed')
  const action: DoseAction = { kind: 'log', gestures: choiceGestures(choice) }
  const texts = doseActionTexts(
    t,
    { ...named.value, today: today.value, severalTimes: false },
    action,
    null,
  )
  return gestures.logDoses(treatment.value, action, texts)
}

function logThenStop(choice: DayChoice): Promise<'done' | 'stale' | 'failed'> {
  if (!treatment.value) return Promise.resolve('failed')
  return gestures.stopLogging(treatment.value, choiceGestures(choice))
}

function chooseDays(purpose: 'log' | 'stop'): void {
  choosing.value = purpose
  isChooseDaysOpen.value = true
}

function onUnloggedAction(action: PromptActionId): void {
  if (!unlogged.value) return
  if (action === 'choose-days') chooseDays('log')
  else void log(promptChoice(action, unlogged.value.dues))
}

function onStopAction(action: PromptActionId): void {
  if (!stopping.value) return
  if (action === 'choose-days') chooseDays('stop')
  else void logThenStop(promptChoice(action, stopping.value.dues))
}

async function logChosenDays(choice: DayChoice): Promise<void> {
  const result = await (choosing.value === 'stop' ? logThenStop(choice) : log(choice))
  if (result !== 'failed') isChooseDaysOpen.value = false
}

function onLineAction(row: DoseRow, choice: DoseLineAction, bounds: MoveBounds | null): void {
  refreshToday()
  const action = lineAction(row.dose, choice, today.value)
  if (action !== null) {
    void apply(action, row.dose, row.dose.periodId)
    return
  }
  const change = dateChangeOf(t, row.dose, bounds, {
    today: today.value,
    earliest: animal.value?.birthDate ?? null,
    limits: schedule.value?.redateLimits(row.dose.id) ?? null,
  })
  if (change === null || !treatment.value || !schedule.value) return
  const box = dateChangeBox(
    t,
    row.dose,
    { history: treatment.value, schedule: schedule.value, today: today.value },
    change.action,
  )
  changing.value = { row, change, box }
  isDatePickerOpen.value = true
}

function changeDate(date: string, shiftsFollowing: boolean): void {
  if (!changing.value) return
  const { row, change } = changing.value
  void apply(change.action(date, shiftsFollowing), row.dose, row.dose.periodId)
}

function stop(): void {
  if (treatment.value) void gestures.stop(treatment.value, t('treatments.sheet.errors.stop'))
}

const isFromHome = computed(() => route.query.from === 'home')

function backToCarnet(): void {
  if (isFromHome.value) {
    returnTo(router, { name: 'home' })
    return
  }
  if (treatment.value) animals.select(treatment.value.animalId)
  returnTo(router, { name: 'animals' })
}

function edit(): void {
  void router.push({ name: 'treatment-edit', params: { id: props.id }, query: originQuery(route) })
}

function resume(): void {
  void router.push({
    name: 'treatment-resume',
    params: { id: props.id },
    query: originQuery(route),
  })
}

async function remove(): Promise<void> {
  if (treatment.value && (await gestures.removeTreatment(treatment.value))) backToCarnet()
}
</script>

<template>
  <PushedScreen
    class="treatment-detail"
    :title="treatment?.name ?? ''"
    :subtitle="subtitle"
    subtitle-tone="secondary"
    :back-label="isFromHome ? t('treatments.detail.backHome') : t('treatments.detail.back')"
    @back="backToCarnet"
  >
    <template v-if="treatment" #end>
      <v-btn
        v-if="actions?.canEdit"
        class="treatment-detail__edit"
        icon="ms:edit"
        variant="text"
        color="primary"
        :aria-label="t('reminderSheet.edit')"
        @click="edit"
      />
      <OverflowMenu
        :label="t('history.moreOptions')"
        :items="menuItems"
        @select="isDeleteDialogOpen = true"
      />
    </template>

    <div class="treatment-detail__content">
      <template v-if="treatment && card && history && actions">
        <TreatmentDoseCard
          ref="doseCard"
          :card="card"
          :less-precise="lessPrecise"
          :busy="gestures.isBusy.value"
          @done="done"
          @other-date="isOtherDateOpen = true"
          @reactivate="isExplainerOpen = true"
        />

        <TreatmentUnloggedPrompt
          v-if="unlogged"
          class="treatment-detail__unlogged"
          :prompt="unlogged"
          :busy="gestures.isBusy.value"
          @act="onUnloggedAction"
        />

        <TreatmentHistory :history="history" @select="onLineAction" />

        <button
          v-if="actions.canStop"
          type="button"
          class="treatment-detail__stop"
          :aria-label="stopTexts.stopLabel"
          :disabled="gestures.isBusy.value"
          @click="isStopDialogOpen = true"
        >
          <v-icon icon="ms:do_not_disturb_on" size="22" />
          <span>{{ t('treatments.sheet.stop') }}</span>
        </button>
      </template>

      <p
        v-else-if="state === 'not-found' || state === 'error' || unreadable"
        class="section-card__card treatment-detail__message"
        role="alert"
      >
        {{ failure }}
      </p>

      <div v-else class="treatment-detail__loading">
        <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
      </div>
    </div>

    <TreatmentOtherDateSheet
      v-if="treatment && schedule"
      v-model="isOtherDateOpen"
      :name="named.name"
      :animal="named.animal"
      :icon="reminderIcon('treatment', treatment.type)"
      :history="treatment"
      :schedule="schedule"
      :today="today"
      :min="animal?.birthDate ?? null"
      :busy="gestures.isBusy.value"
      @note="noteOtherDate"
    />

    <TreatmentDoneConfirm
      v-if="treatment && schedule"
      v-model="isDoneConfirmOpen"
      :name="named.name"
      :animal="named.animal"
      :icon="reminderIcon('treatment', treatment.type)"
      :history="treatment"
      :schedule="schedule"
      :today="today"
      :due="confirming"
      :busy="gestures.isBusy.value"
      @note="noteConfirmed"
    />

    <TreatmentChooseDays
      v-model="isChooseDaysOpen"
      :subtitle="chooseDaysSubtitleText"
      :dues="chosen?.dues ?? []"
      :when="chosen?.when ?? ''"
      :stopping="choosing === 'stop'"
      :busy="gestures.isBusy.value"
      @confirm="logChosenDays"
    />

    <TreatmentChangeDateSheet
      v-model="isDatePickerOpen"
      :subtitle="changing?.change.subtitle ?? null"
      :date="changing?.change.date ?? null"
      :min="changing?.change.min ?? null"
      :max="changing?.change.max ?? null"
      :excluded="changing?.change.excluded ?? []"
      :box="changing?.box ?? null"
      :busy="gestures.isBusy.value"
      @save="changeDate"
    />

    <TreatmentStopDialog
      v-if="stopping"
      v-model="isStopDialogOpen"
      :prompt="stopping"
      @stop="stop"
      @act="onStopAction"
    />

    <ConfirmDialog
      v-model="isDeleteDialogOpen"
      :title="deleteTexts.title"
      :text="deleteTexts.text"
      :cancel-label="deleteTexts.cancel"
      :confirm-label="deleteTexts.confirm"
      @confirm="remove"
    />

    <ExactRemindersExplainer
      v-if="lessPrecise"
      v-model="isExplainerOpen"
      :back-label="t('treatments.detail.reminder.explainerBack', { name: named.name })"
    />

    <template v-if="treatment && canResume" #actions>
      <div class="treatment-detail__resume">
        <p class="treatment-detail__resume-hint">{{ t('treatments.detail.resumeHint') }}</p>
        <v-btn
          class="treatment-detail__resume-button"
          variant="outlined"
          color="primary"
          prepend-icon="ms:restart_alt"
          block
          @click="resume"
        >
          {{ t('treatments.detail.resume') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-detail__content {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 12px 0 32px;
}

.treatment-detail__edit {
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
}

.treatment-detail__unlogged {
  margin-inline: tokens.$padding-section-inline;
}

.treatment-detail__stop {
  display: flex;
  align-items: center;
  gap: 12px;
  align-self: flex-start;
  margin-inline: tokens.$padding-section-inline;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  min-height: tokens.$size-tap-target;
  font-size: 15.5px;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}

.treatment-detail__message {
  margin: 0 tokens.$padding-section-inline;
  padding: 16px 20px;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.treatment-detail__loading {
  display: flex;
  justify-content: center;
  padding-block: 48px;
}

.treatment-detail__resume {
  padding: 12px 20px 30px;
}

.treatment-detail__resume-hint {
  margin: 0 0 12px;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.treatment-detail__resume-button {
  height: 52px;
  border-width: 1.5px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
