import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'

import WeightSparkline from '../WeightSparkline.vue'
import { buildWeightChart } from '../weight-chart'
import i18n from '@/core/i18n'

const CHART = buildWeightChart(
  [
    { weightKg: 23.6, measuredOn: '2026-06-05' },
    { weightKg: 24.1, measuredOn: '2026-08-05' },
    { weightKg: 24.5, measuredOn: '2026-11-08' },
  ],
  { width: 300, height: 120, paddingX: 16, paddingTop: 18, paddingBottom: 8 },
)!

function monter() {
  return mount(WeightSparkline, { props: { chart: CHART }, global: { plugins: [i18n] } })
}

describe('WeightSparkline', () => {
  it('dessine un svg aux dimensions du tracé, sans axe ni grille', () => {
    const svg = monter().get('svg')

    expect(svg.attributes('viewBox')).toBe('0 0 300 120')
    expect(svg.findAll('line')).toHaveLength(0)
    expect(svg.findAll('rect')).toHaveLength(0)
  })

  it('relie les points par une polyline et pose un cercle par pesée', () => {
    const svg = monter().get('svg')

    expect(svg.get('polyline').attributes('points')).toBe(CHART.polyline)
    expect(svg.findAll('circle').map((c) => c.attributes('cx'))).toEqual(['16', '150', '284'])
  })

  it('écrit la valeur au-dessus de chaque point et le mois en dessous', () => {
    const wrapper = monter()

    const values = wrapper.findAll('.weight-sparkline__value')
    expect(values.map((v) => v.text())).toEqual(['23,6', '24,1', '24,5'])
    values.forEach((value, index) => {
      expect(Number(value.attributes('y'))).toBeLessThan(CHART.points[index]!.y)
    })
    expect(wrapper.findAll('.weight-sparkline__month').map((m) => m.text())).toEqual([
      'Juin',
      'Août',
      'Nov.',
    ])
  })

  it('nomme le graphique pour les lecteurs d’écran', () => {
    const svg = monter().get('svg')

    expect(svg.attributes('role')).toBe('img')
    expect(svg.attributes('aria-label')).toBe('Évolution du poids')
  })
})
