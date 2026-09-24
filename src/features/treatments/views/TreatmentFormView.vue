<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import {
  editedNextDueDate,
  emptyTreatmentFormValues,
  nextDoseDate,
  treatmentFormValuesFrom,
  validateTreatmentEditForm,
  validateTreatmentForm,
} from '../logic/treatment-form'
import {
  FREQUENCY_UNITS,
  MAX_FREQUENCY_VALUE,
  TREATMENT_TYPES,
  type FrequencyUnit,
  type Treatment,
} from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { formatLongDate } from '@/shared/utils/format'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { primingReturnRoute, routeAfterReminderSaved } from '@/shared/domain/notification-priming'
import { returnTo } from '@/shared/utils/return-to'

const props = defineProps<{
  animalId?: string
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const { query } = useRoute()
const from = typeof query.from === 'string' ? query.from : undefined
const reminder = typeof query.reminder === 'string' ? query.reminder : undefined
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()

const values = ref(emptyTreatmentFormValues())
const creation = useFormValidation(values, validateTreatmentForm)
const edition = useFormValidation(values, validateTreatmentEditForm)
const errors = computed(() =>
  props.id === undefined ? creation.errors.value : edition.errors.value,
)
const existing = ref<Treatment | null>(null)
const notFound = ref(false)
const isLoading = ref(props.id !== undefined)
const loadFailed = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const { today: maxLastDoseDate } = useToday()

const isEdit = computed(() => props.id !== undefined)
const targetAnimalId = computed(() => existing.value?.animalId ?? props.animalId ?? null)
const animalName = computed(
  () => animals.animals.find((animal) => animal.id === targetAnimalId.value)?.name ?? null,
)
const title = computed(() =>
  existing.value
    ? t('treatments.form.editTitle', { name: existing.value.name })
    : t('treatments.form.title'),
)
const subtitle = computed(() =>
  animalName.value ? t('treatments.form.forAnimal', { name: animalName.value }) : null,
)
const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return isEdit.value ? t('treatments.form.saving') : t('treatments.form.submitting')
  }
  return isEdit.value ? t('treatments.form.save') : t('treatments.form.submit')
})
const errorMessage = computed(() => {
  if (notFound.value) return t('treatments.form.errors.notFound')
  if (loadFailed.value) return t('treatments.form.errors.load')
  if (saveFailed.value) return t('treatments.form.errors.save')
  return null
})
const canSave = computed(() => !isLoading.value && !notFound.value && !loadFailed.value)
const typeOptions = computed(() =>
  TREATMENT_TYPES.map((type) => ({ value: type, label: t(`treatments.type.${type}`) })),
)
const unitCount = computed(() => {
  const count = Number(values.value.frequencyValue)
  return Number.isInteger(count) && count > 0 ? count : 1
})
const unitOptions = computed(() =>
  FREQUENCY_UNITS.map((unit) => ({
    value: unit,
    label: t(`treatments.form.frequency.unit.${unit}`, unitCount.value),
  })),
)
const nextDose = computed(() => {
  const date = isEdit.value ? null : nextDoseDate(values.value)
  return date ? t('treatments.form.nextDose', { date: formatLongDate(date) }) : null
})

watch(
  () => [values.value.frequencyValue, values.value.frequencyUnit],
  () => {
    if (!existing.value) return
    const proposed = editedNextDueDate(values.value, existing.value)
    if (proposed) values.value.nextDueDate = proposed
  },
)

onMounted(async () => {
  if (props.id !== undefined) {
    try {
      existing.value = await treatments.getById(props.id)
      notFound.value = existing.value === null
      if (existing.value) values.value = treatmentFormValuesFrom(existing.value)
    } catch {
      loadFailed.value = true
    } finally {
      isLoading.value = false
    }
  }
  if (!animals.hasLoaded) await animals.load()
})

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire traitement ouvert sans animal.')
  return props.animalId
}

function selectTargetAnimal(): void {
  if (targetAnimalId.value !== null) animals.select(targetAnimalId.value)
}

function backToOrigin(): void {
  selectTargetAnimal()
  returnTo(router, primingReturnRoute(from, reminder))
}

function selectUnit(unit: FrequencyUnit | null): void {
  if (unit) values.value.frequencyUnit = unit
}

function creationWrite(): (() => Promise<unknown>) | null {
  const result = creation.validate()
  if (!result.success) return null
  return () => treatments.create({ animalId: requireAnimalId(), ...result.data })
}

function editionWrite(id: string): (() => Promise<unknown>) | null {
  const result = edition.validate()
  if (!result.success) return null
  return () => treatments.update(id, result.data)
}

async function submit(): Promise<void> {
  if (isSubmitting.value || !canSave.value) return

  const write = props.id === undefined ? creationWrite() : editionWrite(props.id)
  if (write === null) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    await write()
    selectTargetAnimal()
    returnTo(
      router,
      await routeAfterReminderSaved({
        hasDueDate: true,
        animalName: animalName.value,
        kind: 'treatment',
        from,
        reminder,
      }),
    )
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
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
    <FormField
      class="treatment-form__field--name"
      :label="t('treatments.form.name.label')"
      control-id="treatment-name"
      required
      :error="errors.name ? t(errors.name) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="treatment-name"
          v-model="values.name"
          class="form-field__input"
          variant="outlined"
          hide-details
          aria-required="true"
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
      :error="errors.type ? t(errors.type) : null"
    >
      <template #default="{ describedby, invalid }">
        <FormSegmented
          v-model="values.type"
          :options="typeOptions"
          label-id="treatment-type-label"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
        />
      </template>
    </FormField>

    <FormField
      class="treatment-form__field--frequency"
      :label="t('treatments.form.frequency.label')"
      label-id="treatment-frequency-label"
      required
      :error="errors.frequency ? t(errors.frequency) : null"
    >
      <template #default="{ describedby, invalid }">
        <div
          class="treatment-form__frequency"
          role="group"
          aria-labelledby="treatment-frequency-label"
        >
          <div class="treatment-form__frequency-row">
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
          </div>
          <FormSegmented
            class="treatment-form__unit"
            :model-value="values.frequencyUnit"
            :options="unitOptions"
            label-id="treatment-frequency-label"
            @update:model-value="selectUnit"
          />
        </div>
      </template>
    </FormField>

    <FormField
      v-if="isEdit"
      class="treatment-form__field--next-due-date"
      :label="t('treatments.form.nextDueDate.label')"
      control-id="treatment-next-due-date"
      required
      :error="errors.nextDueDate ? t(errors.nextDueDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="treatment-next-due-date"
          v-model="values.nextDueDate"
          class="form-field__input form-field__input--date"
          type="date"
          :min="existing?.lastDoseDate"
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
      v-else
      class="treatment-form__field--last-dose-date"
      :label="t('treatments.form.lastDoseDate.label')"
      control-id="treatment-last-dose-date"
      required
      :error="errors.lastDoseDate ? t(errors.lastDoseDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="treatment-last-dose-date"
          v-model="values.lastDoseDate"
          class="form-field__input form-field__input--date"
          type="date"
          :max="maxLastDoseDate"
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

    <div aria-live="polite">
      <p v-if="nextDose" class="treatment-form__next-dose">
        <v-icon icon="ms:schedule" size="18" />
        <span>{{ nextDose }}</span>
      </p>
    </div>
  </FormScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-form__frequency {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.treatment-form__frequency-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.treatment-form__every {
  flex: 0 0 auto;
  color: tokens.$color-field-suffix;
  font-size: 15px;
  font-weight: 600;
}

.treatment-form__frequency-value {
  flex: 0 0 84px;
}

.treatment-form__next-dose {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: -6px 0 0;
  color: rgb(var(--v-theme-primary));
  font-size: 14px;
  font-weight: 600;
}
</style>
