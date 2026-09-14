<script setup lang="ts">
import { useId } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  label: string
  /** Identifiant du contrôle : rend un `<label for>`. */
  controlId?: string
  /** Identifiant porté par le label quand le contrôle est un groupe (`aria-labelledby`). */
  labelId?: string
  required?: boolean
  error?: string | null
}>()

const { t } = useI18n()
const errorId = useId()
</script>

<template>
  <div class="form-field">
    <component
      :is="controlId ? 'label' : 'span'"
      :id="labelId"
      class="form-field__label"
      :for="controlId"
    >
      <span>{{ label }}</span>
      <span v-if="required" class="form-field__required" aria-hidden="true">
        {{ t('form.required') }}
      </span>
      <span v-else class="form-field__optional">{{ t('form.optional') }}</span>
    </component>
    <slot :describedby="error ? errorId : undefined" :invalid="Boolean(error)" />
    <p v-if="error" :id="errorId" class="form-field__error">
      <v-icon icon="ms:error_fill" size="16" />
      <span>{{ error }}</span>
    </p>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/shared/form/field-outline' as field;

.form-field__label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
  color: tokens.$color-field-label;
  font-size: 12.5px;
  font-weight: 600;
}

.form-field__required {
  color: rgb(var(--v-theme-primary));
}

.form-field__optional {
  color: tokens.$color-hint;
  font-weight: 500;
}

// Les contrôles sont rendus par l'écran dans le slot : ils portent sa portée,
// pas celle de ce composant, d'où l'ancrage sur `.form-field`.
.form-field :deep(.form-field__input .v-field) {
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  font-size: 15px;
}

.form-field :deep(.form-field__input) {
  @include field.outline;
}

.form-field :deep(.form-field__input .v-field__input) {
  min-height: tokens.$height-field;
  padding-block: 0;
}

.form-field :deep(.form-field__input input::placeholder) {
  color: tokens.$color-placeholder;
  opacity: 1;
}

// L'indicateur natif est rendu transparent puis étiré sous l'icône
// `calendar_month` : taper l'icône ouvre le sélecteur natif, sans JavaScript.
.form-field :deep(.form-field__input--date input::-webkit-calendar-picker-indicator) {
  position: absolute;
  inset-block: 0;
  inset-inline-end: 0;
  width: 48px;
  opacity: 0;
  cursor: pointer;
}

.form-field :deep(.form-field__input--number .v-text-field__suffix) {
  color: tokens.$color-field-suffix;
  font-size: 15px;
  font-weight: 600;
}

// Flèches de spin retirées : la maquette n'en montre pas, et elles rétrécissent
// la zone de frappe sur un champ où l'on tape un nombre court.
.form-field :deep(.form-field__input--number input[type='number']) {
  appearance: textfield;
}

.form-field :deep(.form-field__input--number input::-webkit-outer-spin-button),
.form-field :deep(.form-field__input--number input::-webkit-inner-spin-button) {
  appearance: none;
  margin: 0;
}

.form-field__error {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
