<script setup lang="ts">
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  emptyWeightFormValues,
  validateWeightForm,
  weightFormValuesFrom,
} from '../logic/weight-form'
import type { WeightEntry } from '../schema/weight.schema'
import { useWeightStore } from '../store/weight.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/components/AnimalChipSelector.vue'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import { focusFirstInvalid } from '@/shared/form/focus-first-invalid'
import { useFormValidation } from '@/shared/form/use-form-validation'
import { formatDayMonthOrYear } from '@/shared/utils/format'
import { showUndoableToast } from '@/shared/utils/toast'

const props = defineProps<{
  /** Animal déjà identifié par le contexte d'ouverture (Carnet) ; `null` ou absent : à choisir. */
  animalId?: string | null
  /** Pesée à corriger ; absente, la feuille en ajoute une. */
  entry?: WeightEntry | null
  /** Reçoit le focus à la fermeture si le contrôle qui a ouvert la feuille a disparu. */
  focusFallback?: HTMLElement | null
}>()

const emit = defineEmits<{
  created: [entry: WeightEntry]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const animals = useAnimalsStore()
const weight = useWeightStore()

const values = ref(initialValues())
const { errors, validate, reset } = useFormValidation(values, validateWeightForm)
const animalErrorId = useId()
const weightErrorId = useId()
const dateErrorId = useId()
const failed = ref<'save' | 'delete' | null>(null)
const pending = ref<'save' | 'delete' | null>(null)
const isSubmitting = computed(() => pending.value !== null)
const { today, refresh: refreshToday } = useToday()
const weightInput = ref<{ focus: () => void } | null>(null)
const form = useTemplateRef<HTMLElement>('form')

const knownAnimalId = computed(() => props.entry?.animalId ?? props.animalId ?? null)
const needsAnimal = computed(() => knownAnimalId.value === null)
const isLocked = computed(() => needsAnimal.value && values.value.animalId === null)
const title = computed(() => (props.entry ? t('weight.form.editTitle') : t('weight.form.title')))
const subtitle = computed(() => {
  const name = knownAnimalId.value ? animals.byId(knownAnimalId.value)?.name : null
  return name ? t('weight.form.forAnimal', { name }) : null
})
const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((animal) => ({ id: animal.id, name: animal.name })),
)
const submitLabel = computed(() =>
  pending.value === 'save' ? t('weight.form.submitting') : t('weight.form.submit'),
)

function initialValues() {
  return props.entry
    ? weightFormValuesFrom(props.entry)
    : emptyWeightFormValues(props.animalId ?? null)
}

// Chaque ouverture repart de la pesée enregistrée, ou d'un formulaire vierge : aucune saisie gardée.
watch(
  open,
  (isOpen) => {
    if (!isOpen) return
    refreshToday()
    values.value = initialValues()
    reset()
    failed.value = null
    if (!animals.hasLoaded) void animals.load()
    // Ajout pour un animal connu : le clavier s'ouvre sur le poids, la saisie tient en deux taps.
    // Sans animal, les champs sont verrouillés : rien à focaliser.
    if (!needsAnimal.value && !props.entry) void nextTick(() => weightInput.value?.focus())
  },
  { immediate: true },
)

async function submit(): Promise<void> {
  if (isSubmitting.value) return

  const result = validate()
  if (!result.success) {
    await nextTick()
    if (form.value) focusFirstInvalid(form.value)
    return
  }

  pending.value = 'save'
  failed.value = null

  try {
    if (props.entry) {
      const { weightKg, measuredOn } = result.data
      await weight.update(props.entry.id, { weightKg, measuredOn })
    } else {
      emit('created', await weight.create(result.data))
    }
    open.value = false
  } catch {
    failed.value = 'save'
  } finally {
    pending.value = null
  }
}

async function remove(): Promise<void> {
  const entry = props.entry
  if (isSubmitting.value || !entry) return

  pending.value = 'delete'
  failed.value = null

  try {
    await weight.remove(entry.id)
    open.value = false
    const date = formatDayMonthOrYear(entry.measuredOn, today.value)
    showUndoableToast(t('weight.form.toast.deleted', { date }), {
      label: t('reminderSheet.undo'),
      ariaLabel: t('weight.form.toast.undoDelete', { date }),
      undo: () => weight.undoRemove(entry.id),
      onUndone: () => {},
      failedMessage: t('reminderSheet.undoFailed'),
    })
  } catch {
    failed.value = 'delete'
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <!-- Pendant l'écriture, un tap sur le voile ne ferme pas : un échec doit rester lisible. -->
  <BottomSheet
    v-model="open"
    class="weight-sheet"
    :title="title"
    :subtitle="subtitle"
    :close-label="t('weight.form.close')"
    :show-close="needsAnimal"
    :persistent="isSubmitting"
    :focus-fallback="focusFallback"
  >
    <div ref="form">
      <div v-if="needsAnimal" class="weight-sheet__field weight-sheet__field--animal">
        <p class="weight-sheet__label">
          <span>{{ t('weight.form.animal.label') }}</span>
          <span class="weight-sheet__required" aria-hidden="true">
            {{ t('weight.form.required') }}
          </span>
        </p>
        <AnimalChipSelector
          v-model:selected-id="values.animalId"
          mode="switch"
          hide-add
          inline
          :animals="chips"
          :describedby="errors.animalId ? animalErrorId : undefined"
          :invalid="Boolean(errors.animalId)"
        />
        <p v-if="errors.animalId" :id="animalErrorId" class="weight-sheet__error">
          <v-icon icon="ms:error_fill" size="16" />
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
            :aria-describedby="errors.weightKg ? weightErrorId : undefined"
            :aria-invalid="Boolean(errors.weightKg)"
            :disabled="isLocked"
            :error="Boolean(errors.weightKg)"
            :placeholder="t('weight.form.weightKg.placeholder')"
            :suffix="t('weight.unit')"
          />
          <p v-if="errors.weightKg" :id="weightErrorId" class="weight-sheet__error">
            <v-icon icon="ms:error_fill" size="16" />
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
            :max="today"
            variant="outlined"
            hide-details
            aria-required="true"
            append-inner-icon="ms:calendar_month"
            :aria-describedby="errors.measuredOn ? dateErrorId : undefined"
            :aria-invalid="Boolean(errors.measuredOn)"
            :disabled="isLocked"
            :error="Boolean(errors.measuredOn)"
          />
          <p v-if="errors.measuredOn" :id="dateErrorId" class="weight-sheet__error">
            <v-icon icon="ms:error_fill" size="16" />
            <span>{{ t(errors.measuredOn) }}</span>
          </p>
        </div>
      </div>
    </div>

    <p v-if="failed" class="weight-sheet__save-error" role="alert">
      {{ failed === 'save' ? t('weight.form.errors.save') : t('weight.form.errors.delete') }}
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

    <div v-if="entry" class="weight-sheet__footer">
      <button type="button" class="weight-sheet__delete" :disabled="isSubmitting" @click="remove">
        <v-icon icon="ms:delete" size="22" />
        <span>{{ t('weight.form.delete') }}</span>
      </button>
    </div>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/shared/form/field-outline' as field;

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

.weight-sheet__input .v-field {
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;
}

.weight-sheet__input {
  @include field.outline;
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

.weight-sheet__input--date .v-field__append-inner .v-icon {
  color: rgb(var(--v-theme-primary));
  font-size: 21px;
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

.weight-sheet__footer {
  margin-top: 14px;
  padding-top: 6px;
  border-top: 1px solid tokens.$color-divider;
}

.weight-sheet__delete {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  font-size: 15.5px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}
</style>
