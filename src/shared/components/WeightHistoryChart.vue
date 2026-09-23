<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { useI18n } from 'vue-i18n'

import WeightChartTrace from './WeightChartTrace.vue'
import { useElementWidth } from '../composables/use-element-width'
import {
  buildHistoryWeightChart,
  DEFAULT_CHART_WIDTH,
  nearestPointIndex,
  type WeightChartEntry,
} from '../domain/weight-chart'
import { formatKg, formatLongDate } from '../utils/format'

const props = defineProps<{
  entries: readonly WeightChartEntry[]
}>()

/** Index de la pesée sélectionnée, dans l'ordre du temps ; `null` au repos, sur la dernière. */
const selected = defineModel<number | null>('selected', { default: null })

const { t } = useI18n()

const ACTIVE_RADIUS = 6
const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
}

const figure = useTemplateRef<HTMLElement>('figure')
const width = useElementWidth(figure, DEFAULT_CHART_WIDTH)

const chart = computed(() => buildHistoryWeightChart(props.entries, width.value))

const lastIndex = computed(() => props.entries.length - 1)
const activeIndex = computed(() => Math.min(selected.value ?? lastIndex.value, lastIndex.value))
const active = computed(() => chart.value?.points[activeIndex.value] ?? null)

const valueText = computed(() =>
  active.value
    ? t('weight.chart.point', {
        date: formatLongDate(active.value.measuredOn),
        weight: formatKg(active.value.weightKg),
      })
    : undefined,
)

function select(index: number): void {
  selected.value = Math.max(0, Math.min(index, lastIndex.value))
}

function selectUnder(event: PointerEvent): void {
  const box = (event.currentTarget as SVGSVGElement).getBoundingClientRect()
  if (!chart.value || box.width === 0) return
  const x = ((event.clientX - box.left) / box.width) * chart.value.width
  select(nearestPointIndex(chart.value.points, x))
}

let selectedBeforeTouch: number | null = null

function onPointerDown(event: PointerEvent): void {
  selectedBeforeTouch = selected.value
  // Le doigt qui sort de la courbe en glissant continue de la piloter.
  ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
  selectUnder(event)
}

function onPointerMove(event: PointerEvent): void {
  if (event.buttons !== 0) selectUnder(event)
}

// Le navigateur annule le toucher quand il fait défiler l'écran : ce geste ne visait pas une pesée.
function onPointerCancel(): void {
  selected.value = selectedBeforeTouch
}

function onKeydown(event: KeyboardEvent): void {
  const step = KEY_STEPS[event.key]
  if (event.key === 'Home') select(0)
  else if (event.key === 'End') select(lastIndex.value)
  else if (step !== undefined) select(activeIndex.value + step)
  else return
  event.preventDefault()
}
</script>

<template>
  <figure v-if="chart" ref="figure" class="weight-history-chart">
    <span class="weight-history-chart__unit" aria-hidden="true">{{ t('weight.unit') }}</span>
    <svg
      class="weight-history-chart__svg"
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      tabindex="0"
      role="slider"
      :aria-label="t('weight.section.chartLabel')"
      aria-valuemin="1"
      :aria-valuemax="chart.points.length"
      :aria-valuenow="activeIndex + 1"
      :aria-valuetext="valueText"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointercancel="onPointerCancel"
      @keydown="onKeydown"
    >
      <template v-for="gridLine in chart.gridLines" :key="gridLine.y">
        <line
          class="weight-history-chart__grid"
          :x1="chart.plot.left"
          :x2="chart.plot.right"
          :y1="gridLine.y"
          :y2="gridLine.y"
        />
        <text
          class="weight-history-chart__tick"
          :x="gridLine.label.x"
          :y="gridLine.label.y"
          text-anchor="end"
        >
          {{ gridLine.label.text }}
        </text>
      </template>
      <WeightChartTrace :chart="chart" />
      <template v-if="active">
        <line
          class="weight-history-chart__cursor"
          :x1="active.x"
          :x2="active.x"
          :y1="chart.plot.top"
          :y2="chart.plot.bottom"
        />
        <circle
          class="weight-history-chart__active"
          :cx="active.x"
          :cy="active.y"
          :r="ACTIVE_RADIUS"
        />
      </template>
    </svg>
  </figure>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.weight-history-chart {
  margin: 0;
}

.weight-history-chart__unit {
  display: block;
  margin-bottom: -6px;
  color: tokens.$color-text-meta;
  font-size: 12px;
  font-weight: 500;
}

.weight-history-chart__svg {
  display: block;
  width: 100%;
  height: auto;
  overflow: visible;
  touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;

  // Chrome encadre un SVG focalisé même au toucher ; le trait vertical dit déjà la sélection.
  &:focus {
    outline: none;
  }
}

.weight-history-chart__grid {
  stroke: tokens.$color-chart-grid;
  stroke-width: 1;
}

.weight-history-chart__tick {
  fill: tokens.$color-text-meta;
  font-family: tokens.$font-family-body;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.weight-history-chart__cursor {
  stroke: tokens.$color-text-meta;
  stroke-width: 1;
}

.weight-history-chart__active {
  fill: rgb(var(--v-theme-primary));
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 2.5;
}
</style>
