<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  emptyVaccinationFormValues,
  enteredInjectionDate,
  hasInjection,
  minPlannedDate,
  plannedDateHelp,
  reminderSummary,
  validateVaccinationForm,
  vaccinationFormValuesFrom,
  withInjectionDate,
  type VaccinationFormContext,
} from '../logic/vaccination-form'
import { earliestOtherDate } from '../logic/vaccination-sheet'
import type { Vaccination } from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'
import NextReminderChoices from './NextReminderChoices.vue'
import VaccinationReminderSheet from './VaccinationReminderSheet.vue'
import VaccineNameField from './VaccineNameField.vue'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { submitLabelKey } from '@/shared/form/form-screen'
import { useCareForm } from '@/shared/composables/use-care-form'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const props = defineProps<{
  animalId?: string
  id?: string
}>()

const { t } = useI18n()
const animals = useAnimalsStore()
const vaccinations = useVaccinationsStore()
const { today } = useToday()

const values = ref(emptyVaccinationFormValues())
const existing = ref<Vaccination | null>(null)
const reminderLabelId = useId()
const isOtherDateOpen = ref(false)

const sameName = ref<Vaccination | null>(null)
const isSameNameDialogOpen = ref(false)
const isDoneSheetOpen = ref(false)
const doneSheetInjectedOn = ref<string | null>(null)
const isCheckingName = ref(false)

const {
  from,
  isSubmitting,
  isSaved,
  targetAnimal,
  animalName,
  failure,
  canSave,
  selectTargetAnimal,
  backToOrigin,
  saveThenLeave,
} = useCareForm({
  kind: 'vaccination',
  animals,
  id: () => props.id,
  animalId: () => props.animalId,
  openedAnimalId: () => existing.value?.animalId,
  allowsUnfollowedAnimal: () => props.id !== undefined,
  load: (id) => vaccinations.getById(id),
  open,
})

const context = computed((): VaccinationFormContext => ({
  today: today.value,
  currentPlannedDate:
    existing.value?.lastInjectionDate === null ? (existing.value.dueDate ?? undefined) : undefined,
}))

const { errors, validate } = useFormValidation(values, (current) =>
  validateVaccinationForm(current, context.value),
)

const isEdit = computed(() => props.id !== undefined)
const animalSpecies = computed(() => targetAnimal.value?.species ?? null)
const title = computed(() =>
  existing.value
    ? t('vaccinations.form.editTitle', { name: existing.value.name })
    : t('vaccinations.form.title'),
)
const subtitle = computed(() =>
  animalName.value ? t('vaccinations.form.forAnimal', { name: animalName.value }) : null,
)
const submitLabel = computed(() =>
  t(`vaccinations.form.${submitLabelKey(isEdit.value, isSubmitting.value)}`),
)
const errorMessage = computed(() =>
  failure.value === null ? null : t(`vaccinations.form.errors.${failure.value}`),
)
const isInjected = computed(() => hasInjection(values.value))
const injectionHelp = computed(() =>
  isInjected.value ? null : t('vaccinations.form.lastInjectionDate.help'),
)
const plannedHelp = computed(() => plannedDateHelp(t, values.value.plannedDate, today.value))
const summary = computed(() => reminderSummary(t, values.value))
const otherDate = computed(() =>
  values.value.reminder?.kind === 'otherDate' ? values.value.reminder.date : null,
)

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire vaccin ouvert sans animal.')
  return props.animalId
}

function open(loaded: Vaccination): void {
  existing.value = loaded
  values.value = vaccinationFormValuesFrom(loaded)
}

async function findSameName(): Promise<Vaccination | null> {
  if (props.animalId === undefined || values.value.name.trim() === '') return null
  try {
    return await vaccinations.findSameName(props.animalId, values.value.name)
  } catch {
    return null
  }
}

async function submit(): Promise<void> {
  if (isSubmitting.value || isCheckingName.value || !canSave.value) return

  if (!isEdit.value) {
    isCheckingName.value = true
    sameName.value = await findSameName()
    isCheckingName.value = false
    if (sameName.value !== null) {
      isSameNameDialogOpen.value = true
      return
    }
  }
  await save()
}

function enterInjectionDate(date: string): void {
  values.value = withInjectionDate(values.value, date)
}

function pickOtherDate(date: string): void {
  values.value.reminder = { kind: 'otherDate', date }
}

function noteBooster(): void {
  doneSheetInjectedOn.value = enteredInjectionDate(values.value)
  isDoneSheetOpen.value = true
}

async function save(): Promise<void> {
  if (isSubmitting.value || isSaved.value) return

  const result = validate()
  if (!result.success) return

  const { id } = props
  await saveThenLeave(
    () =>
      id !== undefined
        ? vaccinations.update(id, { name: result.data.name, dueDate: result.data.dueDate })
        : vaccinations.create({ animalId: requireAnimalId(), ...result.data }),
    result.data.dueDate !== null,
  )
}
</script>

<template>
  <FormScreen
    class="vaccination-form"
    :title="title"
    :subtitle="subtitle"
    :submit-label="submitLabel"
    :is-submitting="isSubmitting"
    :disabled="!canSave"
    :error-message="errorMessage"
    @cancel="backToOrigin"
    @submit="submit"
  >
    <VaccineNameField
      v-model="values.name"
      :species="animalSpecies"
      :error="errors.name ? t(errors.name, { max: MAX_NAME_LENGTH }) : null"
    />

    <FormField
      v-if="!isEdit"
      class="vaccination-form__field--last-injection-date"
      :label="t('vaccinations.form.lastInjectionDate.label')"
      control-id="vaccination-last-injection-date"
      :help="injectionHelp"
      :error="errors.lastInjectionDate ? t(errors.lastInjectionDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="vaccination-last-injection-date"
          :model-value="values.lastInjectionDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :max="today"
          variant="outlined"
          hide-details
          append-inner-icon="ms:calendar_month"
          :error="invalid"
          @update:model-value="enterInjectionDate"
        />
      </template>
    </FormField>

    <FormField
      v-if="isInjected"
      class="vaccination-form__field--next-reminder"
      :label="t('vaccinations.form.nextReminder.label')"
      :label-id="reminderLabelId"
    >
      <NextReminderChoices
        v-model="values.reminder"
        :label-id="reminderLabelId"
        @other-date="isOtherDateOpen = true"
      />
      <p v-if="summary" class="vaccination-form__summary" aria-live="polite">{{ summary }}</p>
    </FormField>

    <FormField
      v-else
      class="vaccination-form__field--next-reminder"
      :label="t('vaccinations.form.nextReminder.label')"
      control-id="vaccination-planned-date"
      required
      :help="plannedHelp"
      :error="errors.plannedDate ? t(errors.plannedDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="vaccination-planned-date"
          v-model="values.plannedDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :min="minPlannedDate(context)"
          variant="outlined"
          hide-details
          aria-required="true"
          append-inner-icon="ms:calendar_month"
          :error="invalid"
        />
      </template>
    </FormField>
  </FormScreen>

  <ConfirmDialog
    v-if="sameName"
    v-model="isSameNameDialogOpen"
    tone="primary"
    :title="t('vaccinations.form.duplicate.title', { name: sameName.name })"
    :text="t('vaccinations.form.duplicate.text', { name: sameName.name, animal: animalName ?? '' })"
    :cancel-label="t('vaccinations.form.duplicate.cancel')"
    :confirm-label="t('vaccinations.form.duplicate.confirm')"
    @cancel="save"
    @confirm="noteBooster"
  />
  <DatePickerSheet
    v-model="isOtherDateOpen"
    :title="t('vaccinations.sheet.dueDate.title')"
    :close-label="t('reminderSheet.close')"
    :date="otherDate"
    :min="earliestOtherDate(today)"
    @pick="pickOtherDate"
  />
  <VaccinationReminderSheet
    v-if="sameName"
    v-model="isDoneSheetOpen"
    :vaccination-id="sameName.id"
    start-at="done"
    :initial-injected-on="doneSheetInjectedOn"
    :return-to="from ?? 'animals'"
    @changed="selectTargetAnimal"
  />
</template>

<style scoped lang="scss">
.vaccination-form__summary {
  margin: 10px 0 0;
  color: rgb(var(--v-theme-primary));
  font-size: 14px;
  font-weight: 600;
}
</style>
