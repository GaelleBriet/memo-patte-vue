<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  emptyTreatmentFormValues,
  nextDoseDate,
  treatmentFormValuesFrom,
  validateTreatmentForm,
} from './treatment-form'
import {
  FREQUENCY_UNITS,
  TREATMENT_TYPES,
  type FrequencyUnit,
  type Treatment,
} from './treatment.schema'
import { useTreatmentsStore } from './treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/animals.store'
import { formatLongDate } from '@/shared/format'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { routeAfterReminderSaved } from '@/shared/notification-priming'

const props = defineProps<{
  animalId?: string
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()

const values = ref(emptyTreatmentFormValues())
const { errors, validate } = useFormValidation(values, validateTreatmentForm)
const existing = ref<Treatment | null>(null)
const notFound = ref(false)
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
  if (saveFailed.value) return t('treatments.form.errors.save')
  return null
})
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
  const date = nextDoseDate(values.value)
  return date ? t('treatments.form.nextDose', { date: formatLongDate(date) }) : null
})

onMounted(async () => {
  if (props.id !== undefined) {
    existing.value = await treatments.getById(props.id)
    notFound.value = existing.value === null
    if (existing.value) values.value = treatmentFormValuesFrom(existing.value)
  }
  if (!animals.hasLoaded) await animals.load()
})

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire traitement ouvert sans animal.')
  return props.animalId
}

function backToAnimals(): void {
  void router.push({ name: 'animals' })
}

function selectUnit(unit: FrequencyUnit | null): void {
  if (unit) values.value.frequencyUnit = unit
}

async function submit(): Promise<void> {
  if (isSubmitting.value || notFound.value) return

  const result = validate()
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    if (props.id !== undefined) {
      await treatments.update(props.id, result.data)
    } else {
      await treatments.create({ animalId: requireAnimalId(), ...result.data })
    }
    void router.push(
      await routeAfterReminderSaved({
        hasDueDate: true,
        animalName: animalName.value,
        kind: 'treatment',
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
    :disabled="notFound"
    :error-message="errorMessage"
    @cancel="backToAnimals"
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
              min="1"
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
