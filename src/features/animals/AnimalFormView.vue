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
import { ANIMAL_SPECIES, type Animal, type AnimalSpecies } from './animal.schema'
import { useAnimalsStore } from './animals.store'

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
const isScrolled = ref(false)
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

function onScroll(event: Event): void {
  isScrolled.value = (event.target as HTMLElement).scrollTop > 2
}

function selectSpecies(value: unknown): void {
  values.value.species = ANIMAL_SPECIES.includes(value as AnimalSpecies)
    ? (value as AnimalSpecies)
    : null
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
  <div class="animal-form">
    <div class="animal-form__scroll" @scroll="onScroll">
      <header class="animal-form__topbar" :class="{ 'animal-form__topbar--scrolled': isScrolled }">
        <v-btn
          class="animal-form__back"
          icon="ms:arrow_back"
          variant="text"
          color="primary"
          :aria-label="t('animals.form.back')"
          @click="backToAnimals"
        />
        <h1 class="animal-form__title">{{ title }}</h1>
      </header>

      <div class="animal-form__fields">
        <div class="animal-form__field animal-form__field--name">
          <label class="animal-form__label" for="animal-name">
            <span>{{ t('animals.form.name.label') }}</span>
            <span class="animal-form__required" aria-hidden="true">
              {{ t('animals.form.required') }}
            </span>
          </label>
          <v-text-field
            id="animal-name"
            v-model="values.name"
            class="animal-form__input"
            variant="outlined"
            hide-details
            aria-required="true"
            :error="Boolean(errors.name)"
            :placeholder="t('animals.form.name.placeholder')"
          />
          <p v-if="errors.name" class="animal-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.name) }}</span>
          </p>
        </div>

        <div class="animal-form__field animal-form__field--species">
          <span id="animal-species-label" class="animal-form__label">
            <span>{{ t('animals.form.species.label') }}</span>
            <span class="animal-form__required" aria-hidden="true">
              {{ t('animals.form.required') }}
            </span>
          </span>
          <v-btn-toggle
            class="animal-form__species"
            role="radiogroup"
            aria-labelledby="animal-species-label"
            divided
            variant="flat"
            base-color="surface"
            color="primary"
            selected-class="animal-form__species-option--selected"
            :model-value="values.species ?? undefined"
            @update:model-value="selectSpecies"
          >
            <v-btn
              v-for="species in ANIMAL_SPECIES"
              :key="species"
              class="animal-form__species-option"
              :value="species"
              role="radio"
              :aria-checked="values.species === species"
            >
              <v-icon v-if="values.species === species" icon="ms:check" size="18" />
              <span>{{ t(`animals.form.species.${species}`) }}</span>
            </v-btn>
          </v-btn-toggle>
          <p v-if="errors.species" class="animal-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.species) }}</span>
          </p>
        </div>

        <div class="animal-form__field animal-form__field--breed">
          <label class="animal-form__label" for="animal-breed">
            <span>{{ t('animals.form.breed.label') }}</span>
            <span class="animal-form__optional">{{ t('animals.form.optional') }}</span>
          </label>
          <v-text-field
            id="animal-breed"
            v-model="values.breed"
            class="animal-form__input"
            variant="outlined"
            hide-details
            :placeholder="t('animals.form.breed.placeholder')"
          />
        </div>

        <div class="animal-form__field animal-form__field--birth-date">
          <label class="animal-form__label" for="animal-birth-date">
            <span>{{ t('animals.form.birthDate.label') }}</span>
            <span class="animal-form__optional">{{ t('animals.form.optional') }}</span>
          </label>
          <v-text-field
            id="animal-birth-date"
            v-model="values.birthDate"
            class="animal-form__input animal-form__input--date"
            type="date"
            :max="maxBirthDate"
            variant="outlined"
            hide-details
            append-inner-icon="ms:calendar_month"
            :error="Boolean(errors.birthDate)"
          />
          <p v-if="errors.birthDate" class="animal-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.birthDate) }}</span>
          </p>
        </div>

        <div class="animal-form__field animal-form__field--weight">
          <label class="animal-form__label" for="animal-weight">
            <span>{{ t('animals.form.initialWeightKg.label') }}</span>
            <span class="animal-form__optional">{{ t('animals.form.optional') }}</span>
          </label>
          <v-text-field
            id="animal-weight"
            v-model="values.initialWeightKg"
            class="animal-form__input animal-form__input--number"
            type="number"
            inputmode="decimal"
            step="0.1"
            variant="outlined"
            hide-details
            :error="Boolean(errors.initialWeightKg)"
            :placeholder="t('animals.form.initialWeightKg.placeholder')"
            :suffix="t('animals.form.initialWeightKg.suffix')"
          />
          <p v-if="errors.initialWeightKg" class="animal-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.initialWeightKg) }}</span>
          </p>
        </div>
      </div>
    </div>

    <footer class="animal-form__actions">
      <p v-if="errorMessage" class="animal-form__save-error" role="alert">
        {{ errorMessage }}
      </p>
      <div class="animal-form__buttons">
        <v-btn
          class="animal-form__cancel"
          variant="text"
          color="primary"
          :disabled="isSubmitting"
          @click="backToAnimals"
        >
          {{ t('animals.form.cancel') }}
        </v-btn>
        <v-btn
          class="animal-form__submit"
          variant="flat"
          color="primary"
          :disabled="isSubmitting || notFound"
          @click="submit"
        >
          <v-progress-circular
            v-if="isSubmitting"
            class="animal-form__spinner"
            indeterminate
            :size="18"
            :width="2"
          />
          {{ submitLabel }}
        </v-btn>
      </div>
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.animal-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.animal-form__scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.animal-form__topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgb(var(--v-theme-background));
  border-bottom: 1px solid transparent;
}

.animal-form__topbar--scrolled {
  border-bottom-color: tokens.$color-actions-border;
  box-shadow: 0 1px 3px rgb(30 25 20 / 6%);
}

.animal-form__back {
  width: 48px;
  height: 48px;
}

.animal-form__title {
  overflow: hidden;
  font-family: tokens.$font-family-heading;
  font-size: 22px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.animal-form__fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 20px 24px;
}

.animal-form__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: tokens.$color-field-label;
  font-size: 12.5px;
  font-weight: 600;
}

.animal-form__required {
  color: rgb(var(--v-theme-primary));
}

.animal-form__optional {
  color: tokens.$color-hint;
  font-weight: 500;
}

.animal-form__input :deep(.v-field) {
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;
}

.animal-form__input :deep(.v-field__outline) {
  --v-field-border-width: 1px;
  --v-field-border-opacity: 1;

  color: tokens.$color-field-border;
}

.animal-form__input :deep(.v-field--focused .v-field__outline),
.animal-form__input :deep(.v-field--error .v-field__outline) {
  --v-field-border-width: 2px;
}

.animal-form__input :deep(.v-field__input) {
  min-height: tokens.$height-field;
  padding-block: 0;
}

.animal-form__input :deep(input::placeholder) {
  color: tokens.$color-placeholder;
  opacity: 1;
}

.animal-form__input--number :deep(.v-text-field__suffix) {
  color: tokens.$color-field-suffix;
  font-size: 15px;
  font-weight: 600;
}

// Flèches de spin retirées : la maquette n'en montre pas, et elles rétrécissent
// la zone de frappe sur un champ où l'on tape un nombre court.
.animal-form__input--number :deep(input[type='number']) {
  appearance: textfield;
}

.animal-form__input--number :deep(input::-webkit-outer-spin-button),
.animal-form__input--number :deep(input::-webkit-inner-spin-button) {
  appearance: none;
  margin: 0;
}

// L'indicateur natif est rendu transparent puis étiré sous l'icône
// `calendar_month` : taper l'icône ouvre le sélecteur natif, sans JavaScript.
.animal-form__input--date :deep(input::-webkit-calendar-picker-indicator) {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 48px;
  opacity: 0;
  cursor: pointer;
}

.animal-form__species {
  width: 100%;
  height: tokens.$height-segmented;
  border: 1px solid tokens.$color-segmented-border;
  border-radius: 999px;
  overflow: hidden;
}

.animal-form__species :deep(.v-btn) {
  flex: 1 1 0;
  height: 100%;
  gap: 6px;
  border-radius: 0;
  color: tokens.$color-segment-inactive;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: normal;
}

.animal-form__species-option--selected {
  color: rgb(var(--v-theme-background));
  font-weight: 700;
}

.animal-form__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.animal-form__actions {
  flex: 0 0 auto;
  padding: 12px 20px 30px;
  background: tokens.$color-actions-surface;
  border-top: 1px solid tokens.$color-actions-border;
}

.animal-form__buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.animal-form__cancel {
  flex: 0 0 auto;
  letter-spacing: normal;
}

.animal-form__submit {
  flex: 1 1 auto;
  gap: 8px;
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.animal-form__submit:disabled,
.animal-form__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}

.animal-form__save-error {
  margin-bottom: 10px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
