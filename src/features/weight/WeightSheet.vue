<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  emptyWeightFormValues,
  todayIsoDate,
  validateWeightForm,
  type WeightFormErrors,
} from './weight-form'
import { useWeightStore } from './weight.store'
import { useAnimalsStore } from '@/features/animals/animals.store'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/AnimalChipSelector.vue'

const props = defineProps<{
  /** Animal déjà identifié par le contexte d'ouverture (Carnet) ; `null` ou absent : à choisir. */
  animalId?: string | null
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const animals = useAnimalsStore()
const weight = useWeightStore()

const values = ref(emptyWeightFormValues(props.animalId ?? null))
const errors = ref<WeightFormErrors>({})
const saveFailed = ref(false)
const isSubmitting = ref(false)
const maxDate = todayIsoDate()
const weightInput = ref<{ focus: () => void } | null>(null)

const needsAnimal = computed(() => !props.animalId)
const isLocked = computed(() => needsAnimal.value && values.value.animalId === null)
const animalName = computed(() =>
  props.animalId ? (animals.byId(props.animalId)?.name ?? null) : null,
)
const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((animal) => ({ id: animal.id, name: animal.name })),
)
const submitLabel = computed(() =>
  isSubmitting.value ? t('weight.form.submitting') : t('weight.form.submit'),
)

// Chaque ouverture repart d'un formulaire vierge : la feuille ne garde aucune saisie.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    values.value = emptyWeightFormValues(props.animalId ?? null)
    errors.value = {}
    saveFailed.value = false
    if (!animals.hasLoaded) void animals.load()
    // Animal connu : le clavier s'ouvre sur le poids, la saisie tient en deux taps.
    // Sans animal, les champs sont verrouillés : rien à focaliser.
    if (!needsAnimal.value) void nextTick(() => weightInput.value?.focus())
  },
  { immediate: true },
)

// Une chip choisie contredirait un « Choisis un animal. » encore affiché.
watch(
  () => values.value.animalId,
  (animalId) => {
    if (animalId !== null) delete errors.value.animalId
  },
)

function close(): void {
  open.value = false
}

async function submit(): Promise<void> {
  if (isSubmitting.value) return

  const result = validateWeightForm(values.value)
  errors.value = result.success ? {} : result.errors
  if (!result.success) return

  isSubmitting.value = true
  saveFailed.value = false

  try {
    await weight.create(result.data)
    close()
  } catch {
    saveFailed.value = true
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <v-bottom-sheet v-model="open" class="weight-sheet" content-class="weight-sheet__content">
    <div class="weight-sheet__panel">
      <button
        type="button"
        class="weight-sheet__handle"
        :aria-label="t('weight.form.close')"
        @click="close"
      />

      <header class="weight-sheet__header">
        <div class="weight-sheet__heading">
          <h2 class="weight-sheet__title">{{ t('weight.form.title') }}</h2>
          <p v-if="animalName" class="weight-sheet__subtitle">
            {{ t('weight.form.forAnimal', { name: animalName }) }}
          </p>
        </div>
        <v-btn
          v-if="needsAnimal"
          class="weight-sheet__close"
          icon="ms:close"
          variant="text"
          :aria-label="t('weight.form.close')"
          @click="close"
        />
      </header>

      <div v-if="needsAnimal" class="weight-sheet__field weight-sheet__field--animal">
        <p class="weight-sheet__label">
          <span>{{ t('weight.form.animal.label') }}</span>
          <span class="weight-sheet__required" aria-hidden="true">
            {{ t('weight.form.required') }}
          </span>
        </p>
        <AnimalChipSelector
          v-model:selected-id="values.animalId"
          class="weight-sheet__animals"
          mode="switch"
          :animals="chips"
        />
        <p v-if="errors.animalId" class="weight-sheet__error">
          <v-icon icon="ms:error" size="16" />
          <span>{{ t(errors.animalId) }}</span>
        </p>
      </div>

      <div class="weight-sheet__fields" :class="{ 'weight-sheet__fields--locked': isLocked }">
        <div class="weight-sheet__field weight-sheet__field--kg">
          <label class="weight-sheet__label" for="weight-sheet-kg">
            <span>{{ t('weight.form.weightKg.label') }}</span>
            <span class="weight-sheet__required" aria-hidden="true">
              {{ t('weight.form.required') }}
            </span>
          </label>
          <v-text-field
            id="weight-sheet-kg"
            ref="weightInput"
            v-model="values.weightKg"
            class="weight-sheet__input"
            variant="outlined"
            hide-details
            inputmode="decimal"
            aria-required="true"
            :disabled="isLocked"
            :error="Boolean(errors.weightKg)"
            :placeholder="t('weight.form.weightKg.placeholder')"
            :suffix="t('weight.unit')"
          />
          <p v-if="errors.weightKg" class="weight-sheet__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.weightKg) }}</span>
          </p>
        </div>

        <div class="weight-sheet__field weight-sheet__field--date">
          <label class="weight-sheet__label" for="weight-sheet-date">
            <span>{{ t('weight.form.measuredOn.label') }}</span>
            <span class="weight-sheet__required" aria-hidden="true">
              {{ t('weight.form.required') }}
            </span>
          </label>
          <v-text-field
            id="weight-sheet-date"
            v-model="values.measuredOn"
            class="weight-sheet__input weight-sheet__input--date"
            type="date"
            :max="maxDate"
            variant="outlined"
            hide-details
            aria-required="true"
            append-inner-icon="ms:calendar_month"
            :disabled="isLocked"
            :error="Boolean(errors.measuredOn)"
          />
          <p v-if="errors.measuredOn" class="weight-sheet__error">
            <v-icon icon="ms:error" size="16" />
            <span>{{ t(errors.measuredOn) }}</span>
          </p>
        </div>
      </div>

      <p v-if="saveFailed" class="weight-sheet__save-error" role="alert">
        {{ t('weight.form.errors.save') }}
      </p>

      <v-btn
        class="weight-sheet__submit"
        variant="flat"
        color="primary"
        :disabled="isSubmitting"
        @click="submit"
      >
        <v-progress-circular
          v-if="isSubmitting"
          class="weight-sheet__spinner"
          indeterminate
          :size="18"
          :width="2"
        />
        {{ submitLabel }}
      </v-btn>
    </div>
  </v-bottom-sheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant, et le voile comme le
// conteneur appartiennent à Vuetify.
.weight-sheet {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.weight-sheet__content {
  margin: 0;
  overflow: visible;
  border-radius: tokens.$radius-sheet tokens.$radius-sheet 0 0;
  background: rgb(var(--v-theme-background));
  box-shadow: tokens.$shadow-sheet;
}

.weight-sheet__panel {
  padding: 8px 20px 24px;
}

.weight-sheet__handle {
  display: block;
  width: 36px;
  height: 4px;
  margin: 0 auto;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: tokens.$color-sheet-handle;
  cursor: pointer;
}

.weight-sheet__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  margin-top: 18px;
}

.weight-sheet__heading {
  min-width: 0;
}

.weight-sheet__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

.weight-sheet__subtitle {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
}

.weight-sheet__close {
  flex: 0 0 auto;
  width: 44px;
  height: 44px;
  margin: -8px -8px 0 0;
  color: tokens.$color-segment-inactive;
}

.weight-sheet__field {
  margin-top: 18px;
}

.weight-sheet__fields--locked {
  opacity: 0.55;
  pointer-events: none;

  .v-field--disabled {
    opacity: 1;
  }
}

.weight-sheet__label {
  display: flex;
  align-items: baseline;
  gap: 4px;
  margin: 0 0 6px;
  color: tokens.$color-field-label;
  font-size: 12.5px;
  font-weight: 600;
}

.weight-sheet__required {
  color: rgb(var(--v-theme-primary));
}

// Le sélecteur partagé déborde sur un header et propose un « + » : ni l'un ni
// l'autre n'ont de sens dans une feuille.
.weight-sheet__animals .animal-chip-selector__row {
  margin-top: 0;
  padding-inline: 0;
}

.weight-sheet__animals .animal-chip-selector__add {
  display: none;
}

.weight-sheet__input .v-field {
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;
}

.weight-sheet__input .v-field__outline {
  --v-field-border-width: 1px;
  --v-field-border-opacity: 1;

  color: tokens.$color-field-border;
}

.weight-sheet__input .v-field--focused .v-field__outline {
  --v-field-border-width: 2px;

  color: rgb(var(--v-theme-primary));
}

.weight-sheet__input .v-field--error .v-field__outline {
  --v-field-border-width: 2px;

  color: rgb(var(--v-theme-error));
}

.weight-sheet__input .v-field__input {
  min-height: tokens.$height-field;
  padding-block: 0;
}

.weight-sheet__input input::placeholder {
  color: tokens.$color-placeholder;
  opacity: 1;
}

// Vuetify n'affiche le suffixe qu'une fois le champ actif : la maquette veut « kg » dès l'ouverture.
.weight-sheet__input .v-text-field__suffix {
  color: tokens.$color-field-suffix;
  font-weight: 700;
  opacity: 1;
}

// L'indicateur natif est rendu transparent puis étiré sous l'icône
// `calendar_month` : taper l'icône ouvre le sélecteur natif, sans JavaScript.
.weight-sheet__input--date input::-webkit-calendar-picker-indicator {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 48px;
  opacity: 0;
  cursor: pointer;
}

.weight-sheet__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 6px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.weight-sheet__save-error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}

.weight-sheet__submit {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 22px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.weight-sheet__submit:disabled,
.weight-sheet__submit.v-btn--disabled {
  background: tokens.$color-disabled-surface;
  color: tokens.$color-disabled-text;
}
</style>
