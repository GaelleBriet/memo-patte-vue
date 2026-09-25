<script setup lang="ts">
import { computed, ref, useId, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import {
  NEXT_REMINDER_KINDS,
  nextReminderDate,
  type NextReminderChoice,
  type NextReminderKind,
} from '../logic/vaccination-done'
import {
  earliestOtherDate,
  nextReminderSummary,
  vaccinationSheetTexts,
} from '../logic/vaccination-sheet'
import type { InjectionDates } from '../repository/vaccination-injections.repository'
import type { Vaccination } from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import {
  originQuery,
  REMINDER_QUERY_PARAM,
  reminderQueryValue,
} from '@/shared/domain/reminder-route'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import ReminderActions from '@/shared/components/ReminderActions.vue'
import {
  primingAfterReminderSaved,
  routeAfterReminderSaved,
} from '@/shared/domain/notification-priming'
import { formatLongDate } from '@/shared/utils/format'
import { showToast, showUndoableToast } from '@/shared/utils/toast'

type Step = 'actions' | 'done' | 'injection-date' | 'due-date'

const props = withDefaults(
  defineProps<{
    vaccinationId: string | null
    /** `done` ouvre directement la feuille « Fait » (F5). */
    startAt?: 'actions' | 'done'
    /** Date d'injection proposée à l'ouverture ; aujourd'hui sinon. */
    initialInjectedOn?: string | null
    /** Écran où revenir une fois l'injection notée ; absent, la feuille reste sur l'écran qui l'a ouverte. */
    returnTo?: string | null
    /** Injection existante déplacée à `initialInjectedOn` : seul le rappel se choisit, rien n'est écrit. */
    redate?: boolean
  }>(),
  { startAt: 'actions', initialInjectedOn: null, returnTo: null, redate: false },
)

const emit = defineEmits<{
  /** Une injection ou son annulation a changé le vaccin. */
  changed: []
  /** Le rappel choisi pour l'injection déplacée, avec sa nouvelle date. */
  reminderChosen: [dates: InjectionDates]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()
const vaccinations = useVaccinationsStore()
const { today, refresh: refreshToday } = useToday()
const choicesLabelId = useId()

const vaccination = ref<Vaccination | null>(null)
const steps = ref<Step[]>(['actions'])
const injectedOn = ref<string | null>(today.value)
const choice = ref<NextReminderChoice | null>(null)
const isSubmitting = ref(false)
const saveFailed = ref(false)

const step = computed(() => steps.value.at(-1) ?? 'actions')
const isShown = computed({
  get: () => open.value && vaccination.value !== null,
  set: (shown) => {
    if (!shown) open.value = false
  },
})

const animal = computed(() => (vaccination.value ? animals.byId(vaccination.value.animalId) : null))
const texts = computed(() =>
  vaccination.value
    ? vaccinationSheetTexts(t, vaccination.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
      })
    : null,
)
const injectionDate = computed(() => injectedOn.value ?? today.value)
const summary = computed(() => nextReminderSummary(t, injectionDate.value, choice.value))
const otherDate = computed(() => (choice.value?.kind === 'otherDate' ? choice.value.date : null))

const title = computed(() => {
  if (step.value === 'injection-date') return t('vaccinations.sheet.injectionDate.title')
  if (step.value === 'due-date') return t('vaccinations.sheet.dueDate.title')
  return vaccination.value?.name ?? ''
})
const subtitle = computed(() => {
  if (step.value === 'actions' || step.value === 'done') return texts.value?.subtitle
  return texts.value?.calendarSubtitle
})
const backLabel = computed(() => {
  if (step.value === 'injection-date') return t('vaccinations.sheet.injectionDate.back')
  if (step.value === 'due-date') return t('vaccinations.sheet.dueDate.back')
  return null
})

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    refreshToday()
    steps.value = [props.startAt]
    injectedOn.value = props.initialInjectedOn ?? today.value
    choice.value = null
    saveFailed.value = false
    vaccination.value = null
    if (!animals.hasLoaded) void animals.load()
    try {
      vaccination.value = props.vaccinationId
        ? await vaccinations.getById(props.vaccinationId)
        : null
    } catch {
      vaccination.value = null
    }
    if (vaccination.value === null && open.value) {
      open.value = false
      showToast(t('vaccinations.form.errors.load'), { tone: 'error' })
    }
  },
  { immediate: true },
)

function goTo(...next: Step[]): void {
  steps.value = [...steps.value, ...next]
}

function back(): void {
  if (steps.value.length > 1) steps.value = steps.value.slice(0, -1)
}

function startDone(withCalendar: boolean): void {
  injectedOn.value = today.value
  choice.value = null
  if (withCalendar) goTo('done', 'injection-date')
  else goTo('done')
}

function pickInjectionDate(date: string | null): void {
  if (date === null) return
  injectedOn.value = date
  back()
}

function pickOtherDate(date: string | null): void {
  if (date === null) return
  choice.value = { kind: 'otherDate', date }
  back()
}

function choose(kind: NextReminderKind): void {
  if (kind === 'otherDate') {
    goTo('due-date')
    return
  }
  choice.value = { kind }
}

// L'écran d'accueil garde le rappel dans son adresse : le retour, bouton Android compris, rouvre la feuille.
async function edit(): Promise<void> {
  const current = vaccination.value
  if (current === null) return
  const reminder = reminderQueryValue({ kind: 'vaccination', id: current.id })
  open.value = false
  await router.replace({ query: { ...route.query, [REMINDER_QUERY_PARAM]: reminder } })
  await router.push({
    name: 'vaccination-edit',
    params: { id: current.id },
    query: { from: String(route.name ?? ''), [REMINDER_QUERY_PARAM]: reminder },
  })
}

async function save(): Promise<void> {
  const current = vaccination.value
  const chosen = choice.value
  if (isSubmitting.value || current === null || chosen === null) return
  const nextDueDate = nextReminderDate(injectionDate.value, chosen)
  if (props.redate) {
    emit('reminderChosen', { injectedOn: injectionDate.value, nextDueDate })
    open.value = false
    return
  }
  isSubmitting.value = true
  saveFailed.value = false
  const named = { name: current.name, animal: animal.value?.name ?? '' }
  try {
    const { injectionId } = await vaccinations.recordInjection(current.id, {
      injectedOn: injectionDate.value,
      nextDueDate,
    })
    open.value = false
    emit('changed')
    showUndoableToast(t('vaccinations.sheet.toast.injection', named), {
      label: t('reminderSheet.undo'),
      ariaLabel: t('vaccinations.sheet.toast.undoInjection', named),
      undo: () => vaccinations.undoInjection(current.id, injectionId),
      onUndone: () => emit('changed'),
      failedMessage: t('reminderSheet.undoFailed'),
    })
    const saved = {
      hasDueDate: nextDueDate !== null,
      animalName: animal.value?.name ?? null,
      kind: 'vaccination',
    } as const
    if (props.returnTo) {
      void router.replace(await routeAfterReminderSaved({ ...saved, from: props.returnTo }))
      return
    }
    const priming = await primingAfterReminderSaved({ ...saved, ...originQuery(route) })
    if (priming) void router.replace(priming)
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <BottomSheet
    v-model="isShown"
    class="vaccination-reminder-sheet"
    :title="title"
    :subtitle="subtitle"
    :close-label="t('reminderSheet.close')"
    :icon="backLabel ? null : 'ms:vaccines'"
    :back-label="backLabel"
    :has-previous-step="steps.length > 1"
    :persistent="isSubmitting"
    @back="back"
  >
    <template v-if="vaccination && texts">
      <ReminderActions
        v-if="step === 'actions'"
        :due-text="texts.due"
        :done-today-aria-label="texts.doneTodayLabel"
        :edit-hint="t('vaccinations.sheet.editHint')"
        @done-today="startDone(false)"
        @other-date="startDone(true)"
        @edit="edit"
      />

      <div v-else-if="step === 'done'" class="vaccination-reminder-sheet__done">
        <div class="vaccination-reminder-sheet__injection">
          <v-icon icon="ms:event" size="22" />
          <span class="vaccination-reminder-sheet__injection-date">
            {{ t('vaccinations.sheet.done.injectionOn', { date: formatLongDate(injectionDate) }) }}
          </span>
          <button
            v-if="!redate"
            type="button"
            class="vaccination-reminder-sheet__change"
            :aria-label="t('vaccinations.sheet.done.changeInjectionLabel')"
            @click="goTo('injection-date')"
          >
            {{ t('vaccinations.sheet.done.change') }}
          </button>
        </div>

        <p :id="choicesLabelId" class="vaccination-reminder-sheet__heading">
          {{ t('vaccinations.sheet.done.nextReminder') }}
        </p>
        <p class="vaccination-reminder-sheet__hint">{{ t('vaccinations.sheet.done.hint') }}</p>

        <div
          class="vaccination-reminder-sheet__choices"
          role="radiogroup"
          :aria-labelledby="choicesLabelId"
        >
          <button
            v-for="kind in NEXT_REMINDER_KINDS"
            :key="kind"
            type="button"
            role="radio"
            class="vaccination-reminder-sheet__choice"
            :class="{ 'vaccination-reminder-sheet__choice--selected': choice?.kind === kind }"
            :aria-checked="choice?.kind === kind"
            @click="choose(kind)"
          >
            <v-icon v-if="choice?.kind === kind" icon="ms:check" size="20" />
            {{ t(`vaccinations.sheet.done.choices.${kind}`) }}
          </button>
        </div>

        <div
          class="vaccination-reminder-sheet__summary"
          :class="{ 'vaccination-reminder-sheet__summary--chosen': summary.chosen }"
          aria-live="polite"
        >
          <v-icon v-if="summary.chosen && choice?.kind !== 'none'" icon="ms:event" size="20" />
          <span class="vaccination-reminder-sheet__summary-text">{{ summary.text }}</span>
          <button
            v-if="otherDate"
            type="button"
            class="vaccination-reminder-sheet__change"
            :aria-label="t('vaccinations.sheet.done.changeDueLabel')"
            @click="goTo('due-date')"
          >
            {{ t('vaccinations.sheet.done.change') }}
          </button>
        </div>

        <p v-if="saveFailed" class="vaccination-reminder-sheet__error" role="alert">
          {{ t('vaccinations.sheet.errors.save') }}
        </p>

        <v-btn
          class="vaccination-reminder-sheet__submit"
          variant="flat"
          color="primary"
          :disabled="!summary.chosen || isSubmitting"
          @click="save"
        >
          <v-progress-circular v-if="isSubmitting" indeterminate :size="18" :width="2" />
          {{ t('vaccinations.sheet.done.submit') }}
        </v-btn>
      </div>

      <DateCalendar
        v-else-if="step === 'injection-date'"
        class="vaccination-reminder-sheet__calendar"
        :model-value="injectionDate"
        :min="animal?.birthDate ?? null"
        :max="today"
        @update:model-value="pickInjectionDate"
      />

      <DateCalendar
        v-else
        class="vaccination-reminder-sheet__calendar"
        :model-value="otherDate"
        :min="earliestOtherDate(today)"
        @update:model-value="pickOtherDate"
      />
    </template>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

// Non scopé : la feuille est téléportée hors du composant.
.vaccination-reminder-sheet__injection {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 10px 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.vaccination-reminder-sheet__injection-date {
  flex: 1 1 auto;
  min-width: 0;
  font-size: 15.5px;
  font-weight: 700;
}

.vaccination-reminder-sheet__change {
  position: relative;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  @include tap.tap-target;

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-primary-darken-1));
  }
}

.vaccination-reminder-sheet__heading {
  margin: 20px 0 0;
  font-size: 16px;
  font-weight: 700;
}

.vaccination-reminder-sheet__hint {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.vaccination-reminder-sheet__choices {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.vaccination-reminder-sheet__choice {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: tokens.$height-field;
  padding: 8px 10px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    border-color: rgb(var(--v-theme-primary));
  }
}

.vaccination-reminder-sheet__choice--selected {
  border-color: rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
  color: rgb(var(--v-theme-primary));
}

.vaccination-reminder-sheet__summary {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 44px;
  margin-top: 14px;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.vaccination-reminder-sheet__summary--chosen {
  padding: 8px 16px;
  border-radius: tokens.$radius-field;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
  font-size: 15px;
  font-weight: 700;
}

.vaccination-reminder-sheet__summary-text {
  flex: 1 1 auto;
  min-width: 0;
}

.vaccination-reminder-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 13px;
  font-weight: 500;
}

.vaccination-reminder-sheet__submit {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 14px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.vaccination-reminder-sheet__submit:disabled,
.vaccination-reminder-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}

.vaccination-reminder-sheet__calendar {
  margin-top: 12px;
}
</style>
