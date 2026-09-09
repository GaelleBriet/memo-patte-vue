import { describe, expect, it } from 'vitest'
import { buildWeightChart } from '../weight-chart'

const MILO = [
  { weightKg: 23.6, measuredOn: '2026-06-05' },
  { weightKg: 23.8, measuredOn: '2026-07-05' },
  { weightKg: 24.1, measuredOn: '2026-08-05' },
  { weightKg: 23.9, measuredOn: '2026-09-05' },
  { weightKg: 24.3, measuredOn: '2026-10-05' },
  { weightKg: 24.5, measuredOn: '2026-11-08' },
]

const OPTIONS = { width: 300, height: 120, paddingX: 16, paddingTop: 18, paddingBottom: 8 }

describe('buildWeightChart', () => {
  it('ne trace rien sous deux pesées', () => {
    expect(buildWeightChart([], OPTIONS)).toBeNull()
    expect(buildWeightChart([MILO[0]!], OPTIONS)).toBeNull()
  })

  it('répartit les points de gauche à droite dans l’ordre des pesées', () => {
    const chart = buildWeightChart([MILO[0]!, MILO[2]!, MILO[5]!], OPTIONS)!

    expect(chart.points.map((point) => point.x)).toEqual([16, 150, 284])
  })

  it('borne l’échelle au min / max avec 0,3 kg de marge, jamais depuis zéro', () => {
    const chart = buildWeightChart([MILO[0]!, MILO[5]!], OPTIONS)!

    // 23,6 est à 0,3 kg du bas d'une échelle 23,3 → 24,8 : un cinquième de la hauteur utile.
    expect(chart.points[0]!.y).toBeCloseTo(112 - 0.2 * 94, 1)
    expect(chart.points[1]!.y).toBeCloseTo(112 - 0.8 * 94, 1)
    // Une échelle partant de zéro placerait 23,6 kg tout en haut du tracé.
    expect(chart.points[0]!.y).toBeGreaterThan(60)
  })

  it('centre une ligne plate quand toutes les pesées sont égales', () => {
    const chart = buildWeightChart(
      [
        { weightKg: 4.2, measuredOn: '2026-06-05' },
        { weightKg: 4.2, measuredOn: '2026-07-05' },
      ],
      OPTIONS,
    )!

    expect(chart.points.map((point) => point.y)).toEqual([65, 65])
  })

  it('accepte une autre marge', () => {
    const chart = buildWeightChart([MILO[0]!, MILO[5]!], { ...OPTIONS, marginKg: 0 })!

    expect(chart.points[0]!.y).toBe(112)
    expect(chart.points[1]!.y).toBe(18)
  })

  it('écrit la valeur au-dessus de chaque point et le mois abrégé dessous', () => {
    const chart = buildWeightChart(MILO, OPTIONS)!

    expect(chart.points.map((point) => point.valueLabel)).toEqual([
      '23,6',
      '23,8',
      '24,1',
      '23,9',
      '24,3',
      '24,5',
    ])
    expect(chart.points.map((point) => point.monthLabel)).toEqual([
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
      'Oct.',
      'Nov.',
    ])
  })

  it('assemble la polyline à partir des points, avec des coordonnées arrondies', () => {
    const chart = buildWeightChart([MILO[0]!, MILO[5]!], OPTIONS)!

    expect(chart.polyline).toBe('16,93.2 284,36.8')
    expect(chart.width).toBe(300)
    expect(chart.height).toBe(120)
  })

  it('a des dimensions par défaut', () => {
    const chart = buildWeightChart([MILO[0]!, MILO[5]!])!

    expect(chart.width).toBeGreaterThan(0)
    expect(chart.height).toBeGreaterThan(0)
    expect(chart.points).toHaveLength(2)
  })
})
