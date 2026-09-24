import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import {
  buildCarnetWeightChart,
  buildHistoryWeightChart,
  nearestPointIndex,
  weightAxisTicks,
  type CarnetChartLabels,
  type CarnetWeightChart,
  type ChartBox,
  type ChartPlot,
  type WeightChartEntry,
} from '../domain/weight-chart'
import i18n, { applyLocale } from '@/core/i18n'

const LIBELLES: CarnetChartLabels = {
  max: (weight) => `max ${weight}`,
  min: (weight) => `min ${weight}`,
  latest: (weight) => `${weight} kg`,
}

function carnet(
  entries: readonly WeightChartEntry[],
  width = 320,
  textScale = 1,
  labels = LIBELLES,
) {
  return buildCarnetWeightChart(entries, labels, { width, textScale })
}

function historique(entries: readonly WeightChartEntry[], width = 320, textScale = 1) {
  return buildHistoryWeightChart(entries, { width, textScale })
}

afterEach(() => applyLocale('fr'))

let previousTz: string | undefined

// Un fuseau à heure d'été : un calcul de jours en heure locale décalerait les points.
beforeAll(() => {
  previousTz = process.env.TZ
  process.env.TZ = 'Europe/Paris'
})

afterAll(() => {
  process.env.TZ = previousTz
})

function chevauche(a: ChartBox, b: ChartBox): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

const FACTEURS = [1, 1.3, 1.5]

function horsDuSvg(chart: { width: number; height: number }, boxes: ChartBox[]): ChartBox[] {
  return boxes.filter(
    (box) => box.left < 0 || box.right > chart.width || box.top < 0 || box.bottom > chart.height,
  )
}

function boitesDuCarnet(chart: CarnetWeightChart): ChartBox[] {
  return [
    ...chart.months.map((month) => month.box),
    ...[chart.max, chart.min].flatMap((label) => (label ? [label.box] : [])),
    chart.latest.box,
  ]
}

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
    expect(carnet([])).toBeNull()
    expect(carnet(pesees(['2026-03-04', 23.6]))).toBeNull()
  })

  it('place chaque pesée selon sa date, de bord à bord du tracé', () => {
    const chart = carnet(
      pesees(['2026-03-01', 23.6], ['2026-03-11', 23.8], ['2026-03-31', 24.0]),
      320,
    )!

    expect(chart.plot).toEqual({ left: 8, right: 312, top: 34, bottom: 134 })
    expect(chart.points.map((point) => point.x)).toEqual([8, 109.3, 312])
  })

  it('centre les pesées quand elles tombent toutes le même jour', () => {
    const chart = carnet(pesees(['2026-03-04', 23.6], ['2026-03-04', 23.8]), 320)!

    expect(chart.points.map((point) => point.x)).toEqual([160, 160])
  })

  it('suit la largeur reçue', () => {
    const chart = carnet(pesees(['2026-03-01', 23.6], ['2026-03-31', 24]), 280)!

    expect(chart.width).toBe(280)
    expect(chart.points.map((point) => point.x)).toEqual([8, 272])
  })

  it('assemble la courbe et le voile qui descend jusqu’au bas du tracé', () => {
    const chart = carnet(pesees(['2026-03-01', 23.6], ['2026-03-31', 24.5]), 320)!

    expect(chart.line).toBe('8,109 312,52.8')
    expect(chart.area).toBe('M8,134 L8,109 L312,52.8 L312,134 Z')
  })
})

describe('buildCarnetWeightChart — échelle', () => {
  it('borne l’échelle au min / max avec 0,3 kg de marge, jamais depuis zéro', () => {
    const chart = carnet(pesees(['2026-03-01', 4.2], ['2026-03-31', 4.3]), 320)!

    // Échelle 3,9 → 4,6 sur 100 px : 4,2 aux trois septièmes de la hauteur, 4,3 aux quatre.
    expect(chart.points.map((point) => point.y)).toEqual([91.1, 76.9])
  })

  it('garde 0,3 kg sous le plus bas quand la pastille l’écrit, sans place pour « min »', () => {
    const chart = carnet(pesees(['2026-03-01', 24.5], ['2026-03-31', 23.6]), 320)!

    // Échelle 23,3 → 24,8 sur 100 px : 24,5 aux quatre cinquièmes de la hauteur, 23,6 à un.
    expect(chart.min).toBeNull()
    expect(chart.points.map((point) => point.y)).toEqual([54, 114])
  })

  it('descend sous le plus bas assez pour écrire « min » entre son point et la ligne de base', () => {
    const chart = carnet(pesees(['2026-03-01', 23.6], ['2026-03-31', 24.5]), 320)!

    // 0,3 kg ne ferait que 20 px : le point le plus bas monte à 25 px de la ligne de base.
    expect(chart.points.map((point) => point.y)).toEqual([109, 52.8])
    expect(chart.min!.box.bottom).toBeLessThan(chart.plot.bottom - 2)
  })

  it('centre une ligne plate', () => {
    const chart = carnet(pesees(['2026-03-01', 4.2], ['2026-03-31', 4.2]), 320)!

    expect(chart.points.map((point) => point.y)).toEqual([84, 84])
  })
})

describe('mois sous la courbe', () => {
  it('écrit un mois à chaque début de mois, et le mois de départ au début de l’axe', () => {
    const chart = carnet(MILO_6_MOIS, 320)!

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

  it('écrit les mois à 22 px sous la ligne de base ; la carte garde sa hauteur, la courbe prend la place', () => {
    const chart = carnet(MILO_6_MOIS)!

    for (const month of chart.months) expect(month.y - chart.plot.bottom).toBe(22)
    expect(chart.height).toBe(160)
    expect(chart.plot.top).toBe(34)
    expect(chart.plot.bottom - chart.plot.top).toBe(100)
  })

  it('n’écrit plus un mois par pesée : deux pesées du même mois, un seul libellé', () => {
    const chart = carnet(pesees(['2026-03-04', 23.6], ['2026-03-20', 23.8]), 320)!

    expect(chart.months).toMatchObject([
      { x: 8, y: 156, text: 'Mars', tickX: null, anchor: 'start' },
    ])
  })

  it('tait le mois de départ quand le premier changement de mois arrive trop tôt', () => {
    const chart = carnet(pesees(['2026-03-28', 23.6], ['2026-06-10', 24]), 320)!

    expect(chart.months.map((month) => month.text)).toEqual(['Avr.', 'Mai', 'Juin'])
  })

  it('garde un mois sur deux au-delà de six mois', () => {
    const chart = carnet(LUNA_1_AN, 320)!

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
    const six = carnet(pesees(['2026-01-15', 4], ['2026-07-15', 4.2]), 320)!
    const sept = carnet(pesees(['2026-01-15', 4], ['2026-08-15', 4.2]), 320)!

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

  it('espace les mois d’un pas de 1, 2, 3, 6 ou 12 mois : jamais plus de six libellés', () => {
    const treize = carnet(pesees(['2025-08-15', 4], ['2026-09-15', 4.2]), 320)!
    const vingt = carnet(pesees(['2025-01-10', 0.9], ['2026-09-01', 4.3]), 320)!
    const vingtQuatre = carnet(pesees(['2024-09-15', 4], ['2026-09-15', 4.2]), 320)!

    expect(treize.months.map((month) => month.text)).toEqual([
      'Sept.',
      'Déc.',
      'Mars',
      'Juin',
      'Sept.',
    ])
    expect(vingt.months.map((month) => month.text)).toEqual(['Févr.', 'Août', 'Févr.', 'Août'])
    expect(vingtQuatre.months.map((month) => month.text)).toEqual(['Oct.', 'Avr.', 'Oct.', 'Avr.'])
  })

  it('ne laisse aucun libellé toucher son voisin, sur 13, 20 et 24 mois', () => {
    const historiques = [
      pesees(['2025-08-15', 4], ['2026-09-15', 4.2]),
      pesees(['2025-01-10', 0.9], ['2026-09-01', 4.3]),
      pesees(['2024-09-15', 4], ['2026-09-15', 4.2]),
    ]
    for (const entries of historiques) {
      for (const width of [300, 320, 360]) {
        for (const textScale of FACTEURS) {
          for (const chart of [
            carnet(entries, width, textScale)!,
            historique(entries, width, textScale)!,
          ]) {
            // Comme dans le ticket, le mois de départ partiel ne compte pas dans les six.
            const changements = chart.months.filter((month) => month.tickX !== null)
            expect(changements.length).toBeLessThanOrEqual(6)
            expect(chart.months.length).toBeLessThanOrEqual(7)
            expect(
              horsDuSvg(
                chart,
                chart.months.map((month) => month.box),
              ),
            ).toEqual([])
            chart.months.slice(1).forEach((month, index) => {
              expect(month.box.left).toBeGreaterThan(chart.months[index]!.box.right)
            })
          }
        }
      }
    }
  })

  it('compte le mois de départ en plus des six changements de mois', () => {
    const chart = carnet(pesees(['2026-01-05', 4], ['2026-07-05', 4.2]))!

    expect(chart.months.map((month) => month.text)).toEqual([
      'Janv.',
      'Févr.',
      'Mars',
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
    ])
    expect(chart.months.filter((month) => month.tickX !== null)).toHaveLength(6)
  })

  it('aligne la fin du dernier mois sur la fin de l’axe plutôt que de déborder', () => {
    const chart = carnet(
      pesees(['2026-04-12', 23.6], ['2026-05-20', 23.8], ['2026-07-02', 24], ['2026-09-01', 24.5]),
      320,
    )!
    const dernier = chart.months.at(-1)!

    expect(dernier).toMatchObject({ text: 'Sept.', anchor: 'end', x: 312, tickX: 312 })
    expect(dernier.box.right).toBeLessThanOrEqual(312)
    expect(chart.months.map((month) => month.text)).toEqual([
      'Avr.',
      'Mai',
      'Juin',
      'Juil.',
      'Août',
      'Sept.',
    ])
  })

  it('ne fait dépasser aucun libellé de la largeur du graphique', () => {
    for (const last of ['2026-09-01', '2026-09-02', '2026-09-03', '2026-08-31']) {
      for (const first of ['2026-03-01', '2026-04-12', '2025-09-01', '2025-01-01']) {
        for (const width of [300, 320, 360]) {
          const entries = pesees([first, 23.6], [last, 24.5])
          for (const textScale of FACTEURS) {
            for (const chart of [
              carnet(entries, width, textScale)!,
              historique(entries, width, textScale)!,
            ]) {
              expect(chart.months.at(-1)!.box.right).toBeLessThanOrEqual(chart.plot.right)
              expect(
                horsDuSvg(
                  chart,
                  chart.months.map((month) => month.box),
                ),
              ).toEqual([])
              chart.months.slice(1).forEach((month, index) => {
                expect(month.box.left).toBeGreaterThan(chart.months[index]!.box.right)
              })
            }
          }
        }
      }
    }
  })

  it('efface le mois précédent plutôt que le dernier quand la fin de l’axe les rapproche trop', () => {
    const chart = carnet(
      pesees(['2026-04-01', 23.6], ['2026-06-01', 24], ['2026-09-01', 24.5]),
      292,
    )!

    expect(chart.months.at(-1)).toMatchObject({ text: 'Sept.', anchor: 'end' })
    expect(chart.months.map((month) => month.text)).not.toContain('Août')
  })

  it('garde le trait de repère du mois dont le libellé s’efface', () => {
    const chart = carnet(
      pesees(['2026-04-01', 23.6], ['2026-06-01', 24], ['2026-09-01', 24.5]),
      292,
    )!
    // 1er août : 122 jours sur 153, sur un tracé de 276 px.
    const aout = Math.round((8 + (122 / 153) * 276) * 10) / 10

    expect(chart.monthTicks).toHaveLength(5)
    expect(chart.monthTicks).toContain(aout)
    expect(chart.monthTicks.at(-1)).toBe(284)
  })

  it('trace un trait pour chaque mois écrit, aucun pour le mois de départ', () => {
    const chart = carnet(MILO_6_MOIS)!

    expect(chart.monthTicks).toEqual(
      chart.months.filter((month) => month.tickX !== null).map((month) => month.tickX),
    )
  })

  it('mesure les mois dans la langue affichée : en anglais, « Sep » plus court laisse « Aug » en place', () => {
    const entries = pesees(['2026-04-01', 23.6], ['2026-06-01', 24], ['2026-09-01', 24.5])
    applyLocale('en')

    const chart = carnet(entries, 292)!

    expect(chart.months.map((month) => month.text)).toEqual([
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
    ])
    chart.months.slice(1).forEach((month, index) => {
      expect(month.box.left).toBeGreaterThan(chart.months[index]!.box.right)
    })
  })
})

describe('buildCarnetWeightChart — libellés reçus du composant', () => {
  it('écrit et mesure exactement les libellés traduits qu’il reçoit', () => {
    applyLocale('en')
    const { t } = i18n.global
    const anglais: CarnetChartLabels = {
      max: (weight) => t('weight.chart.max', { weight }),
      min: (weight) => t('weight.chart.min', { weight }),
      latest: (weight) => t('weight.chart.latest', { weight }),
    }

    const chart = carnet(LUNA_1_AN, 320, 1, anglais)!

    expect(chart.max!.text).toBe('max 4.6')
    expect(chart.min!.text).toBe('min 4.1')
    expect(chart.latest.text).toBe('4.3 kg')
  })

  it('élargit la boîte d’une étiquette avec son libellé', () => {
    const court = carnet(LUNA_1_AN)!.max!.box
    const long = carnet(LUNA_1_AN, 320, 1, { ...LIBELLES, max: (weight) => `plus haut ${weight}` })!
      .max!.box

    expect(long.right - long.left).toBeGreaterThan(court.right - court.left + 20)
  })
})

describe('buildCarnetWeightChart — police agrandie', () => {
  it('agrandit les boîtes des textes selon la taille de police réellement rendue', () => {
    const normal = carnet(LUNA_1_AN)!
    const agrandi = carnet(LUNA_1_AN, 320, 1.3)!
    const largeur = (box: ChartBox) => box.right - box.left
    const hauteur = (box: ChartBox) => box.bottom - box.top

    expect(largeur(agrandi.min!.box)).toBeCloseTo(largeur(normal.min!.box) * 1.3, 5)
    expect(hauteur(agrandi.months[0]!.box)).toBeCloseTo(hauteur(normal.months[0]!.box) * 1.3, 5)
  })

  it('pose « min » du côté où il tient, sans sortir du graphique : chien au régime, police agrandie', () => {
    const regimes = [
      pesees(
        ['2026-03-01', 35],
        ['2026-05-01', 33.3],
        ['2026-06-15', 31.5],
        ['2026-08-01', 29.8],
        ['2026-08-11', 30],
      ),
      pesees(
        ['2026-03-20', 35],
        ['2026-04-27', 33.3],
        ['2026-06-04', 31.5],
        ['2026-07-12', 29.8],
        ['2026-08-20', 30],
      ),
    ]
    const defauts: string[] = []
    for (const locale of ['fr', 'en'] as const) {
      applyLocale(locale)
      for (const entries of regimes) {
        for (const width of [260, 280, 300, 320, 340, 360]) {
          for (const textScale of [1.3, 1.5]) {
            const chart = carnet(entries, width, textScale)!
            const min = chart.min!
            const cas = `${locale}, ${width} px, police × ${textScale}`
            if (horsDuSvg(chart, boitesDuCarnet(chart)).length > 0)
              defauts.push(`hors du SVG, ${cas}`)
            const voisins = [chart.latest.box, ...chart.months.map((month) => month.box)]
            if (chart.max) voisins.push(chart.max.box)
            if (voisins.some((box) => chevauche(min.box, box)))
              defauts.push(`chevauchement, ${cas}`)
          }
        }
      }
    }

    expect(defauts).toEqual([])
    applyLocale('fr')
    const chart = carnet(regimes[0]!, 320, 1.3)!
    expect(chart.min).toMatchObject({ text: 'min 29,8', anchor: 'end' })
    expect(chart.min!.box.right).toBeLessThanOrEqual(chart.plot.right)
  })

  it('à 130 %, garde « min » sous son point : l’échelle lui laisse la place au-dessus de la ligne de base', () => {
    const chiot = pesees(
      ['2025-11-02', 5],
      ['2026-01-10', 12],
      ['2026-04-20', 22],
      ['2026-09-01', 30],
    )
    const chart = carnet(chiot, 320, 1.3)!
    const point = chart.points[0]!

    expect(chart.min).toMatchObject({ anchor: 'start', x: point.x })
    expect(chart.min!.box.top).toBeGreaterThan(point.y)
    expect(chart.min!.box.bottom).toBeLessThan(chart.plot.bottom - 2)
  })
})

describe('buildCarnetWeightChart — chasse d’une autre police', () => {
  const chasseFixe = (text: string) => text.length * 10
  const largeur = (box: ChartBox) => box.right - box.left

  it('mesure les mois, les extrêmes et la pastille avec la chasse reçue', () => {
    const chart = buildCarnetWeightChart(LUNA_1_AN, LIBELLES, { textWidth: chasseFixe })!

    expect(largeur(chart.max!.box)).toBeCloseTo('max 4,6'.length * 10, 5)
    expect(largeur(chart.min!.box)).toBeCloseTo('min 4,1'.length * 10, 5)
    for (const month of chart.months) {
      expect(largeur(month.box)).toBeCloseTo(month.text.length * 10, 5)
    }
    // Pastille : le texte et 9 px de marge de chaque côté.
    expect(largeur(chart.latest.box)).toBeCloseTo('4,3\u00a0kg'.length * 10 + 18, 5)
  })

  it('lui applique encore la taille de police rendue', () => {
    const chart = buildCarnetWeightChart(LUNA_1_AN, LIBELLES, {
      textWidth: chasseFixe,
      textScale: 1.5,
    })!

    expect(largeur(chart.max!.box)).toBeCloseTo('max 4,6'.length * 10 * 1.5, 5)
  })

  it('place les textes selon cette chasse : sans chevauchement ni débordement', () => {
    const cas = [
      LUNA_1_AN,
      MILO_6_MOIS,
      pesees(['2025-01-10', 0.9], ['2026-09-01', 4.3]),
      pesees(['2025-11-02', 5], ['2026-01-10', 12], ['2026-04-20', 22], ['2026-09-01', 30]),
    ]
    for (const entries of cas) {
      for (const chasse of [chasseFixe, (text: string) => text.length * 13]) {
        const chart = buildCarnetWeightChart(entries, LIBELLES, { width: 320, textWidth: chasse })!
        const boites = boitesDuCarnet(chart)

        expect(horsDuSvg(chart, boites)).toEqual([])
        boites.forEach((boite, index) => {
          for (const autre of boites.slice(index + 1)) expect(chevauche(boite, autre)).toBe(false)
        })
      }
    }
  })
})

describe('ligne de base', () => {
  // Le trait de 1 px sous la courbe ; « toucher » compte comme chevaucher.
  function ligneDeBase(chart: { plot: ChartPlot }): ChartBox {
    const { left, right, bottom } = chart.plot
    return { left, right, top: bottom - 0.5, bottom: bottom + 0.5 }
  }

  function touche(a: ChartBox, b: ChartBox): boolean {
    return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
  }

  const DEMO_MILO = pesees(
    ['2026-04-23', 23.6],
    ['2026-05-23', 23.8],
    ['2026-06-23', 24],
    ['2026-07-23', 24.1],
    ['2026-08-23', 24.3],
    ['2026-09-23', 24.5],
  )
  const CAS = [
    DEMO_MILO,
    MILO_6_MOIS,
    LUNA_1_AN,
    pesees(['2025-11-02', 5], ['2026-01-10', 12], ['2026-04-20', 22], ['2026-09-01', 30]),
    pesees(['2025-01-10', 0.9], ['2026-09-01', 4.3]),
    pesees(['2026-03-04', 60], ['2026-06-10', 12], ['2026-09-15', 30]),
    pesees(['2026-03-01', 24], ['2026-04-01', 24.1], ['2026-05-01', 24.05]),
    pesees(
      ['2026-03-01', 35],
      ['2026-05-01', 33.3],
      ['2026-06-15', 31.5],
      ['2026-08-01', 29.8],
      ['2026-08-11', 30],
    ),
    pesees(['2026-01-10', 20], ['2026-09-10', 24.6], ['2026-09-23', 24.5]),
    pesees(['2026-01-10', 24.6], ['2026-09-10', 20], ['2026-09-23', 22]),
  ]

  it('aucune étiquette ne traverse ni ne touche la ligne de base, jambages compris', () => {
    const defauts: string[] = []
    for (const locale of ['fr', 'en'] as const) {
      applyLocale(locale)
      for (const entries of CAS) {
        for (const width of [300, 320, 360]) {
          for (const textScale of FACTEURS) {
            const cas = `${locale}, ${entries[0]!.measuredOn} → ${entries.at(-1)!.weightKg}, ${width} px, × ${textScale}`
            const carnetChart = carnet(entries, width, textScale)!
            const historyChart = historique(entries, width, textScale)!
            const boites = [
              ...boitesDuCarnet(carnetChart).map((box) => ({ box, chart: carnetChart })),
              ...historyChart.months.map(({ box }) => ({ box, chart: historyChart })),
            ]
            for (const { box, chart } of boites) {
              if (touche(box, ligneDeBase(chart))) defauts.push(cas)
            }
          }
        }
      }
    }

    expect(defauts).toEqual([])
  })

  it('garde « min » sous son point, police agrandie comprise', () => {
    for (const entries of CAS) {
      for (const textScale of FACTEURS) {
        const chart = carnet(entries, 320, textScale)!
        if (!chart.min) continue
        const point = chart.points.find(
          (candidate) => candidate.weightKg === Math.min(...entries.map((entry) => entry.weightKg)),
        )!

        expect(chart.min.box.top).toBeGreaterThan(point.y)
        expect(chart.min.box.bottom).toBeLessThan(chart.plot.bottom)
      }
    }
  })
})

describe('buildCarnetWeightChart — les trois chiffres écrits', () => {
  it('écrit le plus haut au-dessus de son point, le plus bas dessous, la dernière pesée en pastille', () => {
    const chart = carnet(LUNA_1_AN, 320)!
    const plusHaut = chart.points[3]!
    const plusBas = chart.points[10]!
    const derniere = chart.points[13]!

    expect(chart.max).toMatchObject({
      x: plusHaut.x,
      y: expect.closeTo(plusHaut.y - 11, 5),
      text: 'max 4,6',
      anchor: 'middle',
    })
    expect(chart.min).toMatchObject({
      x: plusBas.x,
      y: expect.closeTo(plusBas.y + 19, 5),
      text: 'min 4,1',
      anchor: 'middle',
    })
    // Pastille ancrée par son coin bas droit : au bout du tracé, 10 px au-dessus du point.
    expect(chart.latest).toMatchObject({
      right: 8,
      bottom: expect.closeTo(160 - (derniere.y - 10), 5),
      text: '4,3\u00a0kg',
    })
  })

  it('passe « max » sous son point quand il chevaucherait la pastille, sans bouger la pastille', () => {
    const chart = carnet(
      pesees(
        ['2026-05-23', 23.6],
        ['2026-06-23', 24.0],
        ['2026-07-23', 24.1],
        ['2026-08-23', 24.6],
        ['2026-09-23', 24.5],
      ),
      320,
    )!
    const plusHaut = chart.points[3]!
    const derniere = chart.points[4]!

    expect(chart.max!.y).toBeGreaterThan(plusHaut.y)
    expect(chart.max!.text).toBe('max 24,6')
    expect(chart.latest).toMatchObject({
      right: 8,
      bottom: expect.closeTo(160 - (derniere.y - 10), 5),
    })
    expect(chevauche(chart.max!.box, chart.latest.box)).toBe(false)
  })

  it('ne laisse aucune étiquette chevaucher la pastille', () => {
    const cas: WeightChartEntry[][] = [MILO_6_MOIS, LUNA_1_AN]
    for (let tenths = 200; tenths <= 245; tenths += 1) {
      cas.push(
        pesees(
          ['2026-05-23', 23.6],
          ['2026-06-23', 24.0],
          ['2026-07-23', 24.1],
          ['2026-08-23', 24.6],
          ['2026-09-23', tenths / 10],
        ),
        pesees(['2026-01-10', 20], ['2026-09-10', 24.6], ['2026-09-23', tenths / 10]),
      )
    }
    const chevauchements: string[] = []
    let maxSousSonPoint = 0
    for (const entries of cas) {
      for (const width of [300, 320, 360]) {
        for (const textScale of FACTEURS) {
          const chart = carnet(entries, width, textScale)!
          const plusHaut = chart.points.find((point) => point.weightKg === 24.6)
          if (chart.max && plusHaut && chart.max.y > plusHaut.y) maxSousSonPoint += 1
          for (const label of [chart.max, chart.min]) {
            if (label && chevauche(label.box, chart.latest.box)) {
              chevauchements.push(`${label.text} à ${width} px, police × ${textScale}`)
            }
          }
          if (horsDuSvg(chart, boitesDuCarnet(chart)).length > 0) {
            chevauchements.push(`hors du SVG à ${width} px, police × ${textScale}`)
          }
        }
      }
    }

    expect(chevauchements).toEqual([])
    expect(maxSousSonPoint).toBeGreaterThan(0)
  })

  it('garde « min » au-dessus de la rangée des mois, même pour un chiot de 5 à 30 kg', () => {
    const cas = [
      pesees(['2025-11-02', 5], ['2026-01-10', 12], ['2026-04-20', 22], ['2026-09-01', 30]),
      pesees(['2025-03-15', 0.9], ['2025-06-15', 2.4], ['2026-01-15', 4.1], ['2026-09-15', 4.3]),
      pesees(['2026-03-04', 60], ['2026-06-10', 12], ['2026-09-15', 30]),
      LUNA_1_AN,
    ]
    for (const entries of cas) {
      for (const width of [300, 320, 360]) {
        for (const textScale of FACTEURS) {
          const chart = carnet(entries, width, textScale)!

          expect(chart.min).not.toBeNull()
          for (const month of chart.months) {
            expect(chevauche(chart.min!.box, month.box)).toBe(false)
          }
          expect(horsDuSvg(chart, boitesDuCarnet(chart))).toEqual([])
        }
      }
    }
  })

  it('à taille de police normale, garde « min » sous son point', () => {
    const chart = carnet(
      pesees(['2025-11-02', 5], ['2026-01-10', 12], ['2026-04-20', 22], ['2026-09-01', 30]),
    )!

    expect(chart.min!.y).toBeCloseTo(chart.points[0]!.y + 19, 5)
  })

  it('ne double pas le plus haut quand c’est la dernière pesée', () => {
    const chart = carnet(MILO_6_MOIS, 320)!

    expect(chart.max).toBeNull()
    expect(chart.min).toMatchObject({ text: 'min 23,6', anchor: 'start' })
    expect(chart.latest.text).toBe('24,5\u00a0kg')
  })

  it('ne double pas le plus bas quand c’est la dernière pesée', () => {
    const chart = carnet(
      pesees(['2026-03-01', 24.5], ['2026-04-01', 24], ['2026-05-01', 23.6]),
      320,
    )!

    expect(chart.min).toBeNull()
    expect(chart.max).toMatchObject({ text: 'max 24,5', anchor: 'start' })
  })

  it('tait un extrême que la dernière pesée égale, même atteint plus tôt', () => {
    const chart = carnet(
      pesees(['2026-03-01', 24.5], ['2026-04-01', 24], ['2026-05-01', 24.5]),
      320,
    )!

    expect(chart.max).toBeNull()
    expect(chart.min).toMatchObject({ text: 'min 24,0', anchor: 'middle' })
  })

  it('n’écrit que la pastille sur une ligne plate', () => {
    const chart = carnet(pesees(['2026-03-01', 4.2], ['2026-03-31', 4.2]), 320)!

    expect(chart.max).toBeNull()
    expect(chart.min).toBeNull()
    expect(chart.latest.text).toBe('4,2\u00a0kg')
  })

  it('aligne une étiquette sur sa fin quand son point touche le bord droit', () => {
    const chart = carnet(
      pesees(['2026-03-04', 23.6], ['2026-09-14', 24.6], ['2026-09-15', 24.5]),
      320,
    )!

    expect(chart.max).toMatchObject({ text: 'max 24,6', anchor: 'end' })
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
  it('ne trace rien sans pesée', () => {
    expect(historique([])).toBeNull()
  })

  it('centre la pesée d’une page qui n’en compte qu’une, dans des repères qui l’encadrent', () => {
    const chart = historique(pesees(['2026-03-04', 23.6]), 320)!

    expect(chart.points).toEqual([{ x: 173, y: 90, weightKg: 23.6, measuredOn: '2026-03-04' }])
    expect(chart.gridLines.map((line) => line.label.text)).toEqual(['23,5', '23,6', '23,7'])
    expect(chart.months.map((month) => month.text)).toEqual(['Mars'])
  })

  it('pose une ligne de repère par graduation, son chiffre à gauche du tracé', () => {
    const chart = historique(MILO_6_MOIS, 320)!

    expect(chart.plot).toEqual({ left: 36, right: 310, top: 12, bottom: 168 })
    expect(chart.gridLines).toEqual([
      { y: 168, label: { x: 28, y: 172, text: '23,5' } },
      { y: 116, label: { x: 28, y: 120, text: '24' } },
      { y: 64, label: { x: 28, y: 68, text: '24,5' } },
      { y: 12, label: { x: 28, y: 16, text: '25' } },
    ])
  })

  it('place les pesées dans l’échelle des graduations, selon leur date', () => {
    const chart = historique(
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
    const chart = historique(LUNA_1_AN, 320)!

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
    const chart = historique(MILO_6_MOIS, 320)!

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
