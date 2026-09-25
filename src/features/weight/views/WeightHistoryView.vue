<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch, type ComponentPublicInstance } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import WeightSheet from './WeightSheet.vue'
import { weightHistory, type WeightHistoryRow, type WeightTrend } from '../logic/weight-history'
import type { WeightDelta } from '../logic/weight-summary'
import { useWeightEntries } from '../composables/use-weight-entries'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import PushedScreen from '@/shared/components/PushedScreen.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import WeightHistoryChart from '@/shared/components/WeightHistoryChart.vue'
import { weightDeltaSinceText, weightDeltaText } from '@/shared/domain/weight-delta'
import { formatKg, formatLongDate } from '@/shared/utils/format'

const props = defineProps<{
  animalId: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const { today } = useToday()

const isSheetOpen = ref(false)
// La première pesée remplace la carte vide par le bouton fixe : c'est lui qui reprend le focus.
const addButton = useTemplateRef<ComponentPublicInstance>('addButton')

const animal = computed(() => animals.byId(props.animalId))
// Supprimé ou lien périmé : rien à consulter ni à ajouter.
const isNotFound = computed(() => animals.hasLoaded && animal.value === null)

const { entries, isLoading, isReady, hasError, reload } = useWeightEntries(() => props.animalId)

const history = computed(() => weightHistory(entries.value, animal.value?.initialWeightKg ?? null))

const selected = ref<number | null>(null)
watch(entries, () => {
  selected.value = null
})

const chart = useTemplateRef<InstanceType<typeof WeightHistoryChart>>('chart')

// La puce disparaît sous le doigt : le focus passe à la courbe plutôt que de se perdre.
function backToCurrent(): void {
  selected.value = null
  chart.value?.focus()
}

// La dernière pesée garde le résumé du repos : « Poids actuel » et sa variation.
const selectedRow = computed(() => {
  if (selected.value === null || selected.value === entries.value.length - 1) return null
  const id = entries.value[selected.value]?.id
  return history.value.rows.find((row) => row.id === id) ?? null
})

const summary = computed(() => {
  if (selectedRow.value) return describeRow(selectedRow.value)
  const { current, headline } = history.value
  if (!current || !headline) return null
  return {
    label: t('weight.history.current'),
    weightKg: current.weightKg,
    delta: describeHeadline(headline),
  }
})

function describeRow(row: WeightHistoryRow) {
  return {
    label: t('weight.history.selected', { date: formatLongDate(row.measuredOn) }),
    weightKg: row.weightKg,
    delta: row.delta
      ? {
          text: weightDeltaSinceText(
            t,
            row.delta.deltaKg,
            row.delta.previousMeasuredOn,
            today.value,
          ),
          trend: row.delta.trend,
        }
      : null,
  }
}

function describeHeadline(value: WeightDelta): { text: string; trend: WeightTrend } {
  if (value.kind === 'first') {
    return {
      text: t('weight.delta.first', { date: formatLongDate(value.measuredOn) }),
      trend: 'flat',
    }
  }
  return {
    text: weightDeltaSinceText(t, value.deltaKg, value.previousMeasuredOn, today.value),
    trend: value.trend,
  }
}

onMounted(() => {
  if (!animals.hasLoaded) void animals.load()
})

function backToAnimals(): void {
  void router.push({ name: 'animals' })
}
</script>

<template>
  <PushedScreen
    class="weight-history"
    :title="t('weight.history.title')"
    :subtitle="animal?.name"
    subtitle-tone="secondary"
    :back-label="t('weight.history.back')"
    @back="backToAnimals"
  >
    <div class="weight-history__content">
      <p v-if="isNotFound" class="section-card__card weight-history__not-found" role="alert">
        {{ t('animals.form.errors.notFound') }}
      </p>

      <template v-else>
        <section v-if="summary" class="weight-history__summary">
          <div class="weight-history__reading" aria-live="polite">
            <p class="weight-history__current-label">{{ summary.label }}</p>
            <p class="weight-history__headline">
              <span class="weight-history__current">{{ formatKg(summary.weightKg) }}</span>
              <span class="weight-history__unit">{{ t('weight.unit') }}</span>
            </p>
            <p
              class="weight-history__delta"
              :class="summary.delta ? `weight-history__delta--${summary.delta.trend}` : null"
            >
              {{ summary.delta?.text }}
            </p>
          </div>
          <button
            v-if="selectedRow"
            type="button"
            class="weight-history__reset"
            :aria-label="t('weight.history.reset')"
            @click="backToCurrent"
          >
            <v-icon icon="ms:close" size="16" />
            <span>{{ t('weight.history.current') }}</span>
          </button>
        </section>

        <div v-if="history.state === 'full'" class="section-card__card weight-history__chart">
          <WeightHistoryChart ref="chart" v-model:selected="selected" :entries="entries" />
        </div>
        <p v-else-if="history.state === 'single'" class="section-card__card weight-history__single">
          <v-icon icon="ms:show_chart" size="22" />
          <span>{{ t('weight.section.single') }}</span>
        </p>

        <SectionCard
          v-if="history.rows.length > 0"
          class="weight-history__list"
          :title="t('weight.history.list')"
          :counter="String(history.rows.length)"
        >
          <ul class="weight-history__rows">
            <li v-for="row in history.rows" :key="row.id" class="weight-history__row">
              <span class="weight-history__row-date">{{ formatLongDate(row.measuredOn) }}</span>
              <span
                class="weight-history__row-delta"
                :class="row.delta ? `weight-history__delta--${row.delta.trend}` : null"
                >{{ row.delta ? weightDeltaText(t, row.delta.deltaKg) : '' }}</span
              >
              <span class="weight-history__row-value">
                {{ t('weight.history.value', { weight: formatKg(row.weightKg) }) }}
              </span>
            </li>
          </ul>
        </SectionCard>

        <div v-else-if="isLoading" class="weight-history__loading">
          <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
        </div>

        <div v-else-if="hasError" class="section-card__card weight-history__error" role="alert">
          <p class="weight-history__error-text">{{ t('weight.section.error') }}</p>
          <v-btn class="weight-history__retry" variant="flat" color="primary" @click="reload">
            {{ t('animals.carnet.error.retry') }}
          </v-btn>
        </div>

        <div v-else-if="isReady" class="section-card__card">
          <p class="section-card__empty weight-history__empty">
            {{ t('weight.section.empty') }}
          </p>
          <button
            type="button"
            class="section-card__add weight-history__empty-add"
            @click="isSheetOpen = true"
          >
            <v-icon icon="ms:add" size="20" />
            <span>{{ t('weight.section.add') }}</span>
          </button>
        </div>

        <p v-if="history.initialWeightKg !== null" class="weight-history__initial">
          {{ t('weight.history.initial', { weight: formatKg(history.initialWeightKg) }) }}
        </p>
      </template>

      <WeightSheet
        v-model="isSheetOpen"
        :animal-id="animalId"
        :focus-fallback="addButton?.$el ?? null"
      />
    </div>

    <template v-if="!isNotFound && history.rows.length > 0" #actions>
      <div class="weight-history__actions">
        <v-btn
          ref="addButton"
          class="weight-history__add"
          variant="flat"
          color="primary"
          prepend-icon="ms:add"
          block
          @click="isSheetOpen = true"
        >
          {{ t('weight.section.add') }}
        </v-btn>
      </div>
    </template>
  </PushedScreen>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.weight-history__content {
  display: flex;
  flex-direction: column;
  gap: 24px;
  padding: 16px 0 24px;
}

.weight-history__summary,
.weight-history__chart,
.weight-history__single,
.weight-history__error,
.weight-history__not-found,
.weight-history__content > .section-card__card,
.weight-history__initial {
  margin-inline: 20px;
}

.weight-history__current-label,
.weight-history__single,
.weight-history__error,
.weight-history__initial,
.weight-history__not-found,
.weight-history__empty {
  margin-block: 0;
}

.weight-history__summary {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  column-gap: 12px;
}

// Planche H2 : la puce ne tient que la ligne « Pesée du … », poids et variation passent dessous.
.weight-history__reading {
  display: grid;
  grid-template-columns: subgrid;
  grid-row: 1;
  grid-column: 1 / -1;
}

.weight-history__current-label {
  grid-column: 1;
  color: tokens.$color-text-meta;
  font-size: 12px;
  font-weight: 600;
}

.weight-history__reset {
  position: relative;
  grid-row: 1;
  grid-column: 2;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  // Centrée sur la ligne « Pesée du … », sans pousser le poids vers le bas.
  margin-top: -7px;
  padding: 0 12px 0 8px;
  border: 0;
  border-radius: tokens.$radius-pill;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
  font-family: tokens.$font-family-body;
  font-size: 13px;
  font-weight: 700;
  white-space: nowrap;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  @include tap.tap-target;

  &:focus-visible {
    outline: none;
  }
}

.weight-history__headline {
  display: flex;
  grid-column: 1 / -1;
  align-items: baseline;
  gap: 8px;
  margin: 4px 0 0;
}

.weight-history__current {
  font-family: tokens.$font-family-heading;
  font-size: 44px;
  font-weight: 700;
  line-height: 1;
}

.weight-history__unit {
  color: tokens.$color-field-suffix;
  font-size: 17px;
  font-weight: 600;
}

.weight-history__delta {
  grid-column: 1 / -1;
  // Vide sur la première pesée : la courbe sous le doigt ne doit pas remonter.
  min-height: 1lh;
  margin: 8px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.weight-history__delta--up {
  color: tokens.$color-delta-up;
}

.weight-history__delta--down {
  color: tokens.$color-delta-down;
}

.weight-history__delta--flat {
  color: tokens.$color-delta-flat;
}

.weight-history__chart {
  padding: 20px 20px 16px;
}

.weight-history__single {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 20px;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  font-weight: 500;

  :deep(.v-icon) {
    flex: 0 0 auto;
    color: tokens.$color-chart-icon;
  }
}

.weight-history__not-found {
  padding: 16px 20px;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.weight-history__loading {
  display: flex;
  justify-content: center;
  padding-block: 32px;
}

.weight-history__error {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 20px;
}

.weight-history__error-text {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.weight-history__retry {
  border-radius: 999px;
  font-weight: 700;
  letter-spacing: normal;

  @include tap.tap-target;
}

.weight-history__list {
  // `SectionCard` porte déjà sa marge latérale.
  margin: 0;
}

.weight-history__rows {
  margin: 0;
  padding: 0;
  list-style: none;
}

.weight-history__row {
  display: flex;
  align-items: center;
  gap: 12px;
  min-height: tokens.$height-weight-row;
  padding-inline: 20px;
}

.weight-history__row + .weight-history__row {
  border-top: 1px solid tokens.$color-divider;
}

.weight-history__row-date {
  flex: 1 1 auto;
  color: tokens.$color-weight-row-date;
  font-size: 14px;
  font-weight: 600;
}

.weight-history__row-delta {
  flex: 0 0 auto;
  font-size: 12.5px;
  font-weight: 600;
}

.weight-history__row-value {
  flex: 0 0 auto;
  min-width: 64px;
  font-size: 16px;
  font-weight: 700;
  text-align: end;
}

.weight-history__initial {
  color: tokens.$color-delta-flat;
  font-size: 12.5px;
  font-weight: 500;
}

.weight-history__actions {
  padding: 12px 20px 30px;
}

.weight-history__add {
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
