<script lang="ts">
import type { WeightSummary } from './weight-summary'

/** `null` tant qu'aucune pesée n'est connue. */
export type WeightSectionSummary = WeightSummary | null
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WeightSheet from './WeightSheet.vue'
import { weightSummary, type WeightDelta } from './weight-summary'
import { useWeightEntries } from './use-weight-entries'
import SectionCard from '@/shared/components/SectionCard.vue'
import WeightSparkline from '@/shared/components/WeightSparkline.vue'
import { formatKg, formatKgDelta, formatLongDate, formatMonth } from '@/shared/utils/format'
import { buildWeightChart } from '@/shared/domain/weight-chart'

const props = defineProps<{
  animalId: string
}>()

const emit = defineEmits<{
  summary: [summary: WeightSectionSummary]
}>()

const { t } = useI18n()

const isSheetOpen = ref(false)

const { entries, hasError } = useWeightEntries(() => props.animalId)

const summary = computed<WeightSectionSummary>(() => weightSummary(entries.value))
const chart = computed(() => buildWeightChart(entries.value))

const current = computed(() => (summary.value ? formatKg(summary.value.latest.weightKg) : null))

const delta = computed(() => (summary.value ? describeDelta(summary.value.delta) : null))

function describeDelta(value: WeightDelta): { text: string; trend: 'up' | 'down' | 'flat' } {
  if (value.kind === 'first') {
    return {
      text: t('weight.delta.first', { date: formatLongDate(value.measuredOn) }),
      trend: 'flat',
    }
  }
  return {
    text: t('weight.delta.vs', {
      delta: formatKgDelta(value.deltaKg),
      month: formatMonth(value.previousMeasuredOn),
    }),
    trend: value.trend,
  }
}

watch(summary, (value) => emit('summary', value), { immediate: true })
</script>

<template>
  <SectionCard class="weight-section" :title="t('weight.section.title')">
    <div v-if="summary && delta" class="section-card__body weight-section__body">
      <div class="weight-section__headline">
        <span class="weight-section__current">{{ current }}</span>
        <span class="weight-section__unit">{{ t('weight.unit') }}</span>
        <router-link
          class="weight-section__history"
          :to="{ name: 'weight-history', params: { animalId } }"
        >
          <span>{{ t('weight.history.link') }}</span>
          <v-icon icon="ms:chevron_right" size="18" />
        </router-link>
      </div>
      <p class="weight-section__delta" :class="`weight-section__delta--${delta.trend}`">
        {{ delta.text }}
      </p>

      <WeightSparkline v-if="chart" class="weight-section__chart" :chart="chart" />
      <p v-else class="weight-section__single">
        <v-icon icon="ms:show_chart" size="22" />
        <span>{{ t('weight.section.single') }}</span>
      </p>
    </div>

    <p v-else-if="hasError" class="section-card__empty weight-section__error">
      {{ t('weight.section.error') }}
    </p>
    <p v-else class="section-card__empty weight-section__empty">
      {{ t('weight.section.empty') }}
    </p>

    <button type="button" class="section-card__add weight-section__add" @click="isSheetOpen = true">
      <v-icon icon="ms:add" size="20" />
      <span>{{ t('weight.section.add') }}</span>
    </button>

    <WeightSheet v-model="isSheetOpen" :animal-id="animalId" />
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.weight-section__body {
  padding: 18px 20px 16px;
}

.weight-section__headline {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.weight-section__current {
  font-family: tokens.$font-family-heading;
  font-size: 26px;
  font-weight: 700;
  line-height: 1;
}

.weight-section__unit {
  color: tokens.$color-field-suffix;
  font-size: 15px;
  font-weight: 600;
}

.weight-section__history {
  display: inline-flex;
  align-items: center;
  align-self: center;
  gap: 2px;
  // Zone de tap de 48 px ; les marges négatives rendent la hauteur gagnée, le rendu ne bouge pas.
  min-height: 48px;
  margin-block: -14px;
  margin-inline-start: auto;
  color: rgb(var(--v-theme-primary));
  font-size: 13.5px;
  font-weight: 700;
  text-decoration: none;
}

.weight-section__delta {
  margin: 6px 0 0;
  font-size: 13px;
  font-weight: 600;
}

.weight-section__delta--up {
  color: tokens.$color-delta-up;
}

.weight-section__delta--down {
  color: tokens.$color-delta-down;
}

.weight-section__delta--flat {
  color: tokens.$color-delta-flat;
}

.weight-section__chart {
  margin-top: 16px;
}

.weight-section__single {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  font-weight: 500;

  :deep(.v-icon) {
    color: tokens.$color-chart-icon;
  }
}
</style>
