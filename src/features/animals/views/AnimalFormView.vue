<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  animalFormValuesFrom,
  birthDateApproximateHelp,
  canMarkBirthDateApproximate,
  emptyAnimalFormValues,
  validateAnimalForm,
  withBirthDate,
} from '../logic/animal-form'
import type { PhotoChange } from '../service/animal-photo.service'
import { ANIMAL_SPECIES, type Animal } from '../schema/animal.schema'
import AnimalPhotoField from './AnimalPhotoField.vue'
import { useAnimalsStore } from '../store/animals.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { pickPhoto } from '@/core/photos/photo-picker'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'
import { weightLimitParams, weightUnitText } from '@/shared/domain/weight-display'
import FormCheckbox from '@/shared/form/FormCheckbox.vue'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { formatLongDate } from '@/shared/utils/format'

const props = defineProps<{
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const { today } = useToday()

const values = ref(emptyAnimalFormValues())
const existing = ref<Animal | null>(null)

const { errors, validate } = useFormValidation(values, validateAnimalForm)

const notFound = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const photo = ref<PhotoChange>({ kind: 'keep' })
const pickedPreview = ref<string | null>(null)
const photoFailed = ref(false)
const isPicking = ref(false)

const photoUrl = usePhotoUrls(() => [existing.value?.photoPath ?? null])

const shownPhotoUrl = computed(() => {
  if (photo.value.kind === 'replace') return pickedPreview.value
  if (photo.value.kind === 'remove') return null
  return photoUrl(existing.value?.photoPath ?? null)
})

const canMarkApproximate = computed(() => canMarkBirthDateApproximate(values.value))
const approximateHelp = computed(() => birthDateApproximateHelp(t, values.value, today.value))

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

function setBirthDate(birthDate: string): void {
  values.value = withBirthDate(values.value, birthDate)
}

function backToAnimals(): void {
  void router.replace({ name: 'animals' })
}

async function choosePhoto(): Promise<void> {
  if (isPicking.value) return
  isPicking.value = true
  photoFailed.value = false
  try {
    const picked = await pickPhoto()
    if (!picked) return
    photo.value = { kind: 'replace', base64: picked.base64 }
    pickedPreview.value = picked.previewUrl
  } catch {
    photoFailed.value = true
  } finally {
    isPicking.value = false
  }
}

function removePhoto(): void {
  photo.value = { kind: 'remove' }
  pickedPreview.value = null
  photoFailed.value = false
}

async function submit(): Promise<void> {
  if (isSubmitting.value || notFound.value || isPicking.value) return

  const result = validate()
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    if (props.id !== undefined) {
      const { weightKg: _weightKg, ...animal } = result.data
      await animals.update(props.id, animal, photo.value)
    } else {
      const created = await animals.create(result.data, photo.value)
      animals.select(created.id)
    }
    backToAnimals()
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
}

onMounted(async () => {
  if (props.id === undefined) return

  if (!animals.hasLoaded) await animals.load()
  existing.value = animals.byId(props.id)
  notFound.value = existing.value === null
  if (existing.value) values.value = animalFormValuesFrom(existing.value)
})
</script>

<template>
  <FormScreen
    class="animal-form"
    :title="title"
    :submit-label="submitLabel"
    :is-submitting="isSubmitting"
    :disabled="notFound || isPicking"
    :error-message="errorMessage"
    @cancel="backToAnimals"
    @submit="submit"
  >
    <AnimalPhotoField
      :photo-url="shownPhotoUrl"
      :error="photoFailed ? t('animals.form.errors.photo') : null"
      :disabled="isSubmitting || notFound || isPicking"
      @pick="choosePhoto"
      @remove="removePhoto"
    />

    <FormField
      class="animal-form__field--name"
      :label="t('animals.form.name.label')"
      control-id="animal-name"
      required
      :error="errors.name ? t(errors.name, { max: MAX_NAME_LENGTH }) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-name"
          v-model="values.name"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input"
          variant="outlined"
          hide-details
          aria-required="true"
          :maxlength="MAX_NAME_LENGTH"
          :error="invalid"
          :placeholder="t('animals.form.name.placeholder')"
        />
      </template>
    </FormField>

    <FormField
      class="animal-form__field--species"
      :label="t('animals.form.species.label')"
      label-id="animal-species-label"
      required
      :error="errors.species ? t(errors.species) : null"
    >
      <template #default="{ describedby, invalid }">
        <FormSegmented
          v-model="values.species"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="animal-form__species"
          :options="speciesOptions"
          label-id="animal-species-label"
        />
      </template>
    </FormField>

    <FormField
      class="animal-form__field--breed"
      :label="t('animals.form.breed.label')"
      control-id="animal-breed"
      :error="errors.breed ? t(errors.breed, { max: MAX_NAME_LENGTH }) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-breed"
          v-model="values.breed"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input"
          variant="outlined"
          hide-details
          :maxlength="MAX_NAME_LENGTH"
          :error="invalid"
          :placeholder="t('animals.form.breed.placeholder')"
        />
      </template>
    </FormField>

    <FormField
      class="animal-form__field--birth-date"
      :label="t('animals.form.birthDate.label')"
      control-id="animal-birth-date"
      :error="errors.birthDate ? t(errors.birthDate) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-birth-date"
          :model-value="values.birthDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :max="today"
          variant="outlined"
          hide-details
          append-inner-icon="ms:calendar_month"
          :error="invalid"
          @update:model-value="setBirthDate"
        />
      </template>
    </FormField>

    <FormCheckbox
      v-model="values.birthDateApproximate"
      class="animal-form__approximate"
      :label="t('animals.form.birthDate.approximate.label')"
      :help="approximateHelp"
      :disabled="!canMarkApproximate"
    />

    <FormField
      v-if="!isEdit"
      class="animal-form__field--weight"
      :label="t('animals.form.weight.label')"
      :help="t('animals.form.weight.help', { date: formatLongDate(today) })"
      control-id="animal-weight"
      :error="errors.weightKg ? t(errors.weightKg, weightLimitParams(t)) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-weight"
          v-model="values.weightKg"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--number"
          type="number"
          inputmode="decimal"
          step="0.1"
          variant="outlined"
          hide-details
          :error="invalid"
          :placeholder="t('animals.form.weight.placeholder')"
          :suffix="weightUnitText(t)"
        />
      </template>
    </FormField>
  </FormScreen>
</template>
