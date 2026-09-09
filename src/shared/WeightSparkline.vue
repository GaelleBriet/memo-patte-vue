<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import type { WeightChart } from './weight-chart'

defineProps<{
  chart: WeightChart
}>()

const { t } = useI18n()

const VALUE_OFFSET = 10
const POINT_RADIUS = 4
</script>

<template>
  <figure class="weight-sparkline">
    <svg
      class="weight-sparkline__svg"
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      role="img"
      :aria-label="t('weight.section.chartLabel')"
    >
      <polyline class="weight-sparkline__line" :points="chart.polyline" />
      <template v-for="point in chart.points" :key="point.x">
        <circle class="weight-sparkline__point" :cx="point.x" :cy="point.y" :r="POINT_RADIUS" />
        <text
          class="weight-sparkline__value"
          :x="point.x"
          :y="point.y - VALUE_OFFSET"
          text-anchor="middle"
        >
          {{ point.valueLabel }}
        </text>
      </template>
    </svg>
    <figcaption class="weight-sparkline__months">
      <span v-for="point in chart.points" :key="point.x" class="weight-sparkline__month">
        {{ point.monthLabel }}
      </span>
    </figcaption>
  </figure>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.weight-sparkline {
  margin: 0;
}

.weight-sparkline__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
}

.weight-sparkline__line {
  fill: none;
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.weight-sparkline__point {
  fill: rgb(var(--v-theme-primary));
}

.weight-sparkline__value {
  fill: tokens.$color-chart-value;
  font-family: tokens.$font-family-body;
  font-size: 11px;
  font-weight: 600;
}

.weight-sparkline__months {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
  color: tokens.$color-text-meta;
  font-size: 11.5px;
  font-weight: 500;
}
</style>
