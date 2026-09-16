<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  emptyVaccinationFormValues,
  validateVaccinationForm,
  vaccinationFormValuesFrom,
} from './vaccination-form'
import type { Vaccination } from './vaccination.schema'
import { useVaccinationsStore } from './vaccinations.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/animals.store'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { routeAfterReminderSaved } from '@/shared/notification-priming'

const props = defineProps<{
  animalId?: string
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const vaccinations = useVaccinationsStore()

const values = ref(emptyVaccinationFormValues())
const { errors, validate } = useFormValidation(values, validateVaccinationForm)
const existing = ref<Vaccination | null>(null)
const notFound = ref(false)
const isLoading = ref(props.id !== undefined)
const loadFailed = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const { today: maxInjectionDate } = useToday()

const isEdit = computed(() => props.id !== undefined)
const targetAnimalId = computed(() => existing.value?.animalId ?? props.animalId ?? null)
const animalName = computed(
  () => animals.animals.find((animal) => animal.id === targetAnimalId.value)?.name ?? null,
)
const title = computed(() =>
  existing.value
    ? t('vaccinations.form.editTitle', { name: existing.value.name })
    : t('vaccinations.form.title'),
)
const subtitle = computed(() =>
  animalName.value ? t('vaccinations.form.forAnimal', { name: animalName.value }) : null,
)
const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return isEdit.value ? t('vaccinations.form.saving') : t('vaccinations.form.submitting')
  }
  return isEdit.value ? t('vaccinations.form.save') : t('vaccinations.form.submit')
})
const errorMessage = computed(() => {
  if (notFound.value) return t('vaccinations.form.errors.notFound')
  if (loadFailed.value) return t('vaccinations.form.errors.load')
  if (saveFailed.value) return t('vaccinations.form.errors.save')
  return null
})
const canSave = computed(() => !isLoading.value && !notFound.value && !loadFailed.value)

onMounted(async () => {
  if (props.id !== undefined) {
    try {
      existing.value = await vaccinations.getById(props.id)
      notFound.value = existing.value === null
      if (existing.value) values.value = vaccinationFormValuesFrom(existing.value)
    } catch {
      loadFailed.value = true
    } finally {
      isLoading.value = false
    }
  }
  if (!animals.hasLoaded) await animals.load()
})

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire vaccin ouvert sans animal.')
  return props.animalId
}

function selectTargetAnimal(): void {
  if (targetAnimalId.value !== null) animals.select(targetAnimalId.value)
}

function backToAnimals(): void {
  selectTargetAnimal()
  void router.replace({ name: 'animals' })
}

async function submit(): Promise<void> {
  if (isSubmitting.value || !canSave.value) return

  const result = validate()
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    if (props.id !== undefined) {
      await vaccinations.update(props.id, result.data)
    } else {
      await vaccinations.create({ animalId: requireAnimalId(), ...result.data })
    }
    selectTargetAnimal()
    void router.replace(
      await routeAfterReminderSaved({
        hasDueDate: result.data.dueDate !== null,
        animalName: animalName.value,
        kind: 'vaccination',
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
    class="vaccination-form"
    :title="title"
    :subtitle="subtitle"
    :submit-label="submitLabel"
    :is-submitting="isSubmitting"
    :disabled="!canSave"
    :error-message="errorMessage"
    @cancel="backToAnimals"
    @submit="submit"
  >
    <FormField
      class="vaccination-form__field--name"
      :label="t('vaccinations.form.name.label')"
      control-id="vaccination-name"
      required
      :error="errors.name ? t(errors.name) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="vaccination-name"
          v-model="values.name"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input"
          variant="outlined"
          hide-details
          aria-required="true"
          :error="invalid"
          :placeholder="t('vaccinations.form.name.placeholder')"
        />
      </template>
    </FormField>

    <FormField
      class="vaccination-form__field--last-injection-date"
      :label="t('vaccinations.form.lastInjectionDate.label')"
      control-id="vaccination-last-injection-date"
      required
      :error="errors.lastInjectionDate ? t(errors.lastInjectionDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="vaccination-last-injection-date"
          v-model="values.lastInjectionDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :max="maxInjectionDate"
          variant="outlined"
          hide-details
          aria-required="true"
          append-inner-icon="ms:calendar_month"
          :error="invalid"
        />
      </template>
    </FormField>

    <FormField
      class="vaccination-form__field--due-date"
      :label="t('vaccinations.form.dueDate.label')"
      control-id="vaccination-due-date"
      :error="errors.dueDate ? t(errors.dueDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="vaccination-due-date"
          v-model="values.dueDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          variant="outlined"
          hide-details
          append-inner-icon="ms:calendar_month"
          :error="invalid"
        />
      </template>
    </FormField>
  </FormScreen>
</template>
