<script setup lang="ts">
defineProps<{
  title: string
  counter?: string | null
}>()
</script>

<template>
  <section class="section-card">
    <div class="section-card__heading">
      <h2 class="section-card__title">{{ title }}</h2>
      <span v-if="counter" class="section-card__counter">{{ counter }}</span>
    </div>
    <slot name="intro" />
    <div v-if="$slots.default" class="section-card__card">
      <slot />
    </div>
  </section>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : les lignes de la carte (`section-card__row`, `__empty`, `__add`)
// sont rendues par les sections qui remplissent le slot.
.section-card {
  padding-inline: tokens.$padding-section-inline;
}

.section-card__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.section-card__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
}

.section-card__counter {
  color: tokens.$color-text-meta;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
}

.section-card__card {
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.section-card__row,
.section-card__empty,
.section-card__add {
  display: flex;
  align-items: center;
  gap: 12px;
  padding-inline: 20px;
}

.section-card__row {
  position: relative;
  min-height: tokens.$height-list-row;
  padding-block: 14px;
}

.section-card__row::before {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: tokens.$width-urgency-bar;
  background: transparent;
  content: '';
}

.section-card__row--overdue::before {
  background: rgb(var(--v-theme-overdue));
}

.section-card__empty {
  min-height: tokens.$height-add-row;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.section-card__row + .section-card__row,
.section-card__row + .section-card__add,
.section-card__empty + .section-card__add,
.section-card__row + .section-card__body,
.section-card__body + .section-card__add {
  border-top: 1px solid tokens.$color-divider;
}

.section-card__add {
  width: 100%;
  min-height: tokens.$height-add-row;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  text-align: start;
  cursor: pointer;
}
</style>
