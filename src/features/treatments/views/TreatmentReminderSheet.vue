<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentChooseDays from './TreatmentChooseDays.vue'
import TreatmentDoneConfirm from './TreatmentDoneConfirm.vue'
import TreatmentOtherDateSheet from './TreatmentOtherDateSheet.vue'
import TreatmentStopDialog from './TreatmentStopDialog.vue'
import TreatmentUnloggedPrompt from './TreatmentUnloggedPrompt.vue'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { useTreatmentSheetActions } from '../composables/use-treatment-sheet-actions'
import { detailActions } from '../logic/treatment-card'
import { choiceGestures, chooseDaysSubtitle, type DayChoice } from '../logic/treatment-choose-days'
import type { DoseAction } from '../logic/treatment-dose-writes'
import { doseActionTexts, hasSeveralTimes } from '../logic/treatment-gestures'
import { readableScheduleOf } from '../logic/treatment-schedule'
import { sheetOtherDateMin, sheetPeriod, treatmentSheetTexts } from '../logic/treatment-sheet'
import { stopPrompt } from '../logic/treatment-stop'
import { promptChoice, unloggedBanner, type PromptActionId } from '../logic/treatment-unlogged'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import { useTreatmentsStore } from '../store/treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import ReminderActions from '@/shared/components/ReminderActions.vue'
import type { NotifiedDue, TodoDue } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import type { DoseGesture, Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { showToast } from '@/shared/utils/toast'

const props = withDefaults(
  defineProps<{
    treatmentId: string | null
    /** L'échéance de la ligne touchée dans « À faire », ou ses doses non renseignées. */
    due?: TodoDue | null
  }>(),
  { due: null },
)

const emit = defineEmits<{
  /** Une prise, un arrêt ou leur annulation a changé le traitement. */
  changed: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()
const { today, refresh: refreshToday } = useToday()

const history = ref<TreatmentWithHistory | null>(null)
const gestures = useTreatmentGestures(() => emit('changed'))
const isBusy = gestures.isBusy
const errorMessage = ref<string | null>(null)
const isStopDialogOpen = ref(false)
const isOtherDateOpen = ref(false)
const isConfirmOpen = ref(false)
const confirming = ref<Due | null>(null)
const isChooseDaysOpen = ref(false)
const choosing = ref<'log' | 'stop'>('log')

const isShown = computed({
  get: () => open.value && history.value !== null && !isOtherDateOpen.value && !isConfirmOpen.value,
  set: (shown) => {
    if (!shown) open.value = false
  },
})

const schedule = computed(() => readableScheduleOf(history.value, today.value))
const animal = computed(() => (history.value ? animals.byId(history.value.animalId) : null))
const named = computed(() => ({
  name: history.value?.name ?? '',
  animal: animal.value?.name ?? '',
}))
const icon = computed(() => (history.value ? reminderIcon('treatment', history.value.type) : ''))
const unlogged = computed(() =>
  history.value && schedule.value
    ? unloggedBanner(t, history.value, schedule.value, today.value)
    : null,
)
const isUnloggedSheet = computed(() => props.due === 'unlogged' && unlogged.value !== null)
const doseDue = computed<NotifiedDue | null>(() => {
  if (props.due !== null && props.due !== 'unlogged') return props.due
  const [current] = schedule.value?.currentDoses ?? []
  return current === undefined ? null : { dueOn: current.dueOn, dueTime: current.dueTime }
})
const texts = computed(() =>
  history.value
    ? treatmentSheetTexts(
        t,
        history.value,
        sheetPeriod(history.value, schedule.value, props.due),
        isUnloggedSheet.value ? 'unlogged' : doseDue.value,
        { animal: named.value.animal, today: today.value },
      )
    : null,
)
// Traitement illisible : la confirmation simple, sans dose à renseigner.
const NO_SCHEDULE: Pick<TreatmentSchedule, 'phase' | 'currentDoses' | 'unloggedDoses'> = {
  phase: 'upcoming',
  currentDoses: [],
  unloggedDoses: [],
}
const stopping = computed(() =>
  stopPrompt(
    t,
    history.value ?? { name: named.value.name, periods: [] },
    schedule.value ?? NO_SCHEDULE,
    today.value,
  ),
)
const canStop = computed(() => schedule.value === null || detailActions(schedule.value).canStop)
const chosen = computed(() => (choosing.value === 'stop' ? stopping.value : unlogged.value))
const otherDateMin = computed(() => {
  const birth = animal.value?.birthDate ?? null
  if (!history.value || !schedule.value || !doseDue.value) return birth
  return sheetOtherDateMin(history.value, schedule.value, doseDue.value, birth)
})

watch(
  open,
  async (isOpen) => {
    if (!isOpen) {
      isOtherDateOpen.value = false
      isConfirmOpen.value = false
      return
    }
    refreshToday()
    errorMessage.value = null
    history.value = null
    if (!animals.hasLoaded) void animals.load()
    const id = props.treatmentId
    history.value = id ? await treatments.getWithHistory(id).catch(() => null) : null
    if (history.value === null && open.value) {
      open.value = false
      showToast(t('treatments.form.errors.load'), { tone: 'error' })
    }
  },
  { immediate: true },
)

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
  if (await gestures.applyDose(current, action, toast)) open.value = false
}

const actions = useTreatmentSheetActions(
  { schedule, doseDue, today, named },
  {
    note: (gesture) => void note(gesture),
    confirm: (due) => {
      confirming.value = due
      isConfirmOpen.value = true
    },
    close: () => (open.value = false),
    changed: () => emit('changed'),
  },
)

function doneToday(): void {
  refreshToday()
  if (!isBusy.value) actions.doneToday()
}

function onChildModel(shown: boolean): void {
  if (shown) return
  isOtherDateOpen.value = false
  isConfirmOpen.value = false
  open.value = false
}

async function log(choice: DayChoice): Promise<void> {
  const current = history.value
  if (current === null) return
  const action: DoseAction = { kind: 'log', gestures: choiceGestures(choice) }
  const toast = doseActionTexts(
    t,
    { ...named.value, today: today.value, severalTimes: false },
    action,
    null,
  )
  if ((await gestures.logDoses(current, action, toast)) === 'failed') return
  isChooseDaysOpen.value = false
  open.value = false
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

async function stop(): Promise<void> {
  const current = history.value
  if (isBusy.value || current === null) return
  errorMessage.value = null
  if (await gestures.stop(current)) open.value = false
  else errorMessage.value = t('treatments.sheet.errors.stop')
}

async function logThenStop(choice: DayChoice): Promise<void> {
  const current = history.value
  if (isBusy.value || current === null) return
  errorMessage.value = null
  const result = await gestures.stopLogging(current, choiceGestures(choice))
  if (result === 'failed') {
    errorMessage.value = t('treatments.sheet.errors.stop')
    return
  }
  isChooseDaysOpen.value = false
  open.value = false
}

function onStopAction(action: PromptActionId): void {
  if (action === 'choose-days') chooseDays('stop')
  else void logThenStop(promptChoice(action, stopping.value.dues))
}

function onChosenDays(choice: DayChoice): void {
  void (choosing.value === 'stop' ? logThenStop(choice) : log(choice))
}

function edit(): void {
  if (history.value !== null) void actions.edit(history.value.id, props.due)
}
</script>

<template>
  <BottomSheet
    v-model="isShown"
    class="treatment-reminder-sheet"
    :title="named.name"
    :subtitle="texts?.subtitle"
    :close-label="t('reminderSheet.close')"
    :icon="icon || null"
    :persistent="isBusy"
  >
    <template v-if="history && texts">
      <TreatmentUnloggedPrompt
        v-if="isUnloggedSheet && unlogged"
        class="treatment-reminder-sheet__unlogged"
        :prompt="unlogged"
        :busy="isBusy"
        @act="onUnloggedAction"
      />

      <ReminderActions
        v-else
        :due-text="texts.due"
        :done-today-aria-label="texts.doneTodayLabel"
        :edit-hint="t('treatments.sheet.editHint')"
        :busy="isBusy"
        @done-today="doneToday"
        @other-date="isOtherDateOpen = true"
        @edit="edit"
      >
        <template v-if="unlogged || canStop" #footer>
          <TreatmentUnloggedPrompt
            v-if="unlogged"
            class="treatment-reminder-sheet__unlogged treatment-reminder-sheet__unlogged--compact"
            variant="compact"
            :prompt="unlogged"
            :busy="isBusy"
            @act="onUnloggedAction"
          />
          <button
            v-if="canStop"
            type="button"
            class="treatment-reminder-sheet__stop"
            :aria-label="texts.stopLabel"
            :disabled="isBusy"
            @click="isStopDialogOpen = true"
          >
            <v-icon icon="ms:do_not_disturb_on" size="22" />
            <span>{{ t('treatments.sheet.stop') }}</span>
          </button>
        </template>
      </ReminderActions>

      <p v-if="errorMessage" class="treatment-reminder-sheet__error" role="alert">
        {{ errorMessage }}
      </p>
    </template>
  </BottomSheet>

  <TreatmentOtherDateSheet
    v-if="history && schedule"
    :model-value="isOtherDateOpen"
    :name="named.name"
    :animal="named.animal"
    :icon="icon"
    :history="history"
    :schedule="schedule"
    :today="today"
    :min="otherDateMin"
    :notified="doseDue"
    :busy="isBusy"
    :back-label="t('treatments.sheet.otherDay.back')"
    @update:model-value="onChildModel"
    @back="isOtherDateOpen = false"
    @note="note"
  />

  <TreatmentDoneConfirm
    v-if="history && schedule"
    :model-value="isConfirmOpen"
    :name="named.name"
    :animal="named.animal"
    :icon="icon"
    :history="history"
    :schedule="schedule"
    :today="today"
    :due="confirming"
    :busy="isBusy"
    @update:model-value="onChildModel"
    @note="note"
  />

  <TreatmentStopDialog
    v-if="texts"
    v-model="isStopDialogOpen"
    :prompt="stopping"
    @stop="stop"
    @act="onStopAction"
  />

  <TreatmentChooseDays
    v-model="isChooseDaysOpen"
    :subtitle="chooseDaysSubtitle(named.name, named.animal, chosen?.when ?? null)"
    :dues="chosen?.dues ?? []"
    :when="chosen?.when ?? ''"
    :busy="isBusy"
    :stopping="choosing === 'stop'"
    @confirm="onChosenDays"
  />
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-reminder-sheet__unlogged {
  margin-top: 16px;
}

.treatment-reminder-sheet__unlogged--compact {
  margin: 0 0 12px;
}

.treatment-reminder-sheet__stop {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  font-size: 15.5px;
  font-weight: 600;
  text-align: start;
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

.treatment-reminder-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 13px;
  font-weight: 500;
}
</style>
