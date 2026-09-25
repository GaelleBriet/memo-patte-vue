<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import VaccinationReminderSheet from './VaccinationReminderSheet.vue'
import { useInjectionGestures } from '../composables/use-injection-gestures'
import { useVaccinationDetail } from '../composables/use-vaccination-detail'
import {
  injectionDatesExcept,
  injectionGestureTexts,
  injectionRows,
  needsNewReminder,
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

const vaccination = computed(() => data.value?.vaccination ?? null)
const injections = computed(() => data.value?.injections ?? [])
const animal = computed(() => (vaccination.value ? animals.byId(vaccination.value.animalId) : null))
const texts = computed(() =>
  vaccination.value
    ? vaccinationDetailTexts(t, vaccination.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
        injections: injections.value.length,
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

const isDoneSheetOpen = ref(false)
const moving = ref<VaccinationInjection | null>(null)
const isDatePickerOpen = ref(false)
const movingTexts = computed(() =>
  moving.value ? injectionGestureTexts(t, moving.value.injectedOn, today.value) : null,
)
const excludedDates = computed(() =>
  moving.value ? injectionDatesExcept(injections.value, moving.value.id) : [],
)

const isDeleteDialogOpen = ref(false)
const deleteFromOnlyInjection = ref(false)
const deleteTexts = computed(() =>
  vaccination.value
    ? vaccinationDeleteTexts(t, vaccination.value.name, {
        onlyInjection: deleteFromOnlyInjection.value,
      })
    : null,
)

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

function askDelete(onlyInjection: boolean): void {
  deleteFromOnlyInjection.value = onlyInjection
  isDeleteDialogOpen.value = true
}

function onInjectionAction(injectionId: string, action: string): void {
  const injection = injections.value.find((candidate) => candidate.id === injectionId)
  if (!injection) return
  if (action === 'changeDate') {
    moving.value = injection
    isDatePickerOpen.value = true
  } else if (injections.value.length === 1) {
    askDelete(true)
  } else {
    void gestures.removeInjection(injection)
  }
}

const redating = ref<{ injection: VaccinationInjection; injectedOn: string } | null>(null)
const isRedateSheetOpen = ref(false)

function move(injectedOn: string): void {
  const injection = moving.value
  if (!injection) return
  if (needsNewReminder(injection, injectedOn)) {
    redating.value = { injection, injectedOn }
    isRedateSheetOpen.value = true
  } else {
    void gestures.changeInjectionDate(injection, injectedOn)
  }
}

function redate(dates: InjectionDates): void {
  if (redating.value) void gestures.changeInjectionDateAndReminder(redating.value.injection, dates)
}

function backToCarnet(): void {
  if (vaccination.value) animals.select(vaccination.value.animalId)
  returnTo(router, { name: 'animals' })
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
      <OverflowMenu
        :label="t('history.moreOptions')"
        :items="menuItems"
        @select="askDelete(false)"
      />
    </template>

    <div class="vaccination-detail__content">
      <template v-if="vaccination && texts">
        <NextDueCard
          :label="t('vaccinations.detail.nextReminder')"
          :date="texts.due?.date"
          :delay="texts.due?.delay.text"
          :overdue="texts.due?.delay.overdue"
          :empty-text="t('vaccinations.detail.noReminder')"
          :done-aria-label="texts.doneLabel"
          :busy="gestures.isBusy.value"
          @done="isDoneSheetOpen = true"
          @edit="edit"
        />

        <SectionCard :title="t('vaccinations.detail.injections')" :counter="texts.counter">
          <HistoryRow
            v-for="row in rows"
            :key="row.id"
            :date="row.date"
            :detail="row.chosen"
            :options-label="row.optionsLabel"
            :items="rowItems"
            @select="onInjectionAction(row.id, $event)"
          />
        </SectionCard>
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
      start-at="done"
      @changed="reload"
    />

    <VaccinationReminderSheet
      v-model="isRedateSheetOpen"
      :vaccination-id="id"
      start-at="done"
      :initial-injected-on="redating?.injectedOn ?? null"
      redate
      @reminder-chosen="redate"
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
