<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import TreatmentDoseCard from './TreatmentDoseCard.vue'
import TreatmentHistory from './TreatmentHistory.vue'
import TreatmentOtherDateSheet from './TreatmentOtherDateSheet.vue'
import { useTreatmentDetail } from '../composables/use-treatment-detail'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { detailActions, doseCard } from '../logic/treatment-card'
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
import { currentPeriodOf } from '../logic/treatment-schedule'
import { treatmentStopTexts } from '../logic/treatment-sheet'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import OverflowMenu, { type OverflowMenuItem } from '@/shared/components/OverflowMenu.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import { originQuery } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import type { Due, MoveBounds } from '@/shared/domain/treatment-schedule'
import { returnTo } from '@/shared/utils/return-to'

const props = defineProps<{
  id: string
}>()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()

const { treatment, schedule, today, state, unreadable, reload } = useTreatmentDetail(() => props.id)
const gestures = useTreatmentGestures(() => void reload())

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
const period = computed(() =>
  treatment.value && schedule.value ? currentPeriodOf(treatment.value, schedule.value) : null,
)
const card = computed(() =>
  treatment.value && schedule.value
    ? doseCard(t, treatment.value, schedule.value, {
        animal: named.value.animal,
        today: today.value,
      })
    : null,
)
const history = computed(() =>
  treatment.value && schedule.value ? treatmentHistory(t, treatment.value, schedule.value) : null,
)
const actions = computed(() => (schedule.value ? detailActions(schedule.value) : null))
const stopTexts = computed(() => treatmentStopTexts(t, named.value))
const deleteTexts = computed(() => treatmentDeleteTexts(t, named.value.name))

const menuItems = computed<OverflowMenuItem[]>(() => [
  { id: 'remove', label: t('treatments.detail.menu.remove'), icon: 'ms:delete', danger: true },
])

const isOtherDateOpen = ref(false)
const isDatePickerOpen = ref(false)
const isStopDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const changing = ref<{ row: DoseRow; change: DateChange } | null>(null)

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

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
  )
  return gestures.applyDose(treatment.value, action, texts)
}

function note(due: Due, givenOn: string): Promise<boolean> {
  return apply({ kind: 'note', gesture: { kind: 'given', due, givenOn } }, null, due.periodId)
}

async function noteOtherDate(due: Due, givenOn: string): Promise<void> {
  if (await note(due, givenOn)) isOtherDateOpen.value = false
}

function onLineAction(row: DoseRow, choice: DoseLineAction, bounds: MoveBounds | null): void {
  const action = lineAction(row.dose, choice)
  if (action !== null) {
    void apply(action, row.dose, row.dose.periodId)
    return
  }
  const change = dateChangeOf(t, row.dose, bounds, {
    today: today.value,
    earliest: animal.value?.birthDate ?? null,
  })
  if (change === null) return
  changing.value = { row, change }
  isDatePickerOpen.value = true
}

function changeDate(date: string): void {
  if (!changing.value) return
  const { row, change } = changing.value
  void apply(change.action(date), row.dose, row.dose.periodId)
}

function stop(): void {
  if (treatment.value) void gestures.stop(treatment.value, t('treatments.sheet.errors.stop'))
}

function backToCarnet(): void {
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
    :back-label="t('treatments.detail.back')"
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
          :card="card"
          :busy="gestures.isBusy.value"
          @done="note($event, today)"
          @other-date="isOtherDateOpen = true"
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
        {{
          state === 'not-found'
            ? t('treatments.form.errors.notFound')
            : t('treatments.form.errors.load')
        }}
      </p>

      <div v-else class="treatment-detail__loading">
        <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
      </div>
    </div>

    <TreatmentOtherDateSheet
      v-if="treatment && schedule && period"
      v-model="isOtherDateOpen"
      :name="named.name"
      :animal="named.animal"
      :icon="reminderIcon('treatment', treatment.type)"
      :schedule="schedule"
      :period="period"
      :today="today"
      :min="animal?.birthDate ?? null"
      :busy="gestures.isBusy.value"
      @note="noteOtherDate"
    />

    <DatePickerSheet
      v-model="isDatePickerOpen"
      :title="t('history.changeDate')"
      :subtitle="changing?.change.subtitle"
      :close-label="t('reminderSheet.close')"
      :date="changing?.change.date ?? null"
      :min="changing?.change.min ?? null"
      :max="changing?.change.max ?? null"
      @pick="changeDate"
    />

    <ConfirmDialog
      v-model="isStopDialogOpen"
      :title="stopTexts.stopDialog.title"
      :text="t('treatments.sheet.stopDialog.text')"
      :cancel-label="t('treatments.sheet.stopDialog.cancel')"
      :confirm-label="t('treatments.sheet.stopDialog.confirm')"
      :cancel-aria-label="stopTexts.stopDialog.cancelLabel"
      :confirm-aria-label="stopTexts.stopDialog.confirmLabel"
      @confirm="stop"
    />

    <ConfirmDialog
      v-model="isDeleteDialogOpen"
      :title="deleteTexts.title"
      :text="deleteTexts.text"
      :cancel-label="deleteTexts.cancel"
      :confirm-label="deleteTexts.confirm"
      @confirm="remove"
    />

    <template v-if="treatment && actions?.canResume" #actions>
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
