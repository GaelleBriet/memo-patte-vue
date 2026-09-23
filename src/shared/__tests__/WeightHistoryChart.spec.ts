import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { nextTick } from 'vue'

import WeightHistoryChart from '../components/WeightHistoryChart.vue'
import { buildHistoryWeightChart, type WeightChartEntry } from '../domain/weight-chart'
import i18n from '@/core/i18n'

function pesees(...items: [string, number][]): WeightChartEntry[] {
  return items.map(([measuredOn, weightKg]) => ({ measuredOn, weightKg }))
}

const MILO = pesees(
  ['2026-03-04', 23.6],
  ['2026-03-18', 23.8],
  ['2026-04-22', 24.0],
  ['2026-06-10', 24.1],
  ['2026-07-28', 24.3],
  ['2026-09-15', 24.5],
)

const CHART = buildHistoryWeightChart(MILO)!
const SVG_LEFT = 10

let wrapper: VueWrapper | null = null

function monter(selected: number | null = null) {
  const monte: VueWrapper = mount(WeightHistoryChart, {
    props: {
      entries: MILO,
      selected,
      'onUpdate:selected': (value: number | null) => monte.setProps({ selected: value }),
    },
    global: { plugins: [i18n] },
    attachTo: document.body,
  })
  wrapper = monte
  return monte
}

function curseur(monte: VueWrapper) {
  return Number(monte.get('.weight-history-chart__cursor').attributes('x1'))
}

function selections(monte: VueWrapper) {
  return (monte.emitted('update:selected') ?? []).map(([index]) => index)
}

// jsdom n'a pas de PointerEvent : un MouseEvent du même nom porte `clientX` et `buttons`.
async function doigt(monte: VueWrapper, type: string, x: number, buttons = 1) {
  monte
    .get('svg')
    .element.dispatchEvent(new MouseEvent(type, { clientX: SVG_LEFT + x, buttons, bubbles: true }))
  await nextTick()
}

beforeEach(() => {
  vi.spyOn(SVGElement.prototype, 'getBoundingClientRect').mockReturnValue({
    left: SVG_LEFT,
    width: CHART.width,
  } as DOMRect)
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('WeightHistoryChart — repères', () => {
  it('trace une ligne de repère par graduation en kg ronds, l’unité au-dessus', () => {
    const monte = monter()

    expect(monte.findAll('.weight-history-chart__grid')).toHaveLength(4)
    expect(monte.findAll('.weight-history-chart__tick').map((t) => t.text())).toEqual([
      '23,5',
      '24',
      '24,5',
      '25',
    ])
    expect(monte.get('.weight-history-chart__unit').text()).toBe('kg')
  })

  it('écrit les mois sous la courbe, aucun chiffre sur les points', () => {
    const monte = monter()

    expect(monte.findAll('.weight-chart-trace__month').map((m) => m.text())).toEqual([
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
    ])
    expect(monte.findAll('.weight-chart-trace__point')).toHaveLength(6)
    expect(monte.find('.weight-sparkline__extreme').exists()).toBe(false)
  })
})

describe('WeightHistoryChart — taille', () => {
  it('se redessine à la largeur rendue de sa carte, pixel pour pixel', async () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(private readonly callback: () => void) {}
        observe() {
          this.callback()
        }
        disconnect() {}
      },
    )
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 300,
    } as DOMRect)

    const monte = monter()
    await nextTick()

    expect(monte.get('svg').attributes('viewBox')).toBe('0 0 300 190')
  })
})

describe('WeightHistoryChart — au repos', () => {
  it('pose le trait vertical et le point agrandi sur la dernière pesée', () => {
    const monte = monter()
    const derniere = CHART.points[5]!

    expect(curseur(monte)).toBe(derniere.x)
    const actif = monte.get('.weight-history-chart__active')
    expect(Number(actif.attributes('cx'))).toBe(derniere.x)
    expect(Number(actif.attributes('cy'))).toBe(derniere.y)
    expect(Number(actif.attributes('r'))).toBeGreaterThan(4)
  })
})

describe('WeightHistoryChart — toucher', () => {
  it('sélectionne la pesée la plus proche du doigt', async () => {
    const monte = monter()
    const troisieme = CHART.points[2]!

    await doigt(monte, 'pointerdown', troisieme.x + 6)

    expect(selections(monte)).toEqual([2])
    expect(curseur(monte)).toBe(troisieme.x)
  })

  it('suit le doigt qui glisse', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', CHART.points[1]!.x)
    await doigt(monte, 'pointermove', CHART.points[3]!.x)

    expect(selections(monte)).toEqual([1, 3])
    expect(curseur(monte)).toBe(CHART.points[3]!.x)
  })

  it('rend la sélection d’avant quand le doigt faisait défiler l’écran', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', CHART.points[1]!.x)
    await doigt(monte, 'pointerdown', CHART.points[3]!.x)
    await doigt(monte, 'pointercancel', CHART.points[3]!.x, 0)

    expect(selections(monte)).toEqual([1, 3, 1])
    expect(curseur(monte)).toBe(CHART.points[1]!.x)
  })

  it('ignore un survol sans appui', async () => {
    const monte = monter()

    await doigt(monte, 'pointermove', 0, 0)

    expect(selections(monte)).toEqual([])
  })

  it('garde la sélection quand le doigt se lève', async () => {
    const monte = monter()

    await doigt(monte, 'pointerdown', CHART.points[1]!.x)
    await doigt(monte, 'pointerup', CHART.points[1]!.x, 0)
    await doigt(monte, 'pointerleave', CHART.points[5]!.x, 0)

    expect(selections(monte)).toEqual([1])
    expect(curseur(monte)).toBe(CHART.points[1]!.x)
  })
})

describe('WeightHistoryChart — clavier et lecteur d’écran', () => {
  it('prend le focus comme un curseur qui parcourt les pesées', () => {
    const svg = monter().get('svg')

    expect(svg.attributes('tabindex')).toBe('0')
    expect(svg.attributes('role')).toBe('slider')
    expect(svg.attributes('aria-label')).toBe('Évolution du poids')
    expect(svg.attributes('aria-valuemin')).toBe('1')
    expect(svg.attributes('aria-valuemax')).toBe('6')
  })

  it('annonce la dernière pesée au repos', () => {
    const svg = monter().get('svg')

    expect(svg.attributes('aria-valuenow')).toBe('6')
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 15 sept. 2026 : 24,5 kg')
  })

  it('parcourt les pesées aux flèches gauche et droite, et annonce la pesée sélectionnée', async () => {
    const monte = monter()
    const svg = monte.get('svg')

    await svg.trigger('keydown', { key: 'ArrowLeft' })
    await svg.trigger('keydown', { key: 'ArrowLeft' })
    await svg.trigger('keydown', { key: 'ArrowRight' })

    expect(selections(monte)).toEqual([4, 3, 4])
    expect(svg.attributes('aria-valuenow')).toBe('5')
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 28 juil. 2026 : 24,3 kg')
  })

  it('saute à la première pesée par Début, à la dernière par Fin', async () => {
    const monte = monter()
    const svg = monte.get('svg')

    await svg.trigger('keydown', { key: 'Home' })
    expect(svg.attributes('aria-valuetext')).toBe('Pesée du 4 mars 2026 : 23,6 kg')

    await svg.trigger('keydown', { key: 'End' })
    expect(selections(monte)).toEqual([0, 5])
    expect(curseur(monte)).toBe(CHART.points[5]!.x)
  })

  it('reste sur la pesée du bout quand la flèche pousse au-delà', async () => {
    const monte = monter(0)
    const svg = monte.get('svg')

    await svg.trigger('keydown', { key: 'ArrowLeft' })
    expect(svg.attributes('aria-valuenow')).toBe('1')

    await svg.trigger('keydown', { key: 'End' })
    await svg.trigger('keydown', { key: 'ArrowRight' })
    expect(svg.attributes('aria-valuenow')).toBe('6')
    expect(selections(monte)).toEqual([5])
  })

  it('accepte aussi les flèches haut et bas des lecteurs d’écran', async () => {
    const monte = monter()
    const svg = monte.get('svg')

    await svg.trigger('keydown', { key: 'ArrowDown' })
    await svg.trigger('keydown', { key: 'ArrowUp' })

    expect(selections(monte)).toEqual([4, 5])
  })

  it('laisse passer les autres touches', async () => {
    const monte = monter()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true })

    monte.get('svg').element.dispatchEvent(tab)

    expect(tab.defaultPrevented).toBe(false)
    expect(selections(monte)).toEqual([])
  })
})
