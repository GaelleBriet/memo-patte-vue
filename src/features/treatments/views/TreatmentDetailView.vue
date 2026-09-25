<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useTreatmentDetail } from '../composables/use-treatment-detail'
import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import {
  doseDatesExcept,
  doseGestureTexts,
  doseHistory,
  treatmentDeleteTexts,
  treatmentDetailTexts,
} from '../logic/treatment-history'
import { treatmentSheetTexts } from '../logic/treatment-sheet'
import { isOngoing } from '../logic/treatment-status'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
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

const { data, state, reload } = useTreatmentDetail(() => props.id)
const gestures = useTreatmentGestures(() => void reload())

const treatment = computed(() => data.value?.treatment ?? null)
const doses = computed(() => data.value?.doses ?? [])
const ongoing = computed(() => treatment.value !== null && isOngoing(treatment.value))
const animal = computed(() => (treatment.value ? animals.byId(treatment.value.animalId) : null))
const texts = computed(() =>
  treatment.value
    ? treatmentDetailTexts(t, treatment.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
        doses: doses.value,
      })
    : null,
)
const sheetTexts = computed(() =>
  treatment.value
    ? treatmentSheetTexts(t, treatment.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
      })
    : null,
)
const history = computed(() => doseHistory(doses.value, { ongoing: ongoing.value }))
const listedDoses = computed(() =>
  history.value.others.kind === 'list' ? history.value.others.doses : [],
)
const yearGroups = computed(() =>
  history.value.others.kind === 'years' ? history.value.others.groups : [],
)

const showsPrevious = ref(false)
const openYears = ref<string[]>([])

function toggleYear(year: string): void {
  openYears.value = openYears.value.includes(year)
    ? openYears.value.filter((open) => open !== year)
    : [...openYears.value, year]
}

const doseItems = computed<OverflowMenuItem[]>(() => [
  { id: 'changeDate', label: t('history.changeDate'), icon: 'ms:edit_calendar' },
  { id: 'remove', label: t('treatments.detail.remove'), icon: 'ms:delete', danger: true },
])
const menuItems = computed<OverflowMenuItem[]>(() => [
  { id: 'remove', label: t('treatments.detail.menu.remove'), icon: 'ms:delete', danger: true },
])

const moving = ref<TreatmentDose | null>(null)
const isDatePickerOpen = ref(false)
const movingTexts = computed(() =>
  moving.value ? doseGestureTexts(t, moving.value.givenOn, today.value) : null,
)
const excludedDates = computed(() =>
  moving.value ? doseDatesExcept(doses.value, moving.value.id) : [],
)

const isStopDialogOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const deleteFromOnlyDose = ref(false)
const deleteTexts = computed(() =>
  treatment.value
    ? treatmentDeleteTexts(t, treatment.value.name, { onlyDose: deleteFromOnlyDose.value })
    : null,
)

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

function askDelete(onlyDose: boolean): void {
  deleteFromOnlyDose.value = onlyDose
  isDeleteDialogOpen.value = true
}

function onDoseAction(dose: TreatmentDose, action: string): void {
  if (action === 'changeDate') {
    moving.value = dose
    isDatePickerOpen.value = true
  } else if (doses.value.length === 1) {
    askDelete(true)
  } else {
    void gestures.removeDose(dose)
  }
}

function onHeadAction(action: string): void {
  if (history.value.head) onDoseAction(history.value.head, action)
}

function move(givenOn: string): void {
  if (moving.value) void gestures.changeDoseDate(moving.value, givenOn)
}

function done(): void {
  if (treatment.value) {
    void gestures.recordDose(treatment.value, today.value, t('treatments.sheet.errors.dose'))
  }
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
    :subtitle="texts?.subtitle"
    subtitle-tone="secondary"
    :back-label="t('treatments.detail.back')"
    @back="backToCarnet"
  >
    <template v-if="treatment" #end>
      <OverflowMenu
        :label="t('history.moreOptions')"
        :items="menuItems"
        @select="askDelete(false)"
      />
    </template>

    <div class="treatment-detail__content">
      <template v-if="treatment && texts">
        <NextDueCard
          v-if="texts.due"
          :label="t('treatments.detail.nextDose')"
          :date="texts.due.date"
          :delay="texts.due.delay.text"
          :overdue="texts.due.delay.overdue"
          :done-aria-label="texts.doneLabel"
          :busy="gestures.isBusy.value"
          @done="done"
          @edit="edit"
        >
          <template #top>
            <p class="treatment-detail__frequency">
              <v-icon icon="ms:repeat" size="22" />
              <span>{{ texts.frequency }}</span>
            </p>
          </template>
        </NextDueCard>

        <div v-else-if="texts.stopped" class="treatment-detail__stopped">
          <p class="treatment-detail__stopped-notice">
            <v-icon icon="ms:do_not_disturb_on" size="22" />
            <span>{{ texts.stopped.notice }}</span>
          </p>
          <p class="treatment-detail__frequency treatment-detail__frequency--past">
            <v-icon icon="ms:repeat" size="22" />
            <span>{{ texts.stopped.wasFrequency }}</span>
          </p>
        </div>

        <SectionCard :title="t('treatments.detail.doses')" :counter="texts.counter">
          <HistoryRow
            v-if="history.head"
            :date="texts.dose(history.head).date"
            :badge="t('treatments.detail.last')"
            :detail="texts.headDetail"
            :options-label="texts.dose(history.head).optionsLabel"
            :items="doseItems"
            @select="onHeadAction"
          />

          <template v-if="!ongoing || showsPrevious">
            <HistoryRow
              v-for="dose in listedDoses"
              :key="dose.id"
              :date="texts.dose(dose).date"
              :regular="ongoing"
              :options-label="texts.dose(dose).optionsLabel"
              :items="doseItems"
              @select="onDoseAction(dose, $event)"
            />
            <template v-for="group in yearGroups" :key="group.year">
              <button
                type="button"
                class="treatment-detail__year"
                :aria-expanded="openYears.includes(group.year)"
                @click="toggleYear(group.year)"
              >
                <span>{{ texts.year(group) }}</span>
                <v-icon
                  :icon="
                    openYears.includes(group.year)
                      ? 'ms:keyboard_arrow_up'
                      : 'ms:keyboard_arrow_down'
                  "
                  size="22"
                />
              </button>
              <template v-if="openYears.includes(group.year)">
                <HistoryRow
                  v-for="dose in group.doses"
                  :key="dose.id"
                  :date="texts.dose(dose).date"
                  :regular="ongoing"
                  :options-label="texts.dose(dose).optionsLabel"
                  :items="doseItems"
                  @select="onDoseAction(dose, $event)"
                />
              </template>
            </template>
          </template>

          <button
            v-if="ongoing && doses.length > 1"
            type="button"
            class="treatment-detail__toggle"
            :aria-expanded="showsPrevious"
            @click="showsPrevious = !showsPrevious"
          >
            <span>{{
              showsPrevious ? t('treatments.detail.hidePrevious') : texts.showPrevious
            }}</span>
            <v-icon
              :icon="showsPrevious ? 'ms:keyboard_arrow_up' : 'ms:keyboard_arrow_down'"
              size="22"
            />
          </button>
        </SectionCard>

        <button
          v-if="ongoing && sheetTexts"
          type="button"
          class="treatment-detail__stop"
          :aria-label="sheetTexts.stopLabel"
          :disabled="gestures.isBusy.value"
          @click="isStopDialogOpen = true"
        >
          <v-icon icon="ms:do_not_disturb_on" size="22" />
          <span>{{ t('treatments.sheet.stop') }}</span>
        </button>
      </template>

      <p
        v-else-if="state === 'not-found' || state === 'error'"
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

    <DatePickerSheet
      v-model="isDatePickerOpen"
      :title="t('history.changeDate')"
      :subtitle="movingTexts?.changeDateSubtitle"
      :close-label="t('reminderSheet.close')"
      :date="moving?.givenOn ?? null"
      :min="animal?.birthDate ?? null"
      :max="today"
      :excluded="excludedDates"
      @pick="move"
    />

    <ConfirmDialog
      v-if="sheetTexts"
      v-model="isStopDialogOpen"
      :title="sheetTexts.stopDialog.title"
      :text="t('treatments.sheet.stopDialog.text')"
      :cancel-label="t('treatments.sheet.stopDialog.cancel')"
      :confirm-label="t('treatments.sheet.stopDialog.confirm')"
      :cancel-aria-label="sheetTexts.stopDialog.cancelLabel"
      :confirm-aria-label="sheetTexts.stopDialog.confirmLabel"
      @confirm="stop"
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

    <template v-if="treatment && !ongoing" #actions>
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

.treatment-detail__frequency {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15.5px;
  font-weight: 600;

  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-detail__frequency--past .v-icon {
  color: tokens.$color-text-meta;
}

.treatment-detail__stopped {
  display: flex;
  flex-direction: column;
  gap: 14px;
  margin-inline: tokens.$padding-section-inline;
}

.treatment-detail__stopped-notice {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0;
  padding: 14px 16px;
  border-radius: tokens.$radius-notice;
  background: tokens.$color-history-stopped-surface;
  color: tokens.$color-text-secondary;
  font-size: 15.5px;
  font-weight: 600;

  .v-icon {
    flex: 0 0 auto;
  }
}

.treatment-detail__stopped .treatment-detail__frequency--past {
  padding-inline-start: 4px;
}

.treatment-detail__year,
.treatment-detail__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: tokens.$height-add-row;
  padding: 0 20px;
  border: 0;
  border-top: 1px solid tokens.$color-divider;
  background: transparent;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.treatment-detail__year {
  color: rgb(var(--v-theme-on-surface));
  font-size: 15px;
  font-weight: 700;

  .v-icon {
    color: tokens.$color-text-meta;
  }
}

.treatment-detail__toggle {
  color: rgb(var(--v-theme-primary));
  font-size: 15px;
  font-weight: 700;
}

.treatment-detail__year:first-child {
  border-top: 0;
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
