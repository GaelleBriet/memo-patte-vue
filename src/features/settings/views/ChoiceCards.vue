<script setup lang="ts" generic="T extends string">
export type ChoiceCard<T> = {
  value: T
  icon: string
  label: string
  description: string
  danger?: boolean
}

withDefaults(
  defineProps<{
    choices: ChoiceCard<T>[]
    labelledby: string
    disabled?: boolean
    showRadio?: boolean
  }>(),
  { disabled: false, showRadio: true },
)

const selected = defineModel<T | null>({ required: true })
</script>

<template>
  <div class="choice-cards" role="radiogroup" :aria-labelledby="labelledby">
    <button
      v-for="choice in choices"
      :key="choice.value"
      type="button"
      role="radio"
      class="choice-cards__choice"
      :class="{ 'choice-cards__choice--selected': selected === choice.value }"
      :aria-checked="selected === choice.value"
      :disabled="disabled"
      @click="selected = choice.value"
    >
      <v-icon
        class="choice-cards__icon"
        :class="{ 'choice-cards__icon--danger': choice.danger }"
        :icon="choice.icon"
        size="22"
      />
      <span class="choice-cards__text">
        <span class="choice-cards__label">{{ choice.label }}</span>
        <span class="choice-cards__description">{{ choice.description }}</span>
      </span>
      <span v-if="showRadio" class="choice-cards__radio" aria-hidden="true" />
    </button>
  </div>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.choice-cards {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 18px;
}

.choice-cards__choice {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: tokens.$height-export-choice;
  padding: 12px 18px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-field;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.choice-cards__choice--selected {
  border: 1.5px solid rgb(var(--v-theme-primary));
  background: tokens.$color-choice-selected-surface;
}

.choice-cards__icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.choice-cards__icon--danger {
  color: rgb(var(--v-theme-error));
}

.choice-cards__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  min-width: 0;
}

.choice-cards__label {
  font-size: 15px;
  font-weight: 700;
}

.choice-cards__description {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.choice-cards__radio {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border: 1.5px solid tokens.$color-radio-border;
  border-radius: 50%;
}

.choice-cards__choice--selected .choice-cards__radio {
  border-color: rgb(var(--v-theme-primary));
  background: rgb(var(--v-theme-primary));
}
</style>
