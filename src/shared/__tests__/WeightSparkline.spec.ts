import { mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { nextTick } from 'vue'

import WeightSparkline from '../components/WeightSparkline.vue'
import { buildCarnetWeightChart, type WeightChartEntry } from '../domain/weight-chart'
import i18n from '@/core/i18n'

function pesees(...items: [string, number][]): WeightChartEntry[] {
  return items.map(([measuredOn, weightKg]) => ({ measuredOn, weightKg }))
}

const LUNA = pesees(
  ['2026-03-05', 4.2],
  ['2026-04-18', 4.6],
  ['2026-05-16', 4.4],
  ['2026-06-20', 4.1],
  ['2026-07-18', 4.2],
  ['2026-08-22', 4.3],
)

const MILO = pesees(
  ['2026-03-04', 23.6],
  ['2026-04-22', 24.0],
  ['2026-06-10', 24.1],
  ['2026-09-15', 24.5],
)

function monter(entries = LUNA) {
  return mount(WeightSparkline, { props: { entries }, global: { plugins: [i18n] } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('WeightSparkline — tracé', () => {
  it('se dessine à une largeur par défaut tant que sa carte n’est pas mesurée', () => {
    expect(monter().get('svg').attributes('viewBox')).toBe('0 0 320 160')
  })

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
      width: 290.4,
    } as DOMRect)

    const wrapper = monter()
    await nextTick()

    expect(wrapper.get('svg').attributes('viewBox')).toBe('0 0 290 160')
    expect(wrapper.findAll('circle').at(-1)!.attributes('cx')).toBe('282')
  })

  it('pose le voile, la courbe et un point par pesée, placé selon sa date', () => {
    const chart = buildCarnetWeightChart(LUNA)!
    const svg = monter().get('svg')

    expect(svg.get('.weight-chart-trace__area').attributes('d')).toBe(chart.area)
    expect(svg.get('polyline').attributes('points')).toBe(chart.line)
    expect(svg.findAll('circle').map((c) => Number(c.attributes('cx')))).toEqual(
      chart.points.map((point) => point.x),
    )
  })

  it('écrit un mois par début de mois, plus aucun par pesée', () => {
    const months = monter().findAll('.weight-chart-trace__month')

    expect(months.map((m) => m.text())).toEqual(['Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août'])
  })

  it('aligne la fin du dernier mois sur la fin de l’axe quand la place manque après son trait', () => {
    const months = monter(
      pesees(['2026-04-12', 23.6], ['2026-07-02', 24], ['2026-09-01', 24.5]),
    ).findAll('.weight-chart-trace__month')
    const dernier = months.at(-1)!

    expect(dernier.text()).toBe('Sept.')
    expect(dernier.attributes('text-anchor')).toBe('end')
    expect(dernier.attributes('x')).toBe('312')
    expect(months[0]!.attributes('text-anchor')).toBe('start')
  })

  it('trace une ligne de base, sans grille ni graduation', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.weight-sparkline__baseline')).toHaveLength(1)
    expect(wrapper.find('.weight-history-chart__grid').exists()).toBe(false)
    expect(wrapper.find('.weight-history-chart__tick').exists()).toBe(false)
  })
})

describe('WeightSparkline — trois chiffres seulement', () => {
  it('écrit le plus haut, le plus bas, et la dernière pesée dans une pastille', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.weight-sparkline__extreme').map((e) => e.text())).toEqual([
      'max 4,6',
      'min 4,1',
    ])
    expect(wrapper.get('.weight-sparkline__latest').text()).toBe('4,3 kg')
  })

  it('ne double pas le plus haut quand c’est la dernière pesée', () => {
    const wrapper = monter(MILO)

    expect(wrapper.findAll('.weight-sparkline__extreme').map((e) => e.text())).toEqual(['min 23,6'])
    expect(wrapper.get('.weight-sparkline__latest').text()).toBe('24,5 kg')
  })

  it('pose la pastille au-dessus de la dernière pesée, calée sur la fin du tracé', () => {
    const chart = buildCarnetWeightChart(LUNA)!
    const pastille = monter().get('.weight-sparkline__latest')

    expect(pastille.attributes('style')).toBe(
      `right: ${chart.latest.right}px; bottom: ${chart.latest.bottom}px;`,
    )
  })

  it('suit la langue courante', async () => {
    const wrapper = monter()
    i18n.global.locale.value = 'en'
    await nextTick()

    expect(wrapper.findAll('.weight-sparkline__extreme').map((e) => e.text())).toEqual([
      'max 4.6',
      'min 4.1',
    ])
    expect(wrapper.get('.weight-sparkline__latest').text()).toBe('4.3 kg')
    i18n.global.locale.value = 'fr'
  })
})

describe('WeightSparkline — lecteur d’écran', () => {
  it('nomme le graphique', () => {
    const svg = monter().get('svg')

    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Évolution du poids')
  })

  it('tait la pastille, que le poids actuel au-dessus dit déjà', () => {
    expect(monter().get('.weight-sparkline__latest').attributes('aria-hidden')).toBe('true')
  })
})
