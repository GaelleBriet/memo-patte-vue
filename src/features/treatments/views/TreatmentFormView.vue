<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import TreatmentChooseDays from './TreatmentChooseDays.vue'
import TreatmentDosageField from './TreatmentDosageField.vue'
import TreatmentPastDuesSheet from './TreatmentPastDuesSheet.vue'
import TreatmentReminderField from './TreatmentReminderField.vue'
import TreatmentShiftCheckbox from './TreatmentShiftCheckbox.vue'
import TreatmentTimesField from './TreatmentTimesField.vue'
import TreatmentUnloggedPrompt from './TreatmentUnloggedPrompt.vue'
import { chooseDaysSubtitle, type DayChoice } from '../logic/treatment-choose-days'
import {
  creationPastDuesOf,
  pastDosesBasis,
  validateTreatmentCreation,
} from '../logic/treatment-creation-form'
import { editedFormValues, validateTreatmentEdition } from '../logic/treatment-edition-form'
import { resumedFormValues, validateTreatmentResumption } from '../logic/treatment-resumption-form'
import {
  reminderHelpText,
  reminderOffsetChoices,
  suggestExactReminders,
} from '../logic/treatment-reminder-choices'
import { emptyTreatmentFormValues } from '../logic/treatment-form-values'
import { DUPLICATE_TIME_ERROR_KEY } from '../logic/treatment-form-errors'
import {
  endsOnHelpText,
  formErrorParams,
  frequencyUnitCount,
  nextDoseHelpText,
  resumeInfoText,
} from '../logic/treatment-form-texts'
import {
  pastDosesOf,
  pastDosesPrompt,
  pastDosesResult,
  promptChoice,
  type PromptActionId,
} from '../logic/treatment-unlogged'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { PastDuesChoice } from '../schema/treatment-form.schema'
import type { ReminderOffsetMinutes } from '../schema/treatment-period.schema'
import { FREQUENCY_UNITS, TREATMENT_TYPES, type FrequencyUnit } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useTreatmentFormDrafts } from '../composables/use-treatment-form-drafts'
import { useToday } from '@/core/app-lifecycle/use-today'
import {
  markExactRemindersSuggested,
  wasExactRemindersSuggested,
} from '@/core/notifications/exact-reminders'
import { getNotificationPermissionStatus } from '@/core/notifications/permission'
import { useExactReminders } from '@/core/notifications/use-exact-reminders'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ExactRemindersExplainer from '@/shared/components/ExactRemindersExplainer.vue'
import { MAX_FREQUENCY_VALUE } from '@/shared/domain/treatment-frequency'
import { hasSeveralDoseTimes } from '@/shared/domain/treatment-periods'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { useCareForm } from '@/shared/composables/use-care-form'
import { detailRoute } from '@/shared/domain/reminder-route'
import { returnTo } from '@/shared/utils/return-to'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const props = defineProps<{
  animalId?: string
  id?: string
  /** Reprise d'un traitement fini ou arrêté : une nouvelle période, la première prise à choisir. */
  resume?: boolean
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()
const { today } = useToday()
const exactReminders = useExactReminders()

const mode = props.id === undefined ? 'create' : props.resume ? 'resume' : 'edit'

const values = ref(emptyTreatmentFormValues())
const history = ref<TreatmentWithHistory | null>(null)
const endsOnTouched = ref(false)
const hasDuplicateTime = ref(false)
const isPastDuesOpen = ref(false)
/** Réponse de l'encart des doses passées : rien n'est écrit avant « Créer ». */
const pastDosesAnswer = ref<DayChoice | null>(null)
const isChooseDaysOpen = ref(false)
const isSuggestingExact = ref(false)
const isExplainerOpen = ref(false)
/** Le moment choisi avant d'ouvrir le formulaire reste proposé sans les rappels précis (RA-23). */
const keptOffset = ref<ReminderOffsetMinutes | null>(null)

const {
  draft,
  previous,
  nextDose,
  nextDoseShift,
  pastDuesChoice,
  pastDues,
  hasSettings,
  answerPastDues: recordPastDuesAnswer,
} = useTreatmentFormDrafts(mode, { values, history, today, endsOnTouched })

const {
  notFound,
  isLoading,
  loadFailed,
  isSubmitting,
  targetAnimal,
  animalName,
  saveFailed,
  canSave: canSaveCare,
  backToOrigin,
  saveThenLeave,
} = useCareForm({
  kind: 'treatment',
  animals,
  id: () => props.id,
  animalId: () => props.animalId,
  openedAnimalId: () => history.value?.animalId,
  allowsUnfollowedAnimal: () => mode === 'edit',
  load: (id) => treatments.getWithHistory(id),
  open,
})

const creation = useFormValidation(values, (current) =>
  validateTreatmentCreation(
    current,
    requireAnimalId(),
    today.value,
    pastDosesAnswer.value === null ? null : pastDosesOf(pastDosesAnswer.value),
  ),
)
const edition = useFormValidation(values, (current) =>
  validateTreatmentEdition(
    current,
    requireHistory(),
    today.value,
    pastDuesChoice.value,
    draft.value,
  ),
)
const resumption = useFormValidation(values, (current) =>
  validateTreatmentResumption(current, requireHistory(), today.value),
)

const duplicateTimeError = computed(() =>
  hasDuplicateTime.value ? DUPLICATE_TIME_ERROR_KEY : undefined,
)
const reminderChoices = computed(() =>
  reminderOffsetChoices(exactReminders.status.value, keptOffset.value),
)
const isLessPrecise = computed(() => exactReminders.status.value === 'removed')
const suggestsExact = computed(
  () => isSuggestingExact.value && exactReminders.status.value === 'never-enabled',
)
const reminderHelp = computed(() => reminderHelpText(t, values.value.times))
const errors = computed(
  () => ({ create: creation, edit: edition, resume: resumption })[mode].errors.value,
)

const pastDoses = computed(() =>
  mode === 'create'
    ? pastDosesPrompt(
        t,
        creationPastDuesOf(values.value, today.value),
        today.value,
        hasSeveralDoseTimes(values.value.times),
        { followed: (targetAnimal.value?.unfollowedOn ?? null) === null },
      )
    : null,
)
const pastDosesAnswered = computed(() =>
  pastDosesAnswer.value === null ? null : pastDosesResult(t, pastDosesAnswer.value),
)

const isReady = computed(
  () => mode === 'create' || (history.value !== null && !notFound.value && !loadFailed.value),
)
const title = computed(() => {
  if (mode === 'create') return t('treatments.form.title')
  if (history.value === null || !isReady.value) return ''
  const name = { name: history.value.name }
  return mode === 'resume'
    ? t('treatments.form.resumeTitle', name)
    : t('treatments.form.editTitle', name)
})
const subtitle = computed(() =>
  animalName.value ? t('treatments.form.forAnimal', { name: animalName.value }) : null,
)
const submitLabel = computed(() => {
  const labels = {
    create: ['treatments.form.submit', 'treatments.form.submitting'],
    edit: ['treatments.form.save', 'treatments.form.saving'],
    resume: ['treatments.form.resume', 'treatments.form.resuming'],
  } as const
  return t(labels[mode][isSubmitting.value ? 1 : 0])
})
const errorMessage = computed(() => {
  if (notFound.value) return t('treatments.form.errors.notFound')
  if (loadFailed.value) return t('treatments.form.errors.load')
  if (saveFailed.value) return t('treatments.form.errors.save')
  return null
})
const canSave = computed(
  () => canSaveCare.value && (mode !== 'resume' || values.value.firstDoseOn !== ''),
)
const typeOptions = computed(() =>
  TREATMENT_TYPES.map((type) => ({ value: type, label: t(`treatments.type.${type}`) })),
)
const unitCount = computed(() => frequencyUnitCount(values.value.frequencyValue))
const unitOptions = computed(() =>
  FREQUENCY_UNITS.map((unit) => ({
    value: unit,
    label: t(`treatments.form.frequency.unit.${unit}`, unitCount.value),
  })),
)
const nextDoseHelp = computed(() => nextDoseHelpText(t, nextDose.value?.help ?? null, today.value))
const resumeInfo = computed(() => resumeInfoText(t, previous.value, today.value))
const endsOnHelp = computed(() =>
  endsOnHelpText(t, previous.value, {
    endsOn: values.value.endsOn,
    touched: endsOnTouched.value,
  }),
)

watch(
  () => values.value.times,
  () => {
    hasDuplicateTime.value = false
  },
)

watch(
  () => pastDosesBasis(values.value, pastDoses.value?.dues ?? []),
  () => {
    pastDosesAnswer.value = null
  },
)

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire traitement ouvert sans animal.')
  return props.animalId
}

function requireHistory(): TreatmentWithHistory {
  if (history.value === null) throw new Error('Formulaire traitement ouvert sans traitement.')
  return history.value
}

function errorText(key: string | undefined): string | null {
  if (key === undefined) return null
  return t(key, formErrorParams(draft.value, previous.value, today.value))
}

function open(loaded: TreatmentWithHistory): void {
  const opened =
    mode === 'resume'
      ? resumedFormValues(loaded, today.value)
      : ({ status: 'ready', values: editedFormValues(loaded, today.value) } as const)
  if (opened.status === 'not-resumable') {
    animals.select(loaded.animalId)
    returnTo(router, detailRoute({ kind: 'treatment', id: loaded.id }))
    return
  }
  values.value = opened.values
  keptOffset.value = values.value.reminderOffset
  history.value = loaded
}

async function setTimes(times: string[]): Promise<void> {
  const before = values.value.times
  values.value.times = times
  const suggests = await suggestExactReminders(before, times, {
    exact: exactReminders.status.value,
    alreadySuggested: wasExactRemindersSuggested,
    notifications: getNotificationPermissionStatus,
    markSuggested: markExactRemindersSuggested,
  })
  if (suggests) isSuggestingExact.value = true
}

function selectUnit(unit: FrequencyUnit | null): void {
  if (unit) values.value.frequencyUnit = unit
}

function setEndsOn(endsOn: string): void {
  endsOnTouched.value = true
  values.value.endsOn = endsOn
}

function write(): (() => Promise<unknown>) | null {
  if (mode === 'create') {
    const result = creation.validate()
    return result.success ? () => treatments.create(result.data) : null
  }
  const id = requireHistory().id
  if (mode === 'resume') {
    const result = resumption.validate()
    return result.success ? () => treatments.resume(id, result.data) : null
  }
  const result = edition.validate()
  if (result.success) return () => treatments.update(id, result.data)
  isPastDuesOpen.value = result.needsPastDuesChoice
  return null
}

function onPastDosesAction(action: PromptActionId): void {
  if (pastDoses.value === null) return
  if (action === 'choose-days') isChooseDaysOpen.value = true
  else pastDosesAnswer.value = promptChoice(action, pastDoses.value.dues)
}

function answerPastDoses(choice: DayChoice): void {
  pastDosesAnswer.value = choice
  isChooseDaysOpen.value = false
}

function answerPastDues(choice: PastDuesChoice): Promise<void> {
  recordPastDuesAnswer(choice)
  return submit()
}

async function submit(): Promise<void> {
  if (isSubmitting.value || !canSave.value) return

  await saveThenLeave(() => write()?.() ?? null, true)
}
</script>

<template>
  <FormScreen
    class="treatment-form"
    :title="title"
    :subtitle="subtitle"
    :submit-label="submitLabel"
    :is-submitting="isSubmitting"
    :disabled="!canSave"
    :error-message="errorMessage"
    @cancel="backToOrigin"
    @submit="submit"
  >
    <div v-if="isLoading" class="treatment-form__loading">
      <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
    </div>

    <p v-if="isReady && resumeInfo" class="treatment-form__info">
      <v-icon icon="ms:info" size="19" />
      <span>{{ resumeInfo }}</span>
    </p>

    <template v-if="isReady && mode !== 'resume'">
      <FormField
        class="treatment-form__field--name"
        :label="t('treatments.form.name.label')"
        control-id="treatment-name"
        required
        :error="errorText(errors.name)"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="treatment-name"
            v-model="values.name"
            class="form-field__input"
            variant="outlined"
            hide-details
            aria-required="true"
            :maxlength="MAX_NAME_LENGTH"
            :aria-describedby="describedby"
            :aria-invalid="invalid"
            :error="invalid"
            :placeholder="t('treatments.form.name.placeholder')"
          />
        </template>
      </FormField>

      <FormField
        class="treatment-form__field--type"
        :label="t('treatments.form.type.label')"
        label-id="treatment-type-label"
        required
        :error="errorText(errors.type)"
      >
        <template #default="{ describedby, invalid }">
          <FormSegmented
            v-model="values.type"
            :options="typeOptions"
            label-id="treatment-type-label"
            compact
            :aria-describedby="describedby"
            :aria-invalid="invalid"
          />
        </template>
      </FormField>
    </template>

    <template v-if="isReady && hasSettings">
      <FormField
        class="treatment-form__field--frequency"
        :label="t('treatments.form.frequency.label')"
        label-id="treatment-frequency-label"
        required
        :error="errorText(errors.frequency)"
      >
        <template #default="{ describedby, invalid }">
          <div
            class="treatment-form__frequency"
            role="group"
            aria-labelledby="treatment-frequency-label"
          >
            <span id="treatment-frequency-every" class="treatment-form__every">
              {{ t(`treatments.form.frequency.every.${values.frequencyUnit}`) }}
            </span>
            <v-text-field
              id="treatment-frequency-value"
              v-model="values.frequencyValue"
              class="form-field__input form-field__input--number treatment-form__frequency-value"
              type="number"
              inputmode="numeric"
              :placeholder="t('treatments.form.frequency.placeholder')"
              min="1"
              :max="MAX_FREQUENCY_VALUE"
              step="1"
              variant="outlined"
              hide-details
              aria-required="true"
              aria-labelledby="treatment-frequency-label treatment-frequency-every"
              :aria-describedby="describedby"
              :aria-invalid="invalid"
              :error="invalid"
            />
            <FormSegmented
              class="treatment-form__unit"
              :model-value="values.frequencyUnit"
              :options="unitOptions"
              label-id="treatment-frequency-label"
              compact
              @update:model-value="selectUnit"
            />
          </div>
        </template>
      </FormField>

      <FormField
        v-if="mode !== 'edit'"
        class="treatment-form__field--first-dose-on"
        :label="t('treatments.form.firstDoseOn.label')"
        control-id="treatment-first-dose-on"
        required
        :help="t('treatments.form.firstDoseOn.help')"
        :error="errorText(errors.firstDoseOn)"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="treatment-first-dose-on"
            v-model="values.firstDoseOn"
            class="form-field__input form-field__input--date"
            type="date"
            :min="previous?.earliestOn"
            variant="outlined"
            hide-details
            aria-required="true"
            append-inner-icon="ms:calendar_month"
            :aria-describedby="describedby"
            :aria-invalid="invalid"
            :error="invalid"
          />
        </template>
      </FormField>

      <FormField
        v-else-if="nextDose"
        class="treatment-form__field--next-dose-on"
        :label="t('treatments.form.nextDoseOn.label')"
        control-id="treatment-next-dose-on"
        required
        :help="nextDoseHelp"
        :error="errorText(errors.nextDoseOn)"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="treatment-next-dose-on"
            v-model="values.nextDoseOn"
            class="form-field__input form-field__input--date"
            type="date"
            :min="nextDose.earliest"
            :max="nextDose.latest ?? undefined"
            :disabled="nextDose.refusal !== null"
            variant="outlined"
            hide-details
            aria-required="true"
            append-inner-icon="ms:calendar_month"
            :aria-describedby="describedby"
            :aria-invalid="invalid"
            :error="invalid"
          />
        </template>
      </FormField>

      <TreatmentShiftCheckbox
        v-if="nextDose?.shift"
        v-model="values.shiftsFollowing"
        class="treatment-form__shift"
        :help="nextDoseShift"
      />

      <FormField
        class="treatment-form__field--times"
        :label="t('treatments.form.times.label')"
        label-id="treatment-times-label"
        :error="errorText(errors.times ?? duplicateTimeError)"
      >
        <template #default="{ describedby, invalid }">
          <TreatmentTimesField
            :model-value="values.times"
            label-id="treatment-times-label"
            :describedby="describedby"
            :invalid="invalid"
            @update:model-value="setTimes"
            @duplicate="hasDuplicateTime = $event"
          />
        </template>
      </FormField>

      <FormField
        class="treatment-form__field--reminder"
        :label="t('treatments.form.reminder.label')"
        label-id="treatment-reminder-label"
        has-default
        :help="reminderHelp"
      >
        <template #default="{ describedby }">
          <TreatmentReminderField
            v-model:offset="values.reminderOffset"
            v-model:time="values.reminderTime"
            :has-times="values.times.length > 0"
            :choices="reminderChoices"
            :less-precise="isLessPrecise"
            :suggests-exact="suggestsExact"
            label-id="treatment-reminder-label"
            :describedby="describedby"
            @explain="isExplainerOpen = true"
          />
        </template>
      </FormField>

      <FormField
        class="treatment-form__field--dosage"
        :label="t('treatments.form.dosage.label')"
        label-id="treatment-dosage-label"
        :error="errorText(errors.dosage)"
      >
        <template #default="{ describedby, invalid }">
          <TreatmentDosageField
            v-model:quantity="values.doseQuantity"
            v-model:unit="values.doseUnit"
            :describedby="describedby"
            :invalid="invalid"
          />
        </template>
      </FormField>

      <FormField
        class="treatment-form__field--ends-on"
        :label="t('treatments.form.endsOn.label')"
        control-id="treatment-ends-on"
        :help="endsOnHelp"
        :error="errorText(errors.endsOn)"
      >
        <template #default="{ describedby, invalid }">
          <v-text-field
            id="treatment-ends-on"
            :model-value="values.endsOn"
            class="form-field__input form-field__input--date"
            type="date"
            :min="values.firstDoseOn || undefined"
            variant="outlined"
            hide-details
            :aria-describedby="describedby"
            :aria-invalid="invalid"
            :error="invalid"
            @update:model-value="setEndsOn"
          >
            <template #append-inner>
              <button
                v-if="values.endsOn"
                type="button"
                class="treatment-form__clear"
                :aria-label="t('treatments.form.endsOn.clear')"
                @click="setEndsOn('')"
              >
                <v-icon icon="ms:close" size="18" />
              </button>
              <v-icon icon="ms:calendar_month" />
            </template>
          </v-text-field>
        </template>
      </FormField>
    </template>

    <TreatmentUnloggedPrompt
      v-if="isReady && pastDoses"
      class="treatment-form__past-doses"
      variant="inset"
      :prompt="pastDoses"
      :result="pastDosesAnswered"
      :busy="isSubmitting"
      @act="onPastDosesAction"
      @edit="isChooseDaysOpen = true"
    />

    <TreatmentChooseDays
      v-if="pastDoses"
      v-model="isChooseDaysOpen"
      :subtitle="chooseDaysSubtitle(values.name, animalName, pastDoses.when)"
      :dues="pastDoses.dues"
      :when="pastDoses.when"
      :choice="pastDosesAnswer"
      @confirm="answerPastDoses"
    />

    <TreatmentPastDuesSheet
      v-if="pastDues"
      v-model="isPastDuesOpen"
      :texts="pastDues"
      @choose="answerPastDues"
    />

    <ExactRemindersExplainer
      v-model="isExplainerOpen"
      :back-label="t('treatments.form.reminder.explainerBack')"
    />
  </FormScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

// La case suit l'aide de « Prochaine dose » qu'elle complète (V28).
.treatment-form__shift {
  margin-top: -20px;
}

.treatment-form__loading {
  display: flex;
  justify-content: center;
  padding-block: 48px;
}

.treatment-form__info {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 14px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  color: tokens.$color-text-secondary;
  font-size: 13px;
  line-height: 1.45;
}

.treatment-form__info .v-icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.treatment-form__frequency {
  display: flex;
  align-items: center;
  gap: 10px;
}

.treatment-form__every {
  flex: 0 0 auto;
  color: tokens.$color-field-suffix;
  font-size: 15px;
  font-weight: 500;
}

.treatment-form__frequency-value {
  flex: 0 0 60px;
}

.treatment-form__frequency-value :deep(input) {
  font-weight: 600;
  text-align: center;
}

.treatment-form__unit {
  flex: 1 1 0;
  min-width: 0;
}

.treatment-form__clear {
  display: flex;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  position: relative;
  z-index: 1;
  align-items: center;
  justify-content: center;
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  border-radius: tokens.$radius-pill;
}

.treatment-form__clear .v-icon {
  font-size: 18px;
}
</style>
