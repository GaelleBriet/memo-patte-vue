<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import WeightSheet from './WeightSheet.vue'
import { weightHistory, type WeightHeadline, type WeightTrend } from './weight-history'
import { useWeightEntries } from './use-weight-entries'
import { useAnimalsStore } from '@/features/animals/animals.store'
import PushedScreen from '@/shared/PushedScreen.vue'
import SectionCard from '@/shared/SectionCard.vue'
import WeightSparkline from '@/shared/WeightSparkline.vue'
import { formatKg, formatKgDelta, formatLongDate, formatMonth } from '@/shared/format'
import { buildWeightChart } from '@/shared/weight-chart'

const props = defineProps<{
  animalId: string
}>()

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const isSheetOpen = ref(false)

// Courbe plus haute que celle du Carnet : c'est le sujet de l'écran.
const CHART_OPTIONS = { width: 320, height: 150, paddingTop: 22 }

const animal = computed(() => animals.byId(props.animalId))
// Supprimé ou lien périmé : rien à consulter ni à ajouter.
const isNotFound = computed(() => animals.hasLoaded && animal.value === null)

const { entries, isLoading, isReady, hasError, reload } = useWeightEntries(() => props.animalId)

const history = computed(() => weightHistory(entries.value, animal.value?.initialWeightKg ?? null))
const chart = computed(() =>
  history.value.state === 'full' ? buildWeightChart(entries.value, CHART_OPTIONS) : null,
)

const headline = computed(() =>
  history.value.headline ? describeHeadline(history.value.headline) : null,
)

function describeHeadline(value: WeightHeadline): { text: string; trend: WeightTrend } {
  if (value.kind === 'first') {
    return {
      text: t('weight.delta.first', { date: formatLongDate(value.measuredOn) }),
      trend: 'flat',
    }
  }
  if (value.kind === 'flat') {
    return { text: t('weight.delta.value', { delta: formatKgDelta(0) }), trend: 'flat' }
  }
  return {
    text: t('weight.delta.vs', {
      delta: formatKgDelta(value.deltaKg),
      month: formatMonth(value.previousMeasuredOn),
    }),
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
    compact
    :back-label="t('weight.history.back')"
    @back="backToAnimals"
  >
    <div class="weight-history__content">
      <p v-if="isNotFound" class="section-card__card weight-history__not-found" role="alert">
        {{ t('animals.form.errors.notFound') }}
      </p>

      <template v-else>
        <section v-if="history.current && headline" class="weight-history__summary">
          <p class="weight-history__current-label">{{ t('weight.history.current') }}</p>
          <p class="weight-history__headline">
            <span class="weight-history__current">{{ formatKg(history.current.weightKg) }}</span>
            <span class="weight-history__unit">{{ t('weight.unit') }}</span>
          </p>
          <p class="weight-history__delta" :class="`weight-history__delta--${headline.trend}`">
            {{ headline.text }}
          </p>
        </section>

        <div v-if="chart" class="section-card__card weight-history__chart">
          <WeightSparkline :chart="chart" />
        </div>
        <p v-else-if="history.state === 'single'" class="section-card__card weight-history__single">
          <v-icon icon="ms:show_chart" size="22" />
          <span>{{ t('weight.section.single') }}</span>
        </p>

        <SectionCard
          v-if="history.rows.length > 0"
          class="weight-history__list"
          :title="t('weight.history.list')"
        >
          <ul class="weight-history__rows">
            <li v-for="row in history.rows" :key="row.id" class="weight-history__row">
              <span class="weight-history__row-date">{{ formatLongDate(row.measuredOn) }}</span>
              <span
                class="weight-history__row-delta"
                :class="row.delta ? `weight-history__delta--${row.delta.trend}` : null"
                >{{
                  row.delta
                    ? t('weight.delta.value', { delta: formatKgDelta(row.delta.deltaKg) })
                    : ''
                }}</span
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

      <WeightSheet v-model="isSheetOpen" :animal-id="animalId" />
    </div>

    <template v-if="!isNotFound && history.rows.length > 0" #actions>
      <div class="weight-history__actions">
        <v-btn
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

.weight-history__current-label {
  color: tokens.$color-text-meta;
  font-size: 11.5px;
  font-weight: 600;
}

.weight-history__headline {
  display: flex;
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
  padding: 12px 20px;
}

.weight-history__add {
  height: 52px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
