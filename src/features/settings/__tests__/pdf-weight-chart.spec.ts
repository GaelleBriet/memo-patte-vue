import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { jsPDF } from 'jspdf'
import { afterEach, describe, expect, it } from 'vitest'

import { drawWeightChart } from '../logic/pdf-weight-chart'
import {
  bounds,
  readPdf,
  sameColor,
  type PdfBounds,
  type PdfPath,
  type PdfText,
} from './pdf-reader'
import { applyLocale } from '@/core/i18n'
import { contrastRatio, scssColorTokens } from '@/core/theme/__tests__/contrast'
import vuetify from '@/core/theme/vuetify'
import { CHART_FONT_PX, type WeightChartEntry } from '@/shared/domain/weight-chart'

const MM_PER_PT = 25.4 / 72
// Métriques AFM d'Helvetica : accents jusqu'à 0,75 em au-dessus de la ligne de base, « g » à 0,22 dessous.
const ASCENT_EM = 0.75
const DESCENT_EM = 0.22
const CAP_HEIGHT_EM = 0.718
const FRAME = { x: 18, y: 120, width: 174 }

const tokens = scssColorTokens()
const PRIMARY = String(vuetify.theme.themes.value.light!.colors.primary).toUpperCase()
const WHITE = '#FFFFFF'

afterEach(() => applyLocale('fr'))

function pesees(...items: [string, number][]): WeightChartEntry[] {
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

const DEMO_MILO = pesees(
  ['2026-04-23', 23.6],
  ['2026-05-23', 23.8],
  ['2026-06-23', 24],
  ['2026-07-23', 24.1],
  ['2026-08-23', 24.3],
  ['2026-09-23', 24.5],
)

const CHIOT = pesees(['2025-11-02', 5], ['2026-01-10', 12], ['2026-04-20', 22], ['2026-09-01', 30])

const MAX_PRES_DE_LA_PASTILLE = pesees(
  ['2026-01-10', 20],
  ['2026-09-10', 24.6],
  ['2026-09-23', 24.5],
)

function dessine(entries: readonly WeightChartEntry[], frame = FRAME) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const height = drawWeightChart(doc, entries, frame)
  return { height, ...readPdf(new Uint8Array(doc.output('arraybuffer'))) }
}

const mesure = new jsPDF({ unit: 'mm', format: 'a4' })

function boite(text: PdfText): PdfBounds {
  mesure.setFont('helvetica', text.bold ? 'bold' : 'normal')
  const em = text.sizePt * MM_PER_PT
  const width = mesure.getStringUnitWidth(text.text, { doKerning: false }) * em
  return {
    left: text.left,
    right: text.left + width,
    top: text.baseline - ASCENT_EM * em,
    bottom: text.baseline + DESCENT_EM * em,
  }
}

function chevauche(a: PdfBounds, b: PdfBounds): boolean {
  return a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom
}

const PALETTE: Record<string, string> = {
  primary: PRIMARY,
  'color-text-meta': tokens['color-text-meta']!,
  'color-chart-value': tokens['color-chart-value']!,
  'color-on-primary': tokens['color-on-primary']!,
  'color-field-border': tokens['color-field-border']!,
}

function nomDe(couleur: string): string | undefined {
  return Object.keys(PALETTE).find((nom) => sameColor(couleur, PALETTE[nom]!))
}

function courbe(paths: PdfPath[]): PdfPath {
  return paths.find((path) => path.paint === 'S' && sameColor(path.stroke, PRIMARY))!
}

function pastille(paths: PdfPath[]): PdfPath {
  return paths.find((path) => path.paint === 'f' && sameColor(path.fill, PRIMARY))!
}

function voile(paths: PdfPath[]): PdfPath {
  return paths.find((path) => path.paint === 'f' && !sameColor(path.fill, PRIMARY))!
}

function centres(paths: PdfPath[]) {
  return paths
    .filter((path) => path.paint === 'B' && sameColor(path.fill, PRIMARY))
    .map((path) => {
      const box = bounds(path.points)
      return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 }
    })
}

function jours(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000
}

function mois(texts: PdfText[]): string[] {
  return texts.filter((text) => !text.bold).map((text) => text.text)
}

function chiffres(texts: PdfText[]): string[] {
  return texts.filter((text) => text.bold).map((text) => text.text)
}

describe('drawWeightChart — axe du temps', () => {
  it('ne dessine rien sous deux pesées', () => {
    const { height, texts, paths } = dessine(pesees(['2026-03-04', 23.6]))

    expect(height).toBeNull()
    expect(texts).toEqual([])
    expect(paths).toEqual([])
  })

  it('place chaque pesée selon sa date, de bord à bord de la largeur reçue', () => {
    const { paths } = dessine(
      pesees(['2026-03-01', 23.6], ['2026-03-11', 23.8], ['2026-03-31', 24]),
    )
    const [premier, milieu, dernier] = courbe(paths).points

    expect((milieu!.x - premier!.x) / (dernier!.x - premier!.x)).toBeCloseTo(10 / 30, 2)
    expect(premier!.x).toBeGreaterThan(FRAME.x)
    expect(premier!.x - FRAME.x).toBeLessThan(3)
    expect(dernier!.x).toBeLessThan(FRAME.x + FRAME.width)
    expect(FRAME.x + FRAME.width - dernier!.x).toBeLessThan(3)
  })

  it('suit l’écart réel entre deux pesées, et pose un point sur chacune', () => {
    const { paths } = dessine(LUNA_1_AN)
    const points = courbe(paths).points
    const duree = jours(LUNA_1_AN[0]!.measuredOn, LUNA_1_AN.at(-1)!.measuredOn)
    const largeur = points.at(-1)!.x - points[0]!.x

    LUNA_1_AN.forEach((entry, index) => {
      const attendu = (jours(LUNA_1_AN[0]!.measuredOn, entry.measuredOn) / duree) * largeur
      expect(points[index]!.x - points[0]!.x).toBeCloseTo(attendu, 1)
    })
    centres(paths).forEach((centre, index) => {
      expect(centre.x).toBeCloseTo(points[index]!.x, 1)
      expect(centre.y).toBeCloseTo(points[index]!.y, 1)
    })
  })

  it('monte avec le poids', () => {
    const { paths } = dessine(pesees(['2026-03-01', 23.6], ['2026-03-31', 24.5]))
    const [avant, apres] = courbe(paths).points

    expect(apres!.y).toBeLessThan(avant!.y)
  })
})

describe('drawWeightChart — mois', () => {
  it('écrit un mois par début de mois, et non un par pesée', () => {
    const { texts } = dessine(MILO_6_MOIS)

    expect(mois(texts)).toEqual(['Mars', 'Avr.', 'Mai', 'Juin', 'Juil.', 'Août', 'Sept.'])
    expect(texts.map((text) => text.text)).not.toContain('23,8')
  })

  it('espace les mois comme le Carnet au-delà de six changements de mois', () => {
    expect(mois(dessine(LUNA_1_AN).texts)).toEqual([
      'Oct.',
      'Déc.',
      'Févr.',
      'Avr.',
      'Juin',
      'Août',
    ])
  })

  it('écrit les mois à 22 px du Carnet sous la ligne de base, la carte gardant sa hauteur', () => {
    const { height, texts, paths } = dessine(MILO_6_MOIS)
    const ligneDeBase = bounds(paths.find((path) => path.paint === 'S')!.points).top
    const libelles = texts.filter((text) => !text.bold)
    const pixel = (libelles[0]!.sizePt * MM_PER_PT) / CHART_FONT_PX

    for (const month of libelles) {
      expect(month.baseline - ligneDeBase).toBeCloseTo(22 * pixel, 2)
    }
    expect(height).toBeCloseTo(160 * pixel, 2)
  })

  it('écrit les mois sous la courbe, dans la langue affichée', () => {
    applyLocale('en')
    const { texts, paths } = dessine(MILO_6_MOIS)
    const plusBas = Math.max(...courbe(paths).points.map((point) => point.y))

    expect(mois(texts)).toEqual(['Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep'])
    for (const text of texts.filter((item) => !item.bold)) {
      expect(text.baseline).toBeGreaterThan(plusBas)
    }
  })
})

describe('drawWeightChart — plus haut, plus bas et dernière pesée', () => {
  it('écrit le plus haut au-dessus de son point, le plus bas dessous, la dernière pesée en pastille', () => {
    const { texts, paths } = dessine(LUNA_1_AN)
    const points = centres(paths)
    const max = texts.find((text) => text.text === 'max 4,6')!
    const min = texts.find((text) => text.text === 'min 4,1')!
    const derniere = texts.find((text) => text.text === '4,3\u00a0kg')!

    expect(chiffres(texts)).toEqual(['max 4,6', 'min 4,1', '4,3\u00a0kg'])
    expect(boite(max).bottom).toBeLessThan(points[3]!.y)
    expect(boite(min).top).toBeGreaterThan(points[10]!.y)
    const fond = bounds(pastille(paths).points)
    const texte = boite(derniere)
    expect(texte.left).toBeGreaterThan(fond.left)
    expect(texte.right).toBeLessThan(fond.right)
    expect(texte.top).toBeGreaterThan(fond.top)
    expect(texte.bottom).toBeLessThan(fond.bottom)
    expect(fond.bottom).toBeLessThan(points.at(-1)!.y)
  })

  it('ne double pas le plus haut quand c’est la dernière pesée', () => {
    expect(chiffres(dessine(MILO_6_MOIS).texts)).toEqual(['min 23,6', '24,5\u00a0kg'])
  })

  it('ajuste la pastille à son texte : 9 px de marge de chaque côté, capitales centrées', () => {
    const { texts, paths } = dessine(pesees(['2026-03-01', 10.2], ['2026-06-01', 11.1]))
    const derniere = texts.at(-1)!
    const texte = boite(derniere)
    const fond = bounds(pastille(paths).points)
    const em = derniere.sizePt * MM_PER_PT
    const pixel = em / CHART_FONT_PX

    expect(derniere.text).toBe('11,1\u00a0kg')
    expect(texte.left - fond.left).toBeCloseTo(9 * pixel, 2)
    expect(fond.right - texte.right).toBeCloseTo(9 * pixel, 2)
    expect(derniere.baseline - (CAP_HEIGHT_EM * em) / 2).toBeCloseTo(
      (fond.top + fond.bottom) / 2,
      2,
    )
  })

  it('garde « max » hors de la pastille quand la largeur ne tombe pas sur un pixel entier', () => {
    const entries = pesees(
      ['2025-03-01', 45],
      ['2025-04-01', 45.8],
      ['2025-05-01', 46.5],
      ['2025-06-01', 47.1],
      ['2025-07-01', 47.9],
      ['2025-08-01', 48.6],
      ['2025-09-01', 49.2],
      ['2025-10-01', 50],
      ['2025-11-01', 50.7],
      ['2025-12-30', 52.6],
      ['2025-12-30', 51.1],
    )
    const { texts, paths } = dessine(entries, { ...FRAME, width: 120 })
    const max = texts.find((text) => text.text === 'max 52,6')!

    expect(chevauche(boite(max), bounds(pastille(paths).points))).toBe(false)
  })

  it('passe « max » sous son point quand il toucherait la pastille', () => {
    const { texts, paths } = dessine(MAX_PRES_DE_LA_PASTILLE)
    const max = texts.find((text) => text.text === 'max 24,6')!

    expect(boite(max).top).toBeGreaterThan(centres(paths)[1]!.y)
    expect(chevauche(boite(max), bounds(pastille(paths).points))).toBe(false)
  })
})

describe('drawWeightChart — aucun chevauchement ni débordement', () => {
  // Le trait tel que tracé, sur toute sa largeur ; « toucher » compte comme chevaucher.
  function ligneDeBase(paths: PdfPath[]): PdfBounds {
    const trait = paths.find((path) => path.paint === 'S')!
    const { left, right, top } = bounds(trait.points)
    return { left, right, top: top - trait.lineWidth / 2, bottom: top + trait.lineWidth / 2 }
  }

  function touche(a: PdfBounds, b: PdfBounds): boolean {
    return a.left <= b.right && b.left <= a.right && a.top <= b.bottom && b.top <= a.bottom
  }

  const cas: WeightChartEntry[][] = [
    DEMO_MILO,
    MILO_6_MOIS,
    LUNA_1_AN,
    CHIOT,
    MAX_PRES_DE_LA_PASTILLE,
    pesees(['2025-01-10', 0.9], ['2026-09-01', 4.3]),
    pesees(['2024-09-15', 4], ['2026-09-15', 4.2]),
    pesees(['2025-03-15', 0.9], ['2025-06-15', 2.4], ['2026-01-15', 4.1], ['2026-09-15', 4.3]),
    pesees(['2026-03-04', 60], ['2026-06-10', 12], ['2026-09-15', 30]),
    pesees(
      ['2026-03-01', 35],
      ['2026-05-01', 33.3],
      ['2026-06-15', 31.5],
      ['2026-08-01', 29.8],
      ['2026-08-11', 30],
    ),
    pesees(['2026-04-01', 23.6], ['2026-06-01', 24], ['2026-09-01', 24.5]),
  ]
  for (let tenths = 200; tenths <= 245; tenths += 5) {
    cas.push(
      pesees(
        ['2026-05-23', 23.6],
        ['2026-06-23', 24.0],
        ['2026-07-23', 24.1],
        ['2026-08-23', 24.6],
        ['2026-09-23', tenths / 10],
      ),
    )
  }

  it('dans la largeur du PDF comme dans une largeur de téléphone, en français et en anglais', () => {
    const defauts: string[] = []
    for (const locale of ['fr', 'en'] as const) {
      applyLocale(locale)
      for (const entries of cas) {
        for (const width of [FRAME.width, 80]) {
          const frame = { ...FRAME, width }
          const { height, texts, paths } = dessine(entries, frame)
          const cadre = {
            left: frame.x,
            right: frame.x + width,
            top: frame.y,
            bottom: frame.y + height!,
          }
          const fond = bounds(pastille(paths).points)
          const derniere = texts.at(-1)!
          const boites = texts.map(boite)
          const libelle = `${locale}, ${width} mm, ${entries[0]!.measuredOn} → ${entries.at(-1)!.weightKg}`

          for (const [index, box] of [...boites, fond].entries()) {
            if (box.left < cadre.left || box.right > cadre.right)
              defauts.push(`déborde, ${libelle}`)
            if (box.top < cadre.top || box.bottom > cadre.bottom)
              defauts.push(`déborde, ${libelle}`)
            for (const autre of boites.slice(index + 1)) {
              if (chevauche(box, autre)) defauts.push(`chevauchement, ${libelle}`)
            }
          }
          texts.forEach((text, index) => {
            if (text !== derniere && chevauche(boites[index]!, fond)) {
              defauts.push(`${text.text} touche la pastille, ${libelle}`)
            }
          })
          const ligne = ligneDeBase(paths)
          texts.forEach((text, index) => {
            if (touche(boites[index]!, ligne)) {
              defauts.push(`${text.text} touche la ligne de base, ${libelle}`)
            }
          })
          if (touche(fond, ligne)) defauts.push(`pastille sur la ligne de base, ${libelle}`)
        }
      }
    }

    expect(defauts).toEqual([])
  })
})

describe('drawWeightChart — lisible à l’impression', () => {
  it('n’écrit aucun texte sous 9 pt, le plus petit corps du PDF', () => {
    const { texts } = dessine(LUNA_1_AN)

    for (const text of texts) expect(text.sizePt).toBeGreaterThanOrEqual(9)
  })

  it('reprend les couleurs du Carnet, traits gris de la bordure de champ pour l’impression', () => {
    const { texts, paths } = dessine(LUNA_1_AN)
    const traits = paths.filter((path) => path.paint === 'S' && path !== courbe(paths))

    expect(new Set(texts.filter((text) => !text.bold).map((text) => nomDe(text.color)))).toEqual(
      new Set(['color-text-meta']),
    )
    expect(texts.filter((text) => text.bold).map((text) => nomDe(text.color))).toEqual([
      'color-chart-value',
      'color-chart-value',
      'color-on-primary',
    ])
    expect(courbe(paths)).toBeDefined()
    expect(pastille(paths)).toBeDefined()
    expect(centres(paths)).toHaveLength(LUNA_1_AN.length)
    expect(traits.length).toBeGreaterThan(1)
    for (const trait of traits) expect(nomDe(trait.stroke)).toBe('color-field-border')
  })

  it('pose le voile pétrole du Carnet sur le blanc de la page, sans transparence', () => {
    const scss = readFileSync(resolve(process.cwd(), 'src/styles/_tokens.scss'), 'utf8')
    const opacite = Number(/^\$opacity-chart-area:\s*([\d.]+);/m.exec(scss)![1])
    const attendu = [1, 3, 5].map((index) => {
      const primaire = parseInt(PRIMARY.slice(index, index + 2), 16)
      return Math.round(255 + opacite * (primaire - 255)).toString(16)
    })

    expect(sameColor(voile(dessine(LUNA_1_AN).paths).fill, `#${attendu.join('')}`)).toBe(true)
  })

  it('garde un contraste AA pour chaque texte sur son fond imprimé', () => {
    const { texts, paths } = dessine(LUNA_1_AN)
    const [max, min, derniere] = texts.filter((text) => text.bold)

    for (const month of texts.filter((text) => !text.bold)) {
      expect(contrastRatio(month.color, WHITE)).toBeGreaterThanOrEqual(4.5)
    }
    for (const extreme of [max!, min!]) {
      for (const fond of [WHITE, voile(paths).fill]) {
        expect(contrastRatio(extreme.color, fond)).toBeGreaterThanOrEqual(4.5)
      }
    }
    expect(contrastRatio(derniere!.color, pastille(paths).fill)).toBeGreaterThanOrEqual(4.5)
  })
})
