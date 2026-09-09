<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  emptyVaccinationFormValues,
  todayIsoDate,
  validateVaccinationForm,
  vaccinationFormValuesFrom,
  type VaccinationFormErrors,
} from './vaccination-form'
import type { Vaccination } from './vaccination.schema'
import { useVaccinationsStore } from './vaccinations.store'
import { useAnimalsStore } from '@/features/animals/animals.store'

const props = defineProps<{
  animalId?: string
  id?: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const vaccinations = useVaccinationsStore()

const values = ref(emptyVaccinationFormValues())
const errors = ref<VaccinationFormErrors>({})
const existing = ref<Vaccination | null>(null)
const notFound = ref(false)
const saveFailed = ref(false)
const isSubmitting = ref(false)
const isScrolled = ref(false)
const maxInjectionDate = todayIsoDate()

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
const submitLabel = computed(() => {
  if (isSubmitting.value) {
    return isEdit.value ? t('vaccinations.form.saving') : t('vaccinations.form.submitting')
  }
  return isEdit.value ? t('vaccinations.form.save') : t('vaccinations.form.submit')
})
const errorMessage = computed(() => {
  if (notFound.value) return t('vaccinations.form.errors.notFound')
  if (saveFailed.value) return t('vaccinations.form.errors.save')
  return null
})

onMounted(async () => {
  if (props.id !== undefined) {
    existing.value = await vaccinations.getById(props.id)
    notFound.value = existing.value === null
    if (existing.value) values.value = vaccinationFormValuesFrom(existing.value)
  }
  if (!animals.hasLoaded) await animals.load()
})

function requireAnimalId(): string {
  if (props.animalId === undefined) throw new Error('Formulaire vaccin ouvert sans animal.')
  return props.animalId
}

function backToAnimals(): void {
  void router.push({ name: 'animals' })
}

function onScroll(event: Event): void {
  isScrolled.value = (event.target as HTMLElement).scrollTop > 2
}

async function submit(): Promise<void> {
  if (isSubmitting.value || notFound.value) return

  const result = validateVaccinationForm(values.value)
  errors.value = result.success ? {} : result.errors
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    if (props.id !== undefined) {
      await vaccinations.update(props.id, result.data)
    } else {
      await vaccinations.create({ animalId: requireAnimalId(), ...result.data })
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
  <div class="vaccination-form">
    <div class="vaccination-form__scroll" @scroll="onScroll">
      <header
        class="vaccination-form__topbar"
        :class="{ 'vaccination-form__topbar--scrolled': isScrolled }"
      >
        <v-btn
          class="vaccination-form__back"
          icon="ms:arrow_back"
          variant="text"
          color="primary"
          :aria-label="t('vaccinations.form.back')"
          @click="backToAnimals"
        />
        <div class="vaccination-form__heading">
          <h1 class="vaccination-form__title">{{ title }}</h1>
          <p v-if="animalName" class="vaccination-form__subtitle">
            {{ t('vaccinations.form.forAnimal', { name: animalName }) }}
          </p>
        </div>
      </header>

      <div class="vaccination-form__fields">
        <div class="vaccination-form__field vaccination-form__field--name">
          <label class="vaccination-form__label" for="vaccination-name">
            <span>{{ t('vaccinations.form.name.label') }}</span>
            <span class="vaccination-form__required" aria-hidden="true">
              {{ t('vaccinations.form.required') }}
            </span>
          </label>
          <v-text-field
            id="vaccination-name"
            v-model="values.name"
            class="vaccination-form__input"
            variant="outlined"
            hide-details
            aria-required="true"
            :error="Boolean(errors.name)"
            :placeholder="t('vaccinations.form.name.placeholder')"
          />
          <p v-if="errors.name" class="vaccination-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.name) }}</span>
          </p>
        </div>

        <div class="vaccination-form__field vaccination-form__field--last-injection-date">
          <label class="vaccination-form__label" for="vaccination-last-injection-date">
            <span>{{ t('vaccinations.form.lastInjectionDate.label') }}</span>
            <span class="vaccination-form__required" aria-hidden="true">
              {{ t('vaccinations.form.required') }}
            </span>
          </label>
          <v-text-field
            id="vaccination-last-injection-date"
            v-model="values.lastInjectionDate"
            class="vaccination-form__input vaccination-form__input--date"
            type="date"
            :max="maxInjectionDate"
            variant="outlined"
            hide-details
            aria-required="true"
            append-inner-icon="ms:calendar_month"
            :error="Boolean(errors.lastInjectionDate)"
          />
          <p v-if="errors.lastInjectionDate" class="vaccination-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.lastInjectionDate) }}</span>
          </p>
        </div>

        <div class="vaccination-form__field vaccination-form__field--due-date">
          <label class="vaccination-form__label" for="vaccination-due-date">
            <span>{{ t('vaccinations.form.dueDate.label') }}</span>
            <span class="vaccination-form__optional">{{ t('vaccinations.form.optional') }}</span>
          </label>
          <v-text-field
            id="vaccination-due-date"
            v-model="values.dueDate"
            class="vaccination-form__input vaccination-form__input--date"
            type="date"
            variant="outlined"
            hide-details
            append-inner-icon="ms:calendar_month"
            :error="Boolean(errors.dueDate)"
          />
          <p v-if="errors.dueDate" class="vaccination-form__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.dueDate) }}</span>
          </p>
        </div>
      </div>
    </div>

    <footer class="vaccination-form__actions">
      <p v-if="errorMessage" class="vaccination-form__save-error" role="alert">
        {{ errorMessage }}
      </p>
      <div class="vaccination-form__buttons">
        <v-btn
          class="vaccination-form__cancel"
          variant="text"
          color="primary"
          :disabled="isSubmitting"
          @click="backToAnimals"
        >
          {{ t('vaccinations.form.cancel') }}
        </v-btn>
        <v-btn
          class="vaccination-form__submit"
          variant="flat"
          color="primary"
          :disabled="isSubmitting || notFound"
          @click="submit"
        >
          <v-progress-circular
            v-if="isSubmitting"
            class="vaccination-form__spinner"
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

.vaccination-form {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.vaccination-form__scroll {
  flex: 1 1 auto;
  overflow-y: auto;
}

.vaccination-form__topbar {
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

.vaccination-form__topbar--scrolled {
  border-bottom-color: tokens.$color-actions-border;
  box-shadow: 0 1px 3px rgb(30 25 20 / 6%);
}

.vaccination-form__back {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
}

.vaccination-form__heading {
  min-width: 0;
}

.vaccination-form__title {
  overflow: hidden;
  font-family: tokens.$font-family-heading;
  font-size: 22px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vaccination-form__subtitle {
  overflow: hidden;
  color: tokens.$color-hint;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.vaccination-form__fields {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 12px 20px 24px;
}

.vaccination-form__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: tokens.$color-field-label;
  font-size: 12.5px;
  font-weight: 600;
}

.vaccination-form__required {
  color: rgb(var(--v-theme-primary));
}

.vaccination-form__optional {
  color: tokens.$color-hint;
  font-weight: 500;
}

.vaccination-form__input :deep(.v-field) {
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;
}

.vaccination-form__input :deep(.v-field__outline) {
  --v-field-border-width: 1px;
  --v-field-border-opacity: 1;

  color: tokens.$color-field-border;
}

.vaccination-form__input :deep(.v-field--focused .v-field__outline),
.vaccination-form__input :deep(.v-field--error .v-field__outline) {
  --v-field-border-width: 2px;
}

.vaccination-form__input :deep(.v-field__input) {
  min-height: tokens.$height-field;
  padding-block: 0;
}

.vaccination-form__input :deep(input::placeholder) {
  color: tokens.$color-placeholder;
  opacity: 1;
}

// L'indicateur natif est rendu transparent puis étiré sous l'icône
// `calendar_month` : taper l'icône ouvre le sélecteur natif, sans JavaScript.
.vaccination-form__input--date :deep(input::-webkit-calendar-picker-indicator) {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 48px;
  opacity: 0;
  cursor: pointer;
}

.vaccination-form__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.vaccination-form__actions {
  flex: 0 0 auto;
  padding: 12px 20px 30px;
  background: tokens.$color-actions-surface;
  border-top: 1px solid tokens.$color-actions-border;
}

.vaccination-form__buttons {
  display: flex;
  align-items: center;
  gap: 12px;
}

.vaccination-form__cancel {
  flex: 0 0 auto;
  letter-spacing: normal;
}

.vaccination-form__submit {
  flex: 1 1 auto;
  gap: 8px;
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.vaccination-form__submit:disabled,
.vaccination-form__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}

.vaccination-form__save-error {
  margin-bottom: 10px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
