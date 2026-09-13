<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  animalFormValuesFrom,
  emptyAnimalFormValues,
  todayIsoDate,
  validateAnimalForm,
  type AnimalFormErrors,
} from './animal-form'
import { ANIMAL_SPECIES, type Animal } from './animal.schema'
import { useAnimalsStore } from './animals.store'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'

const props = defineProps<{
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const values = ref(emptyAnimalFormValues())
const errors = ref<AnimalFormErrors>({})
const existing = ref<Animal | null>(null)
const notFound = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const maxBirthDate = todayIsoDate()

const isEdit = computed(() => props.id !== undefined)
const title = computed(() =>
  existing.value
    ? t('animals.form.editTitle', { name: existing.value.name })
    : t('animals.form.title'),
)
const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return isEdit.value ? t('animals.form.saving') : t('animals.form.submitting')
  }
  return isEdit.value ? t('animals.form.save') : t('animals.form.submit')
})
const errorMessage = computed(() => {
  if (notFound.value) return t('animals.form.errors.notFound')
  if (saveFailed.value) return t('animals.form.errors.save')
  return null
})
const speciesOptions = computed(() =>
  ANIMAL_SPECIES.map((species) => ({
    value: species,
    label: t(`animals.form.species.${species}`),
  })),
)

onMounted(async () => {
  if (props.id === undefined) return

  if (!animals.hasLoaded) await animals.load()
  existing.value = animals.byId(props.id)
  notFound.value = existing.value === null
  if (existing.value) values.value = animalFormValuesFrom(existing.value)
})

function backToAnimals(): void {
  void router.push({ name: 'animals' })
}

async function submit(): Promise<void> {
  if (isSubmitting.value || notFound.value) return

  const result = validateAnimalForm(values.value)
  errors.value = result.success ? {} : result.errors
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    if (props.id !== undefined) {
      await animals.update(props.id, result.data)
    } else {
      await animals.create(result.data)
    }
    backToAnimals()
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <FormScreen
    class="animal-form"
    :title="title"
    :submit-label="submitLabel"
    :is-submitting="isSubmitting"
    :disabled="notFound"
    :error-message="errorMessage"
    @cancel="backToAnimals"
    @submit="submit"
  >
    <FormField
      class="animal-form__field--name"
      :label="t('animals.form.name.label')"
      control-id="animal-name"
      required
      :error="errors.name ? t(errors.name) : null"
    >
      <v-text-field
        id="animal-name"
        v-model="values.name"
        class="form-field__input"
        variant="outlined"
        hide-details
        aria-required="true"
        :error="Boolean(errors.name)"
        :placeholder="t('animals.form.name.placeholder')"
      />
    </FormField>

    <FormField
      class="animal-form__field--species"
      :label="t('animals.form.species.label')"
      label-id="animal-species-label"
      required
      :error="errors.species ? t(errors.species) : null"
    >
      <FormSegmented
        v-model="values.species"
        class="animal-form__species"
        :options="speciesOptions"
        label-id="animal-species-label"
      />
    </FormField>

    <FormField
      class="animal-form__field--breed"
      :label="t('animals.form.breed.label')"
      control-id="animal-breed"
    >
      <v-text-field
        id="animal-breed"
        v-model="values.breed"
        class="form-field__input"
        variant="outlined"
        hide-details
        :placeholder="t('animals.form.breed.placeholder')"
      />
    </FormField>

    <FormField
      class="animal-form__field--birth-date"
      :label="t('animals.form.birthDate.label')"
      control-id="animal-birth-date"
      :error="errors.birthDate ? t(errors.birthDate) : null"
    >
      <v-text-field
        id="animal-birth-date"
        v-model="values.birthDate"
        class="form-field__input form-field__input--date"
        type="date"
        :max="maxBirthDate"
        variant="outlined"
        hide-details
        append-inner-icon="ms:calendar_month"
        :error="Boolean(errors.birthDate)"
      />
    </FormField>

    <FormField
      class="animal-form__field--weight"
      :label="t('animals.form.initialWeightKg.label')"
      control-id="animal-weight"
      :error="errors.initialWeightKg ? t(errors.initialWeightKg) : null"
    >
      <v-text-field
        id="animal-weight"
        v-model="values.initialWeightKg"
        class="form-field__input form-field__input--number"
        type="number"
        inputmode="decimal"
        step="0.1"
        variant="outlined"
        hide-details
        :error="Boolean(errors.initialWeightKg)"
        :placeholder="t('animals.form.initialWeightKg.placeholder')"
        :suffix="t('animals.form.initialWeightKg.suffix')"
      />
    </FormField>
  </FormScreen>
</template>
