<script setup lang="ts">
import { computed, onScopeDispose, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import {
  choiceOf,
  chooseDays,
  dayKey,
  toggledDay,
  withDays,
  type DayChoice,
} from '../logic/treatment-choose-days'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import type { Due } from '@/shared/domain/treatment-schedule'

const props = withDefaults(
  defineProps<{
    subtitle: string
    dues: readonly Due[]
    /** Les jours des doses, lus avec le bouton « Valider ». */
    when: string
    /** Réponse déjà donnée, à rouvrir telle quelle ; sinon tout est coché. */
    choice?: DayChoice | null
    busy?: boolean
  }>(),
  { choice: null, busy: false },
)

const emit = defineEmits<{
  confirm: [choice: DayChoice]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const unchecked = ref<Set<string>>(new Set())
const activeTab = ref('')

const model = computed(() => chooseDays(t, props.dues, unchecked.value, props.when))
const tab = computed(
  () => model.value.tabs.find(({ id }) => id === activeTab.value) ?? model.value.tabs[0] ?? null,
)

let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

watch(
  open,
  (isOpen) => {
    releaseBack()
    if (!isOpen) return
    releaseBackButton = onBackButton(() => (open.value = false))
    unchecked.value = new Set((props.choice?.missed ?? []).map(dayKey))
    activeTab.value = model.value.tabs[0]?.id ?? ''
  },
  { immediate: true },
)

function toggle(due: Due): void {
  unchecked.value = toggledDay(unchecked.value, due)
}

function setAll(dues: readonly Due[], checked: boolean): void {
  unchecked.value = withDays(unchecked.value, dues, checked)
}

function confirm(): void {
  emit('confirm', choiceOf(props.dues, unchecked.value))
}
</script>

<template>
  <v-dialog
    v-model="open"
    fullscreen
    :scrim="false"
    transition="dialog-bottom-transition"
    :aria-label="t('treatments.unlogged.days.title')"
  >
    <PushedScreen
      class="treatment-choose-days"
      :title="t('treatments.unlogged.days.title')"
      :subtitle="subtitle"
      subtitle-tone="secondary"
      :back-label="t('treatments.unlogged.days.back')"
      @back="open = false"
    >
      <div v-if="tab" class="treatment-choose-days__content">
        <p class="treatment-choose-days__help">{{ model.help }}</p>

        <div
          v-if="model.hasTabs"
          class="treatment-choose-days__tabs"
          role="tablist"
          :aria-label="t('treatments.unlogged.days.hours')"
        >
          <button
            v-for="hour in model.tabs"
            :key="hour.id"
            type="button"
            role="tab"
            class="treatment-choose-days__tab"
            :class="{ 'treatment-choose-days__tab--active': hour.id === tab.id }"
            :aria-selected="hour.id === tab.id"
            :aria-label="hour.label"
            @click="activeTab = hour.id"
          >
            <span class="treatment-choose-days__tab-title">{{ hour.title }}</span>
            <span class="treatment-choose-days__tab-state">{{ hour.state }}</span>
          </button>
        </div>

        <div class="treatment-choose-days__all">
          <button
            type="button"
            class="treatment-choose-days__link treatment-choose-days__link--check"
            :aria-label="tab.checkAllLabel"
            @click="setAll(tab.dues, true)"
          >
            <v-icon icon="ms:done_all" size="19" />
            <span>{{ t('treatments.unlogged.days.checkAll') }}</span>
          </button>
          <button
            type="button"
            class="treatment-choose-days__link treatment-choose-days__link--uncheck"
            :aria-label="tab.uncheckAllLabel"
            @click="setAll(tab.dues, false)"
          >
            <v-icon icon="ms:remove_done" size="19" />
            <span>{{ t('treatments.unlogged.days.uncheckAll') }}</span>
          </button>
        </div>

        <div class="treatment-choose-days__legend" aria-hidden="true">
          <span class="treatment-choose-days__legend-item">
            <span class="treatment-choose-days__dot treatment-choose-days__dot--given" />
            {{ t('treatments.unlogged.given') }}
          </span>
          <span class="treatment-choose-days__legend-item">
            <span class="treatment-choose-days__dot" />
            {{ t('treatments.unlogged.missed') }}
          </span>
        </div>

        <section
          v-for="month in tab.months"
          :key="month.id"
          class="treatment-choose-days__month"
          :aria-label="month.title"
        >
          <div class="treatment-choose-days__month-head">
            <div class="treatment-choose-days__month-name">
              <h2 class="treatment-choose-days__month-title">{{ month.title }}</h2>
              <span class="treatment-choose-days__month-count">{{ month.count }}</span>
            </div>
            <button
              v-if="month.toggle"
              type="button"
              class="treatment-choose-days__link treatment-choose-days__month-toggle"
              :aria-label="month.toggle.label"
              @click="setAll(month.dues, month.toggle.checks)"
            >
              {{ month.toggle.text }}
            </button>
          </div>
          <div class="treatment-choose-days__weekdays" aria-hidden="true">
            <span v-for="(weekday, index) in model.weekdays" :key="index">{{ weekday }}</span>
          </div>
          <div class="treatment-choose-days__days">
            <span v-for="blank in month.blanks" :key="`blank-${blank}`" aria-hidden="true" />
            <template v-for="cell in month.cells" :key="cell.day">
              <button
                v-if="cell.due"
                type="button"
                role="checkbox"
                class="treatment-choose-days__day"
                :class="{ 'treatment-choose-days__day--given': cell.checked }"
                :aria-checked="cell.checked"
                :aria-label="cell.label"
                @click="toggle(cell.due)"
              >
                {{ cell.day }}
              </button>
              <span
                v-else
                class="treatment-choose-days__day treatment-choose-days__day--out"
                aria-hidden="true"
              >
                {{ cell.day }}
              </span>
            </template>
          </div>
        </section>
      </div>

      <template #actions>
        <div class="treatment-choose-days__actions">
          <v-btn
            class="treatment-choose-days__submit"
            variant="flat"
            color="primary"
            block
            :aria-label="model.submitLabel"
            :disabled="busy"
            @click="confirm"
          >
            {{ model.submit }}
          </v-btn>
        </div>
      </template>
    </PushedScreen>
  </v-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

$size-day: 48px;

.treatment-choose-days__content {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 12px 20px 24px;
}

.treatment-choose-days__help {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 1.5;
  text-wrap: pretty;
}

.treatment-choose-days__tabs {
  display: flex;
  gap: 2px;
  padding: 3px;
  border: 1px solid tokens.$color-field-border;
  border-radius: 16px;
  background: tokens.$color-field-surface;
}

.treatment-choose-days__tab {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  min-width: 0;
  min-height: 56px;
  border: 0;
  border-radius: 13px;
  background: transparent;
  color: tokens.$color-segment-inactive;
  font-family: inherit;
  cursor: pointer;
}

.treatment-choose-days__tab-title {
  font-size: 15px;
  font-weight: 700;
}

.treatment-choose-days__tab-state {
  color: tokens.$color-text-secondary;
  font-size: 12px;
  font-weight: 500;
  white-space: nowrap;
}

.treatment-choose-days__tab--active {
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;

  .treatment-choose-days__tab-state {
    color: tokens.$color-priming-icon-surface;
  }
}

.treatment-choose-days__all {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0 -10px;
}

.treatment-choose-days__link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: tokens.$size-tap-target;
  padding: 0 10px;
  border: 0;
  border-radius: tokens.$radius-pill;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.treatment-choose-days__legend {
  display: flex;
  gap: 18px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}

.treatment-choose-days__legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}

.treatment-choose-days__dot {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: tokens.$color-field-surface;
  box-shadow: inset 0 0 0 1.5px tokens.$color-day-missed-border;
}

.treatment-choose-days__dot--given {
  background: rgb(var(--v-theme-primary));
  box-shadow: none;
}

.treatment-choose-days__month {
  margin: 0 -8px;
}

.treatment-choose-days__month-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: tokens.$size-tap-target;
  padding-left: 8px;
}

.treatment-choose-days__month-name {
  display: flex;
  flex: 1 1 auto;
  flex-wrap: wrap;
  align-items: baseline;
  column-gap: 8px;
  min-width: 0;
}

.treatment-choose-days__month-title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 16px;
  font-weight: 700;
}

.treatment-choose-days__month-count {
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.treatment-choose-days__month-toggle {
  flex: 0 0 auto;
  white-space: nowrap;
}

.treatment-choose-days__weekdays,
.treatment-choose-days__days {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.treatment-choose-days__weekdays {
  color: tokens.$color-text-meta;
  font-size: 11.5px;
  font-weight: 600;
  text-align: center;
}

.treatment-choose-days__days {
  row-gap: 4px;
  margin-top: 6px;
}

.treatment-choose-days__day {
  display: flex;
  align-items: center;
  justify-content: center;
  width: $size-day;
  height: $size-day;
  margin: 0 auto;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: tokens.$color-field-surface;
  box-shadow: inset 0 0 0 1.5px tokens.$color-day-missed-border;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  font-size: 14px;
  font-weight: 500;
  text-decoration: line-through;
  cursor: pointer;
  user-select: none;
}

.treatment-choose-days__day--given {
  background: rgb(var(--v-theme-primary));
  box-shadow: none;
  color: tokens.$color-on-primary;
  font-weight: 700;
  text-decoration: none;
}

.treatment-choose-days__day--out {
  background: transparent;
  box-shadow: none;
  color: tokens.$color-calendar-day-disabled;
  text-decoration: none;
  cursor: default;
}

.treatment-choose-days__actions {
  padding: 12px 20px 30px;
}

.treatment-choose-days__submit {
  height: 52px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}
</style>
