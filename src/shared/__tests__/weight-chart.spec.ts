import { describe, expect, it } from 'vitest'
import {
  buildCarnetWeightChart,
  buildHistoryWeightChart,
  buildWeightChart,
  nearestPointIndex,
  weightAxisTicks,
} from '../domain/weight-chart'

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

function pesees(...items: [string, number][]) {
  return items.map(([measuredOn, weightKg]) => ({ measuredOn, weightKg }))
}

const MILO_6_MOIS = pesees(
  ['2026-03-04', 23.6],
  ['2026-03-18', 23.8],
  ['2026-04-22', 24.0],
  ['2026-06-10', 24.1],
  ['2026-07-28', 24.3],
  ['2026-09-15', 24.5],
)

const LUNA_1_AN = pesees(
  ['2025-09-20', 4.2],
  ['2025-10-18', 4.3],
  ['2025-11-15', 4.4],
  ['2025-12-20', 4.6],
  ['2026-01-10', 4.5],
  ['2026-01-31', 4.5],
  ['2026-02-21', 4.4],
  ['2026-03-28', 4.3],
  ['2026-04-25', 4.3],
  ['2026-05-30', 4.2],
  ['2026-06-27', 4.1],
  ['2026-07-25', 4.2],
  ['2026-08-22', 4.3],
  ['2026-09-19', 4.3],
)

describe('buildCarnetWeightChart — axe du temps', () => {
  it('ne trace rien sous deux pesées', () => {
    expect(buildCarnetWeightChart([])).toBeNull()
    expect(buildCarnetWeightChart(pesees(['2026-03-04', 23.6]))).toBeNull()
  })

  it('place chaque pesée selon sa date, de bord à bord du tracé', () => {
    const chart = buildCarnetWeightChart(
      pesees(['2026-03-01', 23.6], ['2026-03-11', 23.8], ['2026-03-31', 24.0]),
      320,
    )!

    expect(chart.plot).toEqual({ left: 8, right: 312, top: 34, bottom: 124 })
    expect(chart.points.map((point) => point.x)).toEqual([8, 109.3, 312])
  })

  it('centre les pesées quand elles tombent toutes le même jour', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-04', 23.6], ['2026-03-04', 23.8]), 320)!

    expect(chart.points.map((point) => point.x)).toEqual([160, 160])
  })

  it('suit la largeur reçue', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-01', 23.6], ['2026-03-31', 24]), 280)!

    expect(chart.width).toBe(280)
    expect(chart.points.map((point) => point.x)).toEqual([8, 272])
  })

  it('assemble la courbe et le voile qui descend jusqu’au bas du tracé', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-01', 23.6], ['2026-03-31', 24.5]), 320)!

    expect(chart.line).toBe('8,106 312,52')
    expect(chart.area).toBe('M8,124 L8,106 L312,52 L312,124 Z')
  })
})

describe('buildCarnetWeightChart — échelle', () => {
  it('borne l’échelle au min / max avec 0,3 kg de marge, jamais depuis zéro', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-01', 23.6], ['2026-03-31', 24.5]), 320)!

    // Échelle 23,3 → 24,8 sur 90 px : 23,6 à un cinquième de la hauteur, 24,5 à quatre.
    expect(chart.points.map((point) => point.y)).toEqual([106, 52])
  })

  it('centre une ligne plate', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-01', 4.2], ['2026-03-31', 4.2]), 320)!

    expect(chart.points.map((point) => point.y)).toEqual([79, 79])
  })
})

describe('mois sous la courbe', () => {
  it('écrit un mois à chaque début de mois, et le mois de départ au début de l’axe', () => {
    const chart = buildCarnetWeightChart(MILO_6_MOIS, 320)!

    expect(chart.months.map((month) => month.text)).toEqual([
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
    ])
    expect(chart.months[0]).toMatchObject({ x: 8, tickX: null })
    // Le 1er avril tombe 28 jours après la première pesée, sur 195.
    expect(chart.months[1]).toMatchObject({ tickX: 51.7, x: 54.7 })
  })

  it('n’écrit plus un mois par pesée : deux pesées du même mois, un seul libellé', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-04', 23.6], ['2026-03-20', 23.8]), 320)!

    expect(chart.months).toEqual([{ x: 8, y: 146, text: 'Mars', tickX: null }])
  })

  it('tait le mois de départ quand le premier changement de mois arrive trop tôt', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-28', 23.6], ['2026-06-10', 24]), 320)!

    expect(chart.months.map((month) => month.text)).toEqual(['Avr.', 'Mai', 'Juin'])
  })

  it('garde un mois sur deux au-delà de six mois', () => {
    const chart = buildCarnetWeightChart(LUNA_1_AN, 320)!

    expect(chart.months.map((month) => month.text)).toEqual([
      'Oct.',
      'Déc.',
      'Févr.',
      'Avr.',
      'Juin',
      'Août',
    ])
  })

  it('écrit encore chaque mois à six changements de mois, un sur deux à sept', () => {
    const six = buildCarnetWeightChart(pesees(['2026-01-15', 4], ['2026-07-15', 4.2]), 320)!
    const sept = buildCarnetWeightChart(pesees(['2026-01-15', 4], ['2026-08-15', 4.2]), 320)!

    expect(six.months.map((month) => month.text)).toEqual([
      'Févr.',
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
    ])
    expect(sept.months.map((month) => month.text)).toEqual(['Févr.', 'Avr.', 'Juin', 'Août'])
  })
})

describe('buildCarnetWeightChart — les trois chiffres écrits', () => {
  it('écrit le plus haut au-dessus de son point, le plus bas dessous, la dernière pesée en pastille', () => {
    const chart = buildCarnetWeightChart(LUNA_1_AN, 320)!
    const plusHaut = chart.points[3]!
    const plusBas = chart.points[10]!
    const derniere = chart.points[13]!

    expect(chart.max).toEqual({
      x: plusHaut.x,
      y: expect.closeTo(plusHaut.y - 11, 5),
      text: '4,6',
      anchor: 'middle',
    })
    expect(chart.min).toEqual({
      x: plusBas.x,
      y: expect.closeTo(plusBas.y + 19, 5),
      text: '4,1',
      anchor: 'middle',
    })
    // Pastille ancrée par son coin bas droit : au bout du tracé, 10 px au-dessus du point.
    expect(chart.latest).toEqual({
      right: 8,
      bottom: expect.closeTo(150 - (derniere.y - 10), 5),
      text: '4,3',
    })
  })

  it('ne double pas le plus haut quand c’est la dernière pesée', () => {
    const chart = buildCarnetWeightChart(MILO_6_MOIS, 320)!

    expect(chart.max).toBeNull()
    expect(chart.min).toMatchObject({ text: '23,6', anchor: 'start' })
    expect(chart.latest.text).toBe('24,5')
  })

  it('ne double pas le plus bas quand c’est la dernière pesée', () => {
    const chart = buildCarnetWeightChart(
      pesees(['2026-03-01', 24.5], ['2026-04-01', 24], ['2026-05-01', 23.6]),
      320,
    )!

    expect(chart.min).toBeNull()
    expect(chart.max).toMatchObject({ text: '24,5', anchor: 'start' })
  })

  it('tait un extrême que la dernière pesée égale, même atteint plus tôt', () => {
    const chart = buildCarnetWeightChart(
      pesees(['2026-03-01', 24.5], ['2026-04-01', 24], ['2026-05-01', 24.5]),
      320,
    )!

    expect(chart.max).toBeNull()
    expect(chart.min).toMatchObject({ text: '24,0', anchor: 'middle' })
  })

  it('n’écrit que la pastille sur une ligne plate', () => {
    const chart = buildCarnetWeightChart(pesees(['2026-03-01', 4.2], ['2026-03-31', 4.2]), 320)!

    expect(chart.max).toBeNull()
    expect(chart.min).toBeNull()
    expect(chart.latest.text).toBe('4,2')
  })

  it('aligne une étiquette sur sa fin quand son point touche le bord droit', () => {
    const chart = buildCarnetWeightChart(
      pesees(['2026-03-04', 23.6], ['2026-09-14', 24.6], ['2026-09-15', 24.5]),
      320,
    )!

    expect(chart.max).toMatchObject({ text: '24,6', anchor: 'end' })
  })
})

describe('weightAxisTicks', () => {
  it('gradue en kg ronds', () => {
    expect(weightAxisTicks(23.6, 24.5)).toEqual([23.5, 24, 24.5, 25])
    expect(weightAxisTicks(4.1, 4.6)).toEqual([4, 4.2, 4.4, 4.6, 4.8])
    expect(weightAxisTicks(24.5, 24.5)).toEqual([24.4, 24.5, 24.6])
    expect(weightAxisTicks(30.2, 31)).toEqual([30, 30.5, 31, 31.5])
  })

  it('encadre les pesées de trois à cinq lignes, la plus basse à moins d’un pas sous la plus légère', () => {
    for (const low of [0.9, 3.8, 12.3, 24.5, 41]) {
      for (const range of [0, 0.05, 0.3, 1, 2.4, 7, 15, 29]) {
        const ticks = weightAxisTicks(low, low + range)
        const step = ticks[1]! - ticks[0]!

        expect(ticks.length).toBeGreaterThanOrEqual(3)
        expect(ticks.length).toBeLessThanOrEqual(5)
        expect(ticks[0]!).toBeLessThan(low)
        expect(ticks[0]!).toBeGreaterThan(low - 0.1 - step - 1e-9)
        expect(ticks.at(-1)!).toBeGreaterThan(low + range)
      }
    }
  })

  it('garde le pas de 10 kg au-delà, quitte à tracer plus de lignes', () => {
    expect(weightAxisTicks(8, 60)).toEqual([0, 10, 20, 30, 40, 50, 60, 70])
  })
})

describe('buildHistoryWeightChart', () => {
  it('ne trace rien sous deux pesées', () => {
    expect(buildHistoryWeightChart(pesees(['2026-03-04', 23.6]))).toBeNull()
  })

  it('pose une ligne de repère par graduation, son chiffre à gauche du tracé', () => {
    const chart = buildHistoryWeightChart(MILO_6_MOIS, 320)!

    expect(chart.plot).toEqual({ left: 36, right: 310, top: 12, bottom: 168 })
    expect(chart.gridLines).toEqual([
      { y: 168, label: { x: 28, y: 172, text: '23,5' } },
      { y: 116, label: { x: 28, y: 120, text: '24' } },
      { y: 64, label: { x: 28, y: 68, text: '24,5' } },
      { y: 12, label: { x: 28, y: 16, text: '25' } },
    ])
  })

  it('place les pesées dans l’échelle des graduations, selon leur date', () => {
    const chart = buildHistoryWeightChart(
      pesees(['2026-03-01', 23.5], ['2026-03-11', 24], ['2026-03-31', 25]),
      320,
    )!

    // Graduations 23 → 26 kg sur 156 px.
    expect(chart.points.map((point) => [point.x, point.y])).toEqual([
      [36, 142],
      [127.3, 116],
      [310, 64],
    ])
    expect(chart.area).toBe('M36,168 L36,142 L127.3,116 L310,64 L310,168 Z')
  })

  it('écrit les mois comme le Carnet, sous son propre tracé', () => {
    const chart = buildHistoryWeightChart(LUNA_1_AN, 320)!

    expect(chart.months.map((month) => month.text)).toEqual([
      'Oct.',
      'Déc.',
      'Févr.',
      'Avr.',
      'Juin',
      'Août',
    ])
    expect(chart.months.every((month) => month.y === 186)).toBe(true)
  })

  it('garde la date et le poids de chaque pesée, pour la lire au toucher', () => {
    const chart = buildHistoryWeightChart(MILO_6_MOIS, 320)!

    expect(chart.points[2]).toMatchObject({ measuredOn: '2026-04-22', weightKg: 24 })
  })
})

describe('nearestPointIndex', () => {
  const points = [{ x: 36 }, { x: 100 }, { x: 180 }, { x: 180 }, { x: 310 }]

  it('retient la pesée la plus proche horizontalement', () => {
    expect(nearestPointIndex(points, -20)).toBe(0)
    expect(nearestPointIndex(points, 60)).toBe(0)
    expect(nearestPointIndex(points, 90)).toBe(1)
    expect(nearestPointIndex(points, 290)).toBe(4)
    expect(nearestPointIndex(points, 500)).toBe(4)
  })

  it('préfère la plus récente à égale distance', () => {
    expect(nearestPointIndex(points, 68)).toBe(1)
    expect(nearestPointIndex(points, 180)).toBe(3)
  })
})
