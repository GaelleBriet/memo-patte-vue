<script setup lang="ts">
import { computed, onBeforeUnmount, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import WeightChartTrace from './WeightChartTrace.vue'
import { useChartMeasure } from '../composables/use-chart-measure'
import {
  buildHistoryWeightChart,
  DEFAULT_CHART_WIDTH,
  nearestPointIndex,
  type WeightChartEntry,
} from '../domain/weight-chart'
import { weightPagePeriod, weightPages } from '../domain/weight-pages'
import { formatFullDate, formatKg, formatMonthYear } from '../utils/format'

const props = defineProps<{
  entries: readonly WeightChartEntry[]
}>()

/** Index de la pesée sélectionnée parmi toutes, dans l'ordre du temps ; `null` au repos. */
const selected = defineModel<number | null>('selected', { default: null })

const { t } = useI18n()

type Direction = -1 | 1

const ACTIVE_RADIUS = 7
const LONG_PRESS_MS = 400
const TOUCH_SLOP_PX = 10
const SWIPE_PX = 48
const EDGE_RESISTANCE = 0.25
const SLIDE_IN_PX = 32
const SETTLE_MS = 220
const KEY_STEPS: Record<string, number> = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
}
const PAGE_KEYS: Record<string, Direction> = { PageDown: -1, PageUp: 1 }

const figure = useTemplateRef<HTMLElement>('figure')
const svg = useTemplateRef<SVGSVGElement>('svg')
const { width, textScale } = useChartMeasure(figure, DEFAULT_CHART_WIDTH)

const pages = computed(() => weightPages(props.entries.length))
const pageIndex = ref(pages.value.length - 1)
watch(
  () => props.entries,
  () => {
    pageIndex.value = pages.value.length - 1
  },
)
const page = computed(() => pages.value[pageIndex.value] ?? { start: 0, end: 0 })
const hasPrevious = computed(() => pageIndex.value > 0)
const hasNext = computed(() => pageIndex.value < pages.value.length - 1)

const chart = computed(() =>
  buildHistoryWeightChart(props.entries.slice(page.value.start, page.value.end), {
    width: width.value,
    textScale: textScale.value,
  }),
)

const period = computed(() => {
  if (!chart.value) return null
  const { from, to, count, isStart } = weightPagePeriod(props.entries, page.value)
  const counted = t('weight.chart.count', count)
  return {
    range: to
      ? t('weight.chart.period', { from: formatMonthYear(from), to: formatMonthYear(to) })
      : formatMonthYear(from),
    count: isStart ? t('weight.chart.start', { count: counted }) : counted,
  }
})

const lastOfPage = computed(() => page.value.end - page.value.start - 1)
const selectedOnPage = computed(() => {
  const index = selected.value
  if (index === null || index < page.value.start || index >= page.value.end) return null
  return index - page.value.start
})
const active = computed(() =>
  selectedOnPage.value === null ? null : (chart.value?.points[selectedOnPage.value] ?? null),
)
const sliderIndex = computed(() => selectedOnPage.value ?? lastOfPage.value)

const valueText = computed(() => {
  const point = chart.value?.points[sliderIndex.value]
  return point
    ? t('weight.chart.point', {
        date: formatFullDate(point.measuredOn),
        weight: formatKg(point.weightKg),
      })
    : undefined
})

function select(indexOnPage: number): void {
  selected.value = page.value.start + Math.max(0, Math.min(indexOnPage, lastOfPage.value))
}

function selectAt(clientX: number): void {
  const box = svg.value?.getBoundingClientRect()
  if (!chart.value || !box || box.width === 0) return
  const x = ((clientX - box.left) / box.width) * chart.value.width
  select(nearestPointIndex(chart.value.points, x))
}

function animate(keyframes: Keyframe[]): void {
  const element = svg.value
  if (!element?.animate || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  element.animate(keyframes, { duration: SETTLE_MS, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
}

function turnPage(direction: Direction): boolean {
  const target = pageIndex.value + direction
  if (target < 0 || target >= pages.value.length) return false
  pageIndex.value = target
  selected.value = null
  animate([
    { transform: `translateX(${direction * SLIDE_IN_PX}px)`, opacity: 0 },
    { transform: 'translateX(0)', opacity: 1 },
  ])
  return true
}

type Gesture = {
  pointerId: number
  startX: number
  startY: number
  lastX: number
  mode: 'pending' | 'swipe' | 'scrub' | 'ignored'
  timer: ReturnType<typeof setTimeout>
}

let gesture: Gesture | null = null
const dragX = ref(0)

function canTurn(dx: number): boolean {
  return dx > 0 ? hasPrevious.value : hasNext.value
}

function onPointerDown(event: PointerEvent): void {
  if (gesture || event.button > 0) return
  // Le doigt qui sort de la courbe en glissant continue de la piloter.
  ;(event.currentTarget as SVGSVGElement).setPointerCapture?.(event.pointerId)
  gesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    lastX: event.clientX,
    mode: 'pending',
    timer: setTimeout(startScrub, LONG_PRESS_MS),
  }
}

function startScrub(): void {
  if (gesture?.mode !== 'pending') return
  gesture.mode = 'scrub'
  selectAt(gesture.lastX)
}

function onPointerMove(event: PointerEvent): void {
  if (!gesture || event.pointerId !== gesture.pointerId) return
  gesture.lastX = event.clientX
  const dx = event.clientX - gesture.startX
  const dy = event.clientY - gesture.startY
  if (gesture.mode === 'pending' && Math.hypot(dx, dy) > TOUCH_SLOP_PX) {
    clearTimeout(gesture.timer)
    gesture.mode = Math.abs(dx) > Math.abs(dy) ? 'swipe' : 'ignored'
  }
  if (gesture.mode === 'swipe') dragX.value = canTurn(dx) ? dx : dx * EDGE_RESISTANCE
  else if (gesture.mode === 'scrub') selectAt(event.clientX)
}

function endGesture(event: PointerEvent): Gesture | null {
  if (!gesture || event.pointerId !== gesture.pointerId) return null
  const ended = gesture
  clearTimeout(ended.timer)
  gesture = null
  return ended
}

function settle(dx: number): void {
  const from = dragX.value
  dragX.value = 0
  if (Math.abs(dx) >= SWIPE_PX && turnPage(dx > 0 ? -1 : 1)) return
  animate([{ transform: `translateX(${from}px)` }, { transform: 'translateX(0)' }])
}

function onPointerUp(event: PointerEvent): void {
  const ended = endGesture(event)
  if (ended?.mode === 'pending') selectAt(event.clientX)
  else if (ended?.mode === 'swipe') settle(event.clientX - ended.startX)
}

// Le navigateur annule le geste quand il fait défiler l'écran.
function onPointerCancel(event: PointerEvent): void {
  if (endGesture(event)?.mode === 'swipe') settle(0)
}

function onTouchMove(event: TouchEvent): void {
  if (event.cancelable && (gesture?.mode === 'scrub' || gesture?.mode === 'swipe')) {
    event.preventDefault()
  }
}

function onKeydown(event: KeyboardEvent): void {
  const step = KEY_STEPS[event.key]
  const turn = PAGE_KEYS[event.key]
  if (event.key === 'Home') select(0)
  else if (event.key === 'End') select(lastOfPage.value)
  else if (step !== undefined) select(sliderIndex.value + step)
  else if (turn !== undefined) turnPage(turn)
  else return
  event.preventDefault()
}

onBeforeUnmount(() => {
  if (gesture) clearTimeout(gesture.timer)
})

defineExpose({
  focus: () => svg.value?.focus({ preventScroll: true }),
})
</script>

<template>
  <figure v-if="chart && period" ref="figure" class="weight-history-chart">
    <div class="weight-history-chart__pager">
      <button
        type="button"
        class="weight-history-chart__turn weight-history-chart__turn--previous"
        :aria-label="hasPrevious ? t('weight.chart.previous') : t('weight.chart.previousNone')"
        :aria-disabled="!hasPrevious"
        @click="turnPage(-1)"
      >
        <v-icon icon="ms:chevron_left" size="24" />
      </button>
      <div class="weight-history-chart__period" aria-live="polite">
        <p class="weight-history-chart__range">{{ period.range }}</p>
        <p class="weight-history-chart__count">{{ period.count }}</p>
      </div>
      <button
        type="button"
        class="weight-history-chart__turn weight-history-chart__turn--next"
        :aria-label="hasNext ? t('weight.chart.next') : t('weight.chart.nextNone')"
        :aria-disabled="!hasNext"
        @click="turnPage(1)"
      >
        <v-icon icon="ms:chevron_right" size="24" />
      </button>
    </div>
    <span class="weight-history-chart__unit" aria-hidden="true">{{ t('weight.unit') }}</span>
    <svg
      ref="svg"
      class="weight-history-chart__svg"
      :style="dragX ? { transform: `translateX(${dragX}px)` } : undefined"
      :viewBox="`0 0 ${chart.width} ${chart.height}`"
      tabindex="0"
      role="slider"
      :aria-label="t('weight.section.chartLabel')"
      aria-valuemin="1"
      :aria-valuemax="chart.points.length"
      :aria-valuenow="sliderIndex + 1"
      :aria-valuetext="valueText"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerCancel"
      @touchmove="onTouchMove"
      @contextmenu.prevent
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

.weight-history-chart__pager {
  display: grid;
  grid-template-columns: tokens.$size-tap-target minmax(0, 1fr) tokens.$size-tap-target;
  align-items: center;
  // Les chevrons s'alignent sur le bord du contenu, leur zone de tap déborde dans la marge.
  margin: -12px -12px 4px;
}

.weight-history-chart__turn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: none;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible {
    outline: none;
  }

  &[aria-disabled='true'] {
    color: tokens.$color-chart-arrow-disabled;
    cursor: default;
  }
}

.weight-history-chart__period {
  min-width: 0;
  text-align: center;
}

.weight-history-chart__range,
.weight-history-chart__count {
  margin: 0;
}

.weight-history-chart__range {
  font-family: tokens.$font-family-heading;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.25;
}

.weight-history-chart__count {
  color: tokens.$color-text-secondary;
  font-size: 13px;
  font-weight: 500;
  line-height: 1.3;
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
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  -webkit-touch-callout: none;

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
  stroke: rgb(var(--v-theme-primary));
  stroke-opacity: 0.5;
  stroke-width: 1;
}

.weight-history-chart__active {
  fill: rgb(var(--v-theme-primary));
  stroke: rgb(var(--v-theme-surface));
  stroke-width: 2.5;
}
</style>
