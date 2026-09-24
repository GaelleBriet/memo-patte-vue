<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { onBackButton } from '@/core/app-lifecycle/back-button'

const props = withDefaults(
  defineProps<{
    /** Dates civiles `yyyy-MM-dd`, bornes comprises ; absentes, rien n'est borné de ce côté. */
    min?: string | null
    max?: string | null
  }>(),
  { min: null, max: null },
)

const model = defineModel<string | null>({ default: null })

const { t, locale } = useI18n()

// Dates locales à minuit : une chaîne serait lue en UTC par l'adaptateur, un jour trop tôt à l'ouest.
function toDate(value: string | null): Date | undefined {
  return value === null ? undefined : parseISO(value)
}

type ViewMode = 'month' | 'months' | 'year'

const viewMode = ref<ViewMode>('month')
let closingYears = false

// Vuetify revient aux jours après le choix d'une année : le choix du mois passe avant.
function onViewMode(next: ViewMode): void {
  const yearPicked = viewMode.value === 'year' && next === 'month' && !closingYears
  viewMode.value = yearPicked ? 'months' : next
  closingYears = false
}

function toggleYears(openYears: () => void): void {
  closingYears = viewMode.value === 'year'
  openYears()
}

let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

watch(viewMode, (mode) => {
  releaseBack()
  if (mode !== 'month') releaseBackButton = onBackButton(() => (viewMode.value = 'month'))
})

const selected = computed({
  get: () => toDate(model.value) ?? null,
  set: (date: Date | null) => {
    model.value = date === null ? null : format(date, 'yyyy-MM-dd')
  },
})
</script>

<template>
  <v-locale-provider :locale="locale">
    <v-date-picker
      v-model="selected"
      class="date-calendar"
      color="primary"
      width="100%"
      weeks-in-month="dynamic"
      hide-header
      :min="toDate(props.min)"
      :max="toDate(props.max)"
      :show-adjacent-months="false"
      :view-mode="viewMode"
      @update:view-mode="onViewMode"
    >
      <template #controls="{ monthYearText, prevMonth, nextMonth, openYears, disabled }">
        <div class="date-calendar__controls">
          <v-btn
            class="date-calendar__nav date-calendar__nav--previous"
            icon="ms:chevron_left"
            variant="text"
            :aria-label="t('calendar.previousMonth')"
            :disabled="disabled.includes('prev-month')"
            @click="prevMonth"
          />
          <button
            type="button"
            class="date-calendar__month"
            :aria-label="t('calendar.pickMonthYear', { month: monthYearText })"
            :aria-expanded="viewMode !== 'month'"
            @click="toggleYears(openYears)"
          >
            <span aria-live="polite">{{ monthYearText }}</span>
            <v-icon icon="ms:arrow_drop_down" size="22" />
          </button>
          <v-btn
            class="date-calendar__nav date-calendar__nav--next"
            icon="ms:chevron_right"
            variant="text"
            :aria-label="t('calendar.nextMonth')"
            :disabled="disabled.includes('next-month')"
            @click="nextMonth"
          />
        </div>
      </template>
    </v-date-picker>
  </v-locale-provider>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.date-calendar {
  overflow: visible;
  background: transparent;
  box-shadow: none;
}

.date-calendar :deep(.v-date-picker-controls) {
  padding: 0;
}

.date-calendar :deep(.v-picker__body) {
  padding: 0;
}

.date-calendar__controls {
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  padding-block: 4px;
}

.date-calendar__nav {
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  color: rgb(var(--v-theme-primary));
}

.date-calendar__nav:first-child {
  margin-inline-start: -12px;
}

.date-calendar__nav:last-child {
  margin-inline-end: -12px;
}

.date-calendar__month {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  min-height: tokens.$size-tap-target;
  padding: 0 4px 0 8px;
  border: 0;
  border-radius: tokens.$radius-pill;
  background: transparent;
  color: inherit;
  font-family: tokens.$font-family-heading;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;

  .v-icon {
    color: rgb(var(--v-theme-primary));
  }

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.date-calendar :deep(.v-date-picker-month) {
  padding: 0;
}

.date-calendar :deep(.v-date-picker-month__weeks) {
  column-gap: 0;
  width: 100%;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.date-calendar :deep(.v-date-picker-month__weekday) {
  color: tokens.$color-text-meta;
  font-size: 13px;
  font-weight: 600;
}

.date-calendar :deep(.v-date-picker-month__day) {
  width: 100%;
  height: 44px;
}

.date-calendar :deep(.v-date-picker-month__day .v-btn) {
  --v-btn-height: 40px;

  width: 40px;
  height: 40px;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: normal;
}

.date-calendar :deep(.v-date-picker-month__day--selected .v-btn) {
  font-weight: 700;
}

.date-calendar :deep(.v-date-picker-month__day .v-btn--disabled) {
  color: tokens.$color-calendar-day-disabled;
  opacity: 1;
}
</style>
