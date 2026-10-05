<script setup lang="ts">
import type { HourChoice } from '../logic/treatment-other-date'
import type { Due } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    hours: HourChoice[]
    busy?: boolean
    /** L'heure se choisit, puis s'enregistre ailleurs ; sinon un tap note la dose. */
    selectable?: boolean
  }>(),
  { busy: false, selectable: false },
)

const emit = defineEmits<{
  pick: [due: Due]
}>()

const selected = defineModel<string | null>({ default: null })

function choose(choice: HourChoice): void {
  if (choice.due === null) return
  if (props.selectable) selected.value = choice.time
  else emit('pick', choice.due)
}
</script>

<template>
  <div class="treatment-hours">
    <button
      v-for="choice in hours"
      :key="choice.time"
      type="button"
      class="treatment-hours__hour"
      :class="{ 'treatment-hours__hour--selected': selectable && selected === choice.time }"
      :disabled="busy || choice.due === null"
      :aria-pressed="selectable ? selected === choice.time : undefined"
      @click="choose(choice)"
    >
      <v-icon
        :icon="selectable && selected === choice.time ? 'ms:check_circle_fill' : 'ms:schedule'"
        size="22"
      />
      <span class="treatment-hours__text">
        <span class="treatment-hours__label">{{ choice.label }}</span>
        <span class="treatment-hours__detail">{{ choice.detail }}</span>
      </span>
    </button>
  </div>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la liste vit dans une feuille téléportée hors du composant.
.treatment-hours {
  margin-top: 18px;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
}

.treatment-hours__hour {
  display: flex;
  align-items: center;
  gap: 16px;
  width: 100%;
  min-height: 64px;
  padding: 10px 18px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.treatment-hours__hour--selected {
  background: tokens.$color-notice-surface;
}

.treatment-hours__hour + .treatment-hours__hour {
  border-top: 1px solid tokens.$color-divider;
}

.treatment-hours__text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.treatment-hours__label {
  font-size: 15.5px;
  font-weight: 600;
}

.treatment-hours__detail {
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}
</style>
