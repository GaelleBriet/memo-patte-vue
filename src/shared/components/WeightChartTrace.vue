<script setup lang="ts">
import type { ChartMonth, ChartPlot, ChartPoint } from '../domain/weight-chart'

defineProps<{
  chart: {
    plot: ChartPlot
    points: ChartPoint[]
    line: string
    area: string
    months: ChartMonth[]
    monthTicks: number[]
  }
}>()

const MONTH_TICK_LENGTH = 5
const POINT_RADIUS = 4
</script>

<template>
  <path class="weight-chart-trace__area" :d="chart.area" />
  <line
    v-for="tickX in chart.monthTicks"
    :key="`tick-${tickX}`"
    class="weight-chart-trace__tick"
    :x1="tickX"
    :x2="tickX"
    :y1="chart.plot.bottom"
    :y2="chart.plot.bottom + MONTH_TICK_LENGTH"
  />
  <text
    v-for="month in chart.months"
    :key="`month-${month.x}`"
    class="weight-chart-trace__month"
    :x="month.x"
    :y="month.y"
    :text-anchor="month.anchor"
  >
    {{ month.text }}
  </text>
  <polyline class="weight-chart-trace__line" :points="chart.line" />
  <circle
    v-for="(point, index) in chart.points"
    :key="index"
    class="weight-chart-trace__point"
    :cx="point.x"
    :cy="point.y"
    :r="POINT_RADIUS"
  />
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.weight-chart-trace__area {
  fill: rgb(var(--v-theme-primary));
  fill-opacity: tokens.$opacity-chart-area;
}

.weight-chart-trace__tick {
  stroke: tokens.$color-chart-grid;
  stroke-width: 1;
}

.weight-chart-trace__month {
  fill: tokens.$color-text-meta;
  font-family: tokens.$font-family-body;
  font-size: 12px;
  font-weight: 500;
}

.weight-chart-trace__line {
  fill: none;
  stroke: rgb(var(--v-theme-primary));
  stroke-width: 2;
  stroke-linejoin: round;
  stroke-linecap: round;
}

.weight-chart-trace__point {
  fill: rgb(var(--v-theme-primary));
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 2;
}
</style>
