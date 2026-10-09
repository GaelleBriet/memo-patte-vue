<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentChooseDays from './TreatmentChooseDays.vue'
import TreatmentDoneConfirm from './TreatmentDoneConfirm.vue'
import TreatmentOtherDateSheet from './TreatmentOtherDateSheet.vue'
import TreatmentStopDialog from './TreatmentStopDialog.vue'
import TreatmentUnloggedPrompt from './TreatmentUnloggedPrompt.vue'
import { useTreatmentDoseFlow } from '../composables/use-treatment-dose-flow'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { useTreatmentSheetActions } from '../composables/use-treatment-sheet-actions'
import { detailActions } from '../logic/treatment-card'
import { readableScheduleOf } from '../logic/treatment-schedule-adapter'
import { sheetOtherDateMin, sheetPeriod, treatmentSheetTexts } from '../logic/treatment-sheet'
import { plainStopPrompt } from '../logic/treatment-stop'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import ReminderActions from '@/shared/components/ReminderActions.vue'
import type { NotifiedDue, TodoDue } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import type { Due } from '@/shared/domain/treatment-schedule'
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
const gestures = useTreatmentGestures(() => emit('changed'))

const history = ref<TreatmentWithHistory | null>(null)
const isBusy = gestures.isBusy
const isStopDialogOpen = ref(false)
const isOtherDateOpen = ref(false)
const isConfirmOpen = ref(false)
const confirming = ref<Due | null>(null)

const isShown = computed({
  get: () => open.value && history.value !== null && !isOtherDateOpen.value && !isConfirmOpen.value,
  set: (shown) => {
    if (!shown) open.value = false
  },
})

const schedule = computed(() => readableScheduleOf(history.value, today.value))

const {
  animal,
  named,
  unlogged,
  stopping,
  choosing,
  chosen,
  chooseDaysSubtitleText,
  isChooseDaysOpen,
  stopError,
  note,
  stop,
  onUnloggedAction,
  onStopAction,
  confirmChosenDays,
} = useTreatmentDoseFlow({ treatment: history, schedule, today }, gestures, {
  settled: () => (open.value = false),
  stopFailure: 'message',
})

const icon = computed(() => (history.value ? reminderIcon('treatment', history.value.type) : ''))
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
const stopDialog = computed(() => stopping.value ?? plainStopPrompt(t, named.value.name))
const canStop = computed(() => schedule.value === null || detailActions(schedule.value).canStop)
const otherDateMin = computed(() => {
  const birth = animal.value?.birthDate ?? null
  if (!history.value || !schedule.value || !doseDue.value) return birth
  return sheetOtherDateMin(history.value, schedule.value, doseDue.value, birth)
})

const actions = useTreatmentSheetActions(
  { treatmentId: computed(() => history.value?.id ?? null), schedule, doseDue, today, named },
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

watch(
  open,
  async (isOpen) => {
    if (!isOpen) {
      isOtherDateOpen.value = false
      isConfirmOpen.value = false
      return
    }
    refreshToday()
    stopError.value = null
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

      <p v-if="stopError" class="treatment-reminder-sheet__error" role="alert">
        {{ stopError }}
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
    :prompt="stopDialog"
    @stop="stop"
    @act="onStopAction"
  />

  <TreatmentChooseDays
    v-model="isChooseDaysOpen"
    :subtitle="chooseDaysSubtitleText"
    :dues="chosen?.dues ?? []"
    :when="chosen?.when ?? ''"
    :busy="isBusy"
    :stopping="choosing === 'stop'"
    @confirm="confirmChosenDays"
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
