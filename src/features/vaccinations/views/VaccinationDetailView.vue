<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import VaccinationPastInjectionSheet from './VaccinationPastInjectionSheet.vue'
import VaccinationReminderSheet from './VaccinationReminderSheet.vue'
import { useInjectionGestures } from '../composables/use-injection-gestures'
import { useVaccinationDetail } from '../composables/use-vaccination-detail'
import {
  injectionDatesExcept,
  injectionGestureTexts,
  injectionRows,
  needsNewReminder,
  pastInjectionNeedsReminder,
  vaccinationDeleteTexts,
  vaccinationDetailTexts,
} from '../logic/vaccination-history'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import NextDueCard from '@/shared/components/NextDueCard.vue'
import OverflowMenu, { type OverflowMenuItem } from '@/shared/components/OverflowMenu.vue'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { originQuery } from '@/shared/domain/reminder-route'
import { returnTo } from '@/shared/utils/return-to'

type ReminderQuestion =
  | { for: 'move'; injection: VaccinationInjection; injectedOn: string }
  | { for: 'past'; injectedOn: string }

const props = defineProps<{
  id: string
}>()

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()
const { today } = useToday()

const { data, state, reload } = useVaccinationDetail(() => props.id)
const gestures = useInjectionGestures(() => void reload())

const isDoneSheetOpen = ref(false)
const doneStartAt = ref<'done' | 'other-date'>('done')
const moving = ref<VaccinationInjection | null>(null)
const isDatePickerOpen = ref(false)

const isDeleteDialogOpen = ref(false)
const deleteFromOnlyInjection = ref(false)

const isPastSheetOpen = ref(false)

const reminderQuestion = ref<ReminderQuestion | null>(null)
const isReminderSheetOpen = ref(false)

const vaccination = computed(() => data.value?.vaccination ?? null)
const injections = computed(() => data.value?.injections ?? [])
const animal = computed(() => (vaccination.value ? animals.byId(vaccination.value.animalId) : null))
const texts = computed(() =>
  vaccination.value
    ? vaccinationDetailTexts(t, vaccination.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
        injections: injections.value.length,
        followed: (animal.value?.unfollowedOn ?? null) === null,
      })
    : null,
)
const rows = computed(() => injectionRows(t, injections.value))

const rowItems = computed<OverflowMenuItem[]>(() => [
  { id: 'changeDate', label: t('history.changeDate'), icon: 'ms:edit_calendar' },
  { id: 'remove', label: t('vaccinations.detail.remove'), icon: 'ms:delete', danger: true },
])
const menuItems = computed<OverflowMenuItem[]>(() => [
  { id: 'remove', label: t('vaccinations.detail.menu.remove'), icon: 'ms:delete', danger: true },
])
const movingTexts = computed(() =>
  moving.value ? injectionGestureTexts(t, moving.value.injectedOn, today.value) : null,
)
const excludedDates = computed(() =>
  moving.value ? injectionDatesExcept(injections.value, moving.value.id) : [],
)
const deleteTexts = computed(() =>
  vaccination.value
    ? vaccinationDeleteTexts(t, vaccination.value.name, {
        onlyInjection: deleteFromOnlyInjection.value,
      })
    : null,
)
const takenDates = computed(() => injections.value.map(({ injectedOn }) => injectedOn))

function openDoneSheet(startAt: 'done' | 'other-date'): void {
  doneStartAt.value = startAt
  isDoneSheetOpen.value = true
}

function askDelete(onlyInjection: boolean): void {
  deleteFromOnlyInjection.value = onlyInjection
  isDeleteDialogOpen.value = true
}

async function onInjectionAction(injectionId: string, action: string): Promise<void> {
  const injection = injections.value.find((candidate) => candidate.id === injectionId)
  if (!injection) return
  if (action === 'changeDate') {
    moving.value = injection
    isDatePickerOpen.value = true
  } else if ((await gestures.removeInjection(injection)) === 'without-reminder') {
    askDelete(true)
  }
}

async function addPast(injectedOn: string): Promise<void> {
  const current = vaccination.value
  if (!current) return
  if (pastInjectionNeedsReminder(current, injectedOn)) {
    isPastSheetOpen.value = false
    askReminder({ for: 'past', injectedOn })
  } else if (await gestures.addPastInjection(current, injectedOn)) {
    isPastSheetOpen.value = false
  }
}

function askReminder(question: ReminderQuestion): void {
  reminderQuestion.value = question
  isReminderSheetOpen.value = true
}

function move(injectedOn: string): void {
  const injection = moving.value
  if (!injection) return
  if (needsNewReminder(injection, injectedOn)) {
    askReminder({ for: 'move', injection, injectedOn })
  } else {
    void gestures.changeInjectionDate(injection, injectedOn)
  }
}

function onReminderChosen(dates: InjectionDates): void {
  const question = reminderQuestion.value
  if (question?.for === 'move') {
    void gestures.changeInjectionDateAndReminder(question.injection, dates)
  } else if (question?.for === 'past' && vaccination.value) {
    void gestures.addPastInjectionWithReminder(vaccination.value, dates)
  }
}

function backToCarnet(): void {
  if (vaccination.value) animals.select(vaccination.value.animalId)
  returnTo(router, { name: 'carnet' })
}

function edit(): void {
  void router.push({
    name: 'vaccination-edit',
    params: { id: props.id },
    query: originQuery(route),
  })
}

async function remove(): Promise<void> {
  if (vaccination.value && (await gestures.removeVaccination(vaccination.value))) backToCarnet()
}

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})
</script>

<template>
  <PushedScreen
    class="vaccination-detail"
    :title="vaccination?.name ?? ''"
    :subtitle="texts?.subtitle"
    subtitle-tone="secondary"
    :back-label="t('vaccinations.detail.back')"
    @back="backToCarnet"
  >
    <template v-if="vaccination" #end>
      <v-btn
        class="vaccination-detail__edit"
        icon="ms:edit"
        variant="text"
        color="primary"
        :aria-label="texts?.editLabel"
        @click="edit"
      />
      <OverflowMenu
        :label="t('history.moreOptions')"
        :items="menuItems"
        @select="askDelete(false)"
      />
    </template>

    <div class="vaccination-detail__content">
      <template v-if="vaccination && texts">
        <NextDueCard
          :label="texts.followed ? t('vaccinations.detail.nextReminder') : null"
          :value="texts.due?.value"
          :delay="texts.due?.delay"
          :tone="texts.due?.tone"
          :note="texts.note"
          :empty-text="t('vaccinations.detail.noReminder')"
          :done-aria-label="texts.doneLabel"
          :other-date-aria-label="texts.otherDateLabel"
          :busy="gestures.isBusy.value"
          :actions="texts.followed"
          @done="openDoneSheet('done')"
          @other-date="openDoneSheet('other-date')"
        >
          <template v-if="texts.top" #top>
            <p class="vaccination-detail__first">
              <v-icon icon="ms:vaccines" size="18" />
              <span>{{ texts.top }}</span>
            </p>
          </template>
        </NextDueCard>

        <SectionCard
          v-if="rows.length > 0"
          :title="t('vaccinations.detail.injections')"
          :counter="texts.counter"
        >
          <HistoryRow
            v-for="row in rows"
            :key="row.id"
            :date="row.date"
            :badge="row.badge"
            :regular="row.regular"
            :detail="row.detail"
            :options-label="row.optionsLabel"
            :items="rowItems"
            @select="onInjectionAction(row.id, $event)"
          />
        </SectionCard>

        <button
          type="button"
          class="vaccination-detail__add-past"
          :disabled="gestures.isBusy.value"
          @click="isPastSheetOpen = true"
        >
          <v-icon icon="ms:add" size="20" />
          <span>{{ t('vaccinations.detail.past.open') }}</span>
        </button>
      </template>

      <p
        v-else-if="state === 'not-found' || state === 'error'"
        class="section-card__card vaccination-detail__message"
        role="alert"
      >
        {{
          state === 'not-found'
            ? t('vaccinations.form.errors.notFound')
            : t('vaccinations.form.errors.load')
        }}
      </p>

      <div v-else class="vaccination-detail__loading">
        <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
      </div>
    </div>

    <VaccinationReminderSheet
      v-model="isDoneSheetOpen"
      :vaccination-id="id"
      :start-at="doneStartAt"
      @changed="reload"
    />

    <VaccinationReminderSheet
      v-model="isReminderSheetOpen"
      :vaccination-id="id"
      start-at="done"
      :initial-injected-on="reminderQuestion?.injectedOn ?? null"
      redate
      @reminder-chosen="onReminderChosen"
    />

    <VaccinationPastInjectionSheet
      v-if="vaccination"
      v-model="isPastSheetOpen"
      :name="vaccination.name"
      :animal="animal?.name ?? ''"
      :today="today"
      :taken="takenDates"
      :busy="gestures.isBusy.value"
      @add="addPast"
    />

    <DatePickerSheet
      v-model="isDatePickerOpen"
      :title="t('history.changeDate')"
      :subtitle="movingTexts?.changeDateSubtitle"
      :close-label="t('reminderSheet.close')"
      :date="moving?.injectedOn ?? null"
      :min="animal?.birthDate ?? null"
      :max="today"
      :excluded="excludedDates"
      @pick="move"
    />

    <ConfirmDialog
      v-if="deleteTexts"
      v-model="isDeleteDialogOpen"
      :title="deleteTexts.title"
      :text="deleteTexts.text"
      :cancel-label="deleteTexts.cancel"
      :confirm-label="deleteTexts.confirm"
      @confirm="remove"
    />
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.vaccination-detail__content {
  display: flex;
  flex-direction: column;
  gap: 26px;
  padding: 12px 0 32px;
}

.vaccination-detail__edit {
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
}

.vaccination-detail__first {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 600;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.vaccination-detail__add-past {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: tokens.$size-tap-target;
  margin: -14px tokens.$padding-section-inline 0;
  padding: 0 4px;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-primary-darken-1));
  }
}

.vaccination-detail__message {
  margin: 0 tokens.$padding-section-inline;
  padding: 16px 20px;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.vaccination-detail__loading {
  display: flex;
  justify-content: center;
  padding-block: 48px;
}
</style>
