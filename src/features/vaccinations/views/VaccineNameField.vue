<script setup lang="ts">
import { computed, ref, toRef, useId } from 'vue'
import { useI18n } from 'vue-i18n'

import { useVaccineNameSuggestions } from '../composables/use-vaccine-name-suggestions'
import type { AnimalSpecies } from '@/features/animals/schema/animal.schema'
import FormField from '@/shared/form/FormField.vue'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

const props = defineProps<{
  species: AnimalSpecies | null
  error: string | null
}>()
const name = defineModel<string>({ required: true })

const { t } = useI18n()
const { suggestions, hasSuggestions, countText, usedFor, spokenName } = useVaccineNameSuggestions(
  name,
  toRef(props, 'species'),
)

const isTyping = ref(false)
const listId = useId()
const carnetHeadingId = useId()
const combinationsHeadingId = useId()

const isOpen = computed(() => isTyping.value && hasSuggestions.value)

function type(value: string): void {
  name.value = value
  isTyping.value = true
}

function choose(value: string): void {
  name.value = value
  isTyping.value = false
}
</script>

<template>
  <FormField
    class="vaccination-form__field--name"
    :label="t('vaccinations.form.name.label')"
    control-id="vaccination-name"
    required
    :error="error"
  >
    <template #default="{ describedby, invalid }">
      <v-text-field
        id="vaccination-name"
        :model-value="name"
        :aria-describedby="describedby"
        :aria-invalid="invalid"
        class="form-field__input"
        variant="outlined"
        hide-details
        role="combobox"
        aria-autocomplete="list"
        aria-required="true"
        :aria-expanded="isOpen"
        :aria-controls="isOpen ? listId : undefined"
        :maxlength="MAX_NAME_LENGTH"
        :error="invalid"
        :placeholder="t('vaccinations.form.name.placeholder')"
        @update:model-value="type"
        @blur="isTyping = false"
        @keydown.escape="isTyping = false"
      />
      <p class="vaccine-name-field__live" aria-live="polite">{{ isOpen ? countText : '' }}</p>
      <div
        v-if="isOpen"
        :id="listId"
        class="vaccine-name-field__list"
        role="listbox"
        @pointerdown.prevent
        @mousedown.prevent
      >
        <div
          v-if="suggestions.carnet.length > 0"
          class="vaccine-name-field__group"
          role="group"
          :aria-labelledby="carnetHeadingId"
        >
          <p :id="carnetHeadingId" class="vaccine-name-field__heading">
            {{ t('vaccinations.form.name.suggestions.carnet') }}
          </p>
          <button
            v-for="entry in suggestions.carnet"
            :key="entry.name"
            type="button"
            role="option"
            aria-selected="false"
            class="vaccine-name-field__option"
            @click="choose(entry.name)"
          >
            <v-icon icon="ms:history" size="22" class="vaccine-name-field__icon" />
            <span class="vaccine-name-field__text">
              <span class="vaccine-name-field__title">{{ entry.name }}</span>
              <span class="vaccine-name-field__detail">{{ usedFor(entry.animalNames) }}</span>
            </span>
          </button>
        </div>
        <div
          v-if="species && suggestions.combinations.length > 0"
          class="vaccine-name-field__group"
          role="group"
          :aria-labelledby="combinationsHeadingId"
        >
          <p :id="combinationsHeadingId" class="vaccine-name-field__heading">
            {{ t(`vaccinations.form.name.suggestions.combinations.${species}`) }}
          </p>
          <button
            v-for="combination in suggestions.combinations"
            :key="combination.label"
            type="button"
            role="option"
            aria-selected="false"
            :aria-label="spokenName(combination)"
            class="vaccine-name-field__option"
            @click="choose(combination.label)"
          >
            <v-icon icon="ms:vaccines" size="22" class="vaccine-name-field__icon" />
            <span class="vaccine-name-field__text">
              <span class="vaccine-name-field__title">{{ combination.label }}</span>
              <span v-if="combination.aliases.length > 0" class="vaccine-name-field__detail">
                {{ combination.aliases.join(' · ') }}
              </span>
            </span>
          </button>
        </div>
        <button
          v-if="suggestions.typed"
          type="button"
          role="option"
          aria-selected="false"
          class="vaccine-name-field__option vaccine-name-field__typed"
          @click="choose(suggestions.typed)"
        >
          <v-icon icon="ms:edit" size="22" class="vaccine-name-field__icon" />
          <span class="vaccine-name-field__title">
            {{ t('vaccinations.form.name.suggestions.useTyped', { name: suggestions.typed }) }}
          </span>
        </button>
      </div>
    </template>
  </FormField>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.vaccine-name-field__list {
  margin-top: 8px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: tokens.$color-field-surface;
  box-shadow: 0 6px 18px rgb(30 25 20 / 10%);
}

.vaccine-name-field__live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

.vaccine-name-field__heading {
  margin: 0;
  padding: 14px 16px 4px;
  color: tokens.$color-text-meta;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.vaccine-name-field__option {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 10px 16px;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-on-surface));
  font: inherit;
  text-align: start;
}

.vaccine-name-field__group + .vaccine-name-field__group,
.vaccine-name-field__typed,
.vaccine-name-field__option + .vaccine-name-field__option {
  border-top: 1px solid tokens.$color-divider;
}

.vaccine-name-field__icon {
  flex: none;
  color: rgb(var(--v-theme-primary));
}

.vaccine-name-field__text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.vaccine-name-field__title {
  font-size: 15px;
  font-weight: 500;
  overflow-wrap: anywhere;
}

.vaccine-name-field__detail {
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
