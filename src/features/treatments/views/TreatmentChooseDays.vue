<script setup lang="ts">
import { computed, onScopeDispose, reactive, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import TreatmentChooseDaysMonth from './TreatmentChooseDaysMonth.vue'
import {
  choiceOf,
  chooseDaysLayout,
  dayKey,
  missedAmong,
  setDays,
  submitTexts,
  tabMonths,
  tabTexts,
  toggleDay,
  type DayChoice,
} from '../logic/treatment-choose-days'
import { onBackButton } from '@/core/app-lifecycle/back-button'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import type { Due } from '@/shared/domain/treatment-schedule'

const MONTHS_PER_STEP = 6

const props = withDefaults(
  defineProps<{
    subtitle: string
    dues: readonly Due[]
    /** Les jours des doses, lus avec le bouton « Valider ». */
    when: string
    /** Réponse déjà donnée, à rouvrir telle quelle ; sinon tout est coché. */
    choice?: DayChoice | null
    busy?: boolean
    /** Ouvert depuis « Arrêter » : valider arrête aussi le traitement. */
    stopping?: boolean
  }>(),
  { choice: null, busy: false, stopping: false },
)

const emit = defineEmits<{
  confirm: [choice: DayChoice]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

const unchecked = reactive(new Set<string>())
const activeTab = ref('')
const shownMonths = ref(MONTHS_PER_STEP)
const more = useTemplateRef<HTMLElement>('more')

let releaseBackButton: (() => void) | null = null

const layout = computed(() => chooseDaysLayout(t, props.dues))
const tab = computed(
  () => layout.value.tabs.find(({ id }) => id === activeTab.value) ?? layout.value.tabs[0] ?? null,
)
const months = computed(() => (tab.value === null ? [] : tabMonths(t, tab.value)))
const tabs = computed(() =>
  layout.value.tabs.map((each) => ({
    id: each.id,
    title: each.title,
    ...tabTexts(t, each, missedAmong(each.dues, unchecked), layout.value.hasTabs),
  })),
)
const activeTexts = computed(() => tabs.value.find(({ id }) => id === tab.value?.id) ?? null)
const submit = computed(() =>
  submitTexts(t, props.dues.length, unchecked.size, props.when, props.stopping),
)

watch(
  open,
  (isOpen) => {
    releaseBack()
    if (!isOpen) return
    releaseBackButton = onBackButton(() => (open.value = false))
    const known = new Set(props.dues.map(dayKey))
    unchecked.clear()
    setDays(
      unchecked,
      (props.choice?.missed ?? []).filter((due) => known.has(dayKey(due))),
      false,
    )
    selectTab(layout.value.tabs[0]?.id ?? '')
  },
  { immediate: true },
)

// Le total se lit sur `unchecked.size` : une case dont la dose sort de la liste ne doit pas y rester.
watch(
  () => props.dues,
  (dues) => {
    const known = new Set(dues.map(dayKey))
    for (const key of unchecked) if (!known.has(key)) unchecked.delete(key)
  },
)

// Les mois se montent au fil du défilement : un long historique n'en monte pas des dizaines d'un coup.
watch(more, (sentinel, _previous, onCleanup) => {
  if (!sentinel) return
  if (typeof IntersectionObserver === 'undefined') {
    shownMonths.value = Infinity
    return
  }
  const observer = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) shownMonths.value += MONTHS_PER_STEP
    },
    { rootMargin: '600px 0px' },
  )
  observer.observe(sentinel)
  onCleanup(() => observer.disconnect())
})

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

function selectTab(id: string): void {
  activeTab.value = id
  shownMonths.value = MONTHS_PER_STEP
}

function toggle(due: Due): void {
  toggleDay(unchecked, due)
}

function setAll(dues: readonly Due[], checked: boolean): void {
  setDays(unchecked, dues, checked)
}

function confirm(): void {
  emit('confirm', choiceOf(props.dues, unchecked))
}

onScopeDispose(releaseBack)
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
      <div v-if="tab && activeTexts" class="treatment-choose-days__content">
        <p class="treatment-choose-days__help">{{ layout.help }}</p>

        <div
          v-if="layout.hasTabs"
          class="treatment-choose-days__tabs"
          role="tablist"
          :aria-label="t('treatments.unlogged.days.hours')"
        >
          <button
            v-for="hour in tabs"
            :key="hour.id"
            type="button"
            role="tab"
            class="treatment-choose-days__tab"
            :class="{ 'treatment-choose-days__tab--active': hour.id === tab.id }"
            :aria-selected="hour.id === tab.id"
            :aria-label="hour.label"
            @click="selectTab(hour.id)"
          >
            <span class="treatment-choose-days__tab-title">{{ hour.title }}</span>
            <span class="treatment-choose-days__tab-state">{{ hour.state }}</span>
          </button>
        </div>

        <div class="treatment-choose-days__all">
          <button
            type="button"
            class="treatment-choose-days__link treatment-choose-days__link--check"
            :aria-label="activeTexts.checkAllLabel"
            @click="setAll(tab.dues, true)"
          >
            <v-icon icon="ms:done_all" size="19" />
            <span>{{ t('treatments.unlogged.days.checkAll') }}</span>
          </button>
          <button
            type="button"
            class="treatment-choose-days__link treatment-choose-days__link--uncheck"
            :aria-label="activeTexts.uncheckAllLabel"
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

        <TreatmentChooseDaysMonth
          v-for="month in months.slice(0, shownMonths)"
          :key="`${tab.id} ${month.id}`"
          :month="month"
          :unchecked="unchecked"
          :weekdays="layout.weekdays"
          :alone="months.length === 1"
          @toggle="toggle"
          @set="setAll"
        />
        <div v-if="shownMonths < months.length" ref="more" aria-hidden="true" />
      </div>

      <template #actions>
        <div class="treatment-choose-days__actions">
          <v-btn
            class="treatment-choose-days__submit"
            variant="flat"
            color="primary"
            block
            :aria-label="submit.submitLabel"
            :disabled="busy"
            @click="confirm"
          >
            {{ submit.submit }}
          </v-btn>
        </div>
      </template>
    </PushedScreen>
  </v-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

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
