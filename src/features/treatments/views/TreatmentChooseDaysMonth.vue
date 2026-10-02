<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  dayLabel,
  missedAmong,
  monthToggle,
  type ChooseDaysMonth,
  type Unchecked,
} from '../logic/treatment-choose-days'
import type { Due } from '@/shared/domain/treatment-schedule'

const props = defineProps<{
  month: ChooseDaysMonth
  unchecked: Unchecked
  weekdays: string[]
  /** Seul mois du calendrier : « Tout cocher / Tout décocher » suffit. */
  alone: boolean
}>()

const emit = defineEmits<{
  toggle: [due: Due]
  set: [dues: Due[], checked: boolean]
}>()

const { t } = useI18n()

const toggleAll = computed(() =>
  props.alone ? null : monthToggle(t, props.month, missedAmong(props.month.dues, props.unchecked)),
)
</script>

<template>
  <section class="choose-days-month" :aria-label="month.title">
    <div class="choose-days-month__head">
      <div class="choose-days-month__name">
        <h2 class="choose-days-month__title">{{ month.title }}</h2>
        <span class="choose-days-month__count">{{ month.count }}</span>
      </div>
      <button
        v-if="toggleAll"
        type="button"
        class="choose-days-month__toggle"
        :aria-label="toggleAll.label"
        @click="emit('set', month.dues, toggleAll.checks)"
      >
        {{ toggleAll.text }}
      </button>
    </div>
    <div class="choose-days-month__weekdays" aria-hidden="true">
      <span v-for="(weekday, index) in weekdays" :key="index">{{ weekday }}</span>
    </div>
    <div class="choose-days-month__days">
      <span v-for="blank in month.blanks" :key="`blank-${blank}`" aria-hidden="true" />
      <template v-for="cell in month.cells" :key="cell.day">
        <button
          v-if="cell.due"
          type="button"
          role="checkbox"
          class="choose-days-month__day"
          :class="{ 'choose-days-month__day--given': !unchecked.has(cell.key) }"
          :aria-checked="!unchecked.has(cell.key)"
          :aria-label="dayLabel(t, cell.date, !unchecked.has(cell.key))"
          @click="emit('toggle', cell.due)"
        >
          <span class="choose-days-month__disc">{{ cell.day }}</span>
        </button>
        <span v-else class="choose-days-month__day choose-days-month__day--out" aria-hidden="true">
          <span class="choose-days-month__disc">{{ cell.day }}</span>
        </span>
      </template>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.choose-days-month {
  margin: 0 -8px;
}

.choose-days-month__head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: tokens.$size-tap-target;
  padding-left: 8px;
}

.choose-days-month__name {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  min-width: 0;
}

.choose-days-month__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 16px;
  font-weight: 700;
}

.choose-days-month__count {
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.choose-days-month__toggle {
  flex: 0 0 auto;
  min-height: tokens.$size-tap-target;
  padding: 0 10px;
  border: 0;
  border-radius: tokens.$radius-pill;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.choose-days-month__weekdays {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  color: tokens.$color-text-meta;
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
}

.choose-days-month__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  row-gap: 4px;
  margin-top: 6px;
}

.choose-days-month__day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  text-decoration: line-through;
  cursor: pointer;
  user-select: none;
}

.choose-days-month__disc {
  display: flex;
  align-items: center;
  justify-content: center;
  width: min(#{tokens.$size-tap-target}, 100%);
  aspect-ratio: 1;
  border-radius: 50%;
  background: tokens.$color-field-surface;
  box-shadow: inset 0 0 0 1.5px tokens.$color-day-missed-border;
}

.choose-days-month__day--given {
  color: tokens.$color-on-primary;
  font-weight: 700;
  text-decoration: none;

  .choose-days-month__disc {
    background: rgb(var(--v-theme-primary));
    box-shadow: none;
  }
}

.choose-days-month__day--out {
  color: tokens.$color-calendar-day-disabled;
  text-decoration: none;
  cursor: default;

  .choose-days-month__disc {
    background: transparent;
    box-shadow: none;
  }
}
</style>
