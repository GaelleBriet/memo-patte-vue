<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import WeightChartTrace from './WeightChartTrace.vue'
import { useChartMeasure } from '../composables/use-chart-measure'
import {
  buildCarnetWeightChart,
  DEFAULT_CHART_WIDTH,
  type CarnetChartLabels,
  type WeightChartEntry,
} from '../domain/weight-chart'

const props = defineProps<{
  entries: readonly WeightChartEntry[]
}>()

const { t } = useI18n()

const labels: CarnetChartLabels = {
  max: (weight) => t('weight.chart.max', { weight }),
  min: (weight) => t('weight.chart.min', { weight }),
  latest: (weight) => t('weight.chart.latest', { weight }),
}

const figure = useTemplateRef<HTMLElement>('figure')
const { width, textScale } = useChartMeasure(figure, DEFAULT_CHART_WIDTH)

const chart = computed(() =>
  buildCarnetWeightChart(props.entries, labels, {
    width: width.value,
    textScale: textScale.value,
  }),
)
</script>

<template>
  <figure v-if="chart" ref="figure" class="weight-sparkline">
    <svg
      class="weight-sparkline__svg"
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      role="img"
      :aria-label="t('weight.section.chartLabel')"
    >
      <line
        class="weight-sparkline__baseline"
        :x1="chart.plot.left"
        :x2="chart.plot.right"
        :y1="chart.plot.bottom"
        :y2="chart.plot.bottom"
      />
      <WeightChartTrace :chart="chart" />
      <text
        v-if="chart.max"
        class="weight-sparkline__extreme"
        :x="chart.max.x"
        :y="chart.max.y"
        :text-anchor="chart.max.anchor"
      >
        {{ chart.max.text }}
      </text>
      <text
        v-if="chart.min"
        class="weight-sparkline__extreme"
        :x="chart.min.x"
        :y="chart.min.y"
        :text-anchor="chart.min.anchor"
      >
        {{ chart.min.text }}
      </text>
    </svg>
    <span
      class="weight-sparkline__latest"
      aria-hidden="true"
      :style="{ right: `${chart.latest.right}px`, bottom: `${chart.latest.bottom}px` }"
    >
      {{ chart.latest.text }}
    </span>
  </figure>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.weight-sparkline {
  position: relative;
  margin: 0;
}

.weight-sparkline__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.weight-sparkline__baseline {
  stroke: tokens.$color-chart-grid;
  stroke-width: 1;
}

.weight-sparkline__extreme {
  fill: tokens.$color-chart-value;
  font-family: tokens.$font-family-body;
  font-size: 12px;
  font-weight: 600;
}

.weight-sparkline__latest {
  position: absolute;
  padding: 3px 9px;
  border-radius: tokens.$radius-pill;
  background: rgb(var(--v-theme-primary));
  color: tokens.$color-on-primary;
  font-size: 12px;
  font-weight: 600;
  line-height: 16px;
  white-space: nowrap;
}
</style>
