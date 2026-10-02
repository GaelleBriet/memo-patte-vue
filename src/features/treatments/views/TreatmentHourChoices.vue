<script setup lang="ts">
import type { HourChoice } from '../logic/treatment-other-date'
import type { Due } from '@/shared/domain/treatment-schedule'

withDefaults(defineProps<{ hours: HourChoice[]; busy?: boolean }>(), { busy: false })

const emit = defineEmits<{
  pick: [due: Due]
}>()
</script>

<template>
  <div class="treatment-hours">
    <button
      v-for="choice in hours"
      :key="choice.time"
      type="button"
      class="treatment-hours__hour"
      :disabled="busy || choice.due === null"
      @click="choice.due && emit('pick', choice.due)"
    >
      <v-icon icon="ms:schedule" size="22" />
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
