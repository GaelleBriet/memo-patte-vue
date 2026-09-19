<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  animalFormValuesFrom,
  emptyAnimalFormValues,
  validateAnimalForm,
} from '../logic/animal-form'
import type { PhotoChange } from '../service/animal-photo.service'
import { ANIMAL_SPECIES, type Animal } from '../schema/animal.schema'
import AnimalPhotoField from './AnimalPhotoField.vue'
import { useAnimalsStore } from '../store/animals.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { pickPhoto } from '@/core/photos/photo-picker'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import FormField from '@/shared/form/FormField.vue'
import FormScreen from '@/shared/form/FormScreen.vue'
import FormSegmented from '@/shared/form/FormSegmented.vue'
import { useFormValidation } from '@/shared/form/use-form-validation'

const props = defineProps<{
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const values = ref(emptyAnimalFormValues())
const { errors, validate } = useFormValidation(values, validateAnimalForm)
const existing = ref<Animal | null>(null)
const notFound = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const { today: maxBirthDate } = useToday()
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
      await animals.update(props.id, result.data, photo.value)
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
      :error="errors.name ? t(errors.name) : null"
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
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-birth-date"
          v-model="values.birthDate"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--date"
          type="date"
          :max="maxBirthDate"
          variant="outlined"
          hide-details
          append-inner-icon="ms:calendar_month"
          :error="invalid"
        />
      </template>
    </FormField>

    <FormField
      class="animal-form__field--weight"
      :label="t('animals.form.initialWeightKg.label')"
      control-id="animal-weight"
      :error="errors.initialWeightKg ? t(errors.initialWeightKg) : null"
    >
      <template #default="{ describedby, invalid }">
        <v-text-field
          id="animal-weight"
          v-model="values.initialWeightKg"
          :aria-describedby="describedby"
          :aria-invalid="invalid"
          class="form-field__input form-field__input--number"
          type="number"
          inputmode="decimal"
          step="0.1"
          variant="outlined"
          hide-details
          :error="invalid"
          :placeholder="t('animals.form.initialWeightKg.placeholder')"
          :suffix="t('animals.form.initialWeightKg.suffix')"
        />
      </template>
    </FormField>
  </FormScreen>
</template>
