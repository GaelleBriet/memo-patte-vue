import { jsPDF } from 'jspdf'
import { afterEach, describe, expect, it } from 'vitest'

import { drawWeightChart } from '../logic/pdf-weight-chart'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { PHOTO_JPEG } from './pdf-fixture'
import { readPdf, sameColor, textBounds, type PdfPath, type PdfText } from './pdf-reader'
import type { CarnetPdfContent } from '../logic/pdf-content'
import vuetify from '@/core/theme/vuetify'
import { applyWeightUnit } from '@/core/preferences/weight-unit-preference'
import i18n from '@/core/i18n'

const MM_PER_PT = 25.4 / 72
const ASCENT_EM = 0.75
const DESCENT_EM = 0.22
const PRIMARY = String(vuetify.theme.themes.value.light!.colors.primary).toUpperCase()

const EMPTY_CONTENT: CarnetPdfContent = {
  animal: {
    name: 'Milo',
    species: 'dog',
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    departureDate: null,
    photoFileName: null,
  },
  generatedOn: '2026-09-15',
  vaccinations: [],
  treatments: [],
  weightEntries: [],
}

const FULL_CONTENT: CarnetPdfContent = {
  animal: {
    name: 'Luna',
    species: 'cat',
    breed: 'Européen',
    birthDate: '2019-03-02',
    birthDateApproximate: false,
    departureDate: null,
    photoFileName: 'luna.jpg',
  },
  generatedOn: '2026-09-15',
  vaccinations: [
    {
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
      injectionDates: ['2025-01-01', '2022-01-01'],
      dueDate: '2026-01-01',
      state: 'overdue',
    },
  ],
  treatments: [
    {
      name: 'Milbémax',
      lastDoseDate: '2026-06-01',
      lastDoseExtra: false,
      periods: [
        {
          from: '2024-11-01',
          to: null,
          frequency: { value: 1, unit: 'month' },
          times: [],
          dosage: { doseQuantity: null, doseUnit: null },
          lines: [
            {
              kind: 'given',
              series: {
                kind: 'range',
                count: 13,
                from: '2025-06-01',
                to: '2026-06-01',
                time: null,
              },
            },
            {
              kind: 'given',
              series: {
                kind: 'dates',
                doses: [
                  { on: '2024-12-01', time: null, extra: false },
                  { on: '2024-11-01', time: null, extra: false },
                ],
              },
            },
          ],
        },
      ],
      due: { kind: 'due', dueOn: '2026-09-01', dueTime: null, overdue: false },
      state: 'upToDate',
    },
  ],
  weightEntries: [
    { measuredOn: '2026-01-01', weightKg: 4 },
    { measuredOn: '2026-06-01', weightKg: 4.3 },
  ],
}

const PESEES_IRREGULIERES = [
  { measuredOn: '2025-09-20', weightKg: 4.2 },
  { measuredOn: '2025-10-18', weightKg: 4.3 },
  { measuredOn: '2025-12-20', weightKg: 4.6 },
  { measuredOn: '2026-01-10', weightKg: 4.5 },
  { measuredOn: '2026-06-27', weightKg: 4.1 },
  { measuredOn: '2026-09-19', weightKg: 4.3 },
]

function jours(from: string, to: string): number {
  return (Date.parse(to) - Date.parse(from)) / 86_400_000
}

describe('renderCarnetPdf', () => {
  it('rend un document non vide, sans rappel ni pesée', () => {
    const bytes = renderCarnetPdf(
      [{ content: EMPTY_CONTENT, photoDataUrl: null }],
      '0.1.24',
      i18n.global.t,
    )
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('rend un document avec rappels, traitement, tableau et courbe de poids ensemble', () => {
    const bytes = renderCarnetPdf(
      [{ content: FULL_CONTENT, photoDataUrl: null }],
      '0.1.24',
      i18n.global.t,
    )
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('dessine la photo quand elle est fournie', () => {
    const withoutPhoto = renderCarnetPdf(
      [{ content: FULL_CONTENT, photoDataUrl: null }],
      '0.1.24',
      i18n.global.t,
    )
    const withPhoto = renderCarnetPdf(
      [{ content: FULL_CONTENT, photoDataUrl: PHOTO_JPEG }],
      '0.1.24',
      i18n.global.t,
    )
    expect(withPhoto.length).toBeGreaterThan(withoutPhoto.length)
  })

  it("n'échoue pas si la photo est illisible", () => {
    expect(() =>
      renderCarnetPdf(
        [{ content: FULL_CONTENT, photoDataUrl: 'data:image/jpeg;base64,invalide' }],
        '0.1.24',
        i18n.global.t,
      ),
    ).not.toThrow()
  })
})

describe('renderCarnetPdf — traitement sans date de fin ni d’arrêt', () => {
  it.each([
    { kind: 'stopped', on: null, beforeFirstDose: false },
    { kind: 'ended', on: null },
  ] as const)(
    'écrit « — » dans la colonne de l’échéance, « Pas de rappel » une seule fois ($kind)',
    (due) => {
      const content: CarnetPdfContent = {
        ...FULL_CONTENT,
        vaccinations: [],
        treatments: [{ ...FULL_CONTENT.treatments[0]!, due, state: 'none' }],
      }
      const texts = readPdf(
        renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
      ).texts.map(({ text }) => text)

      expect(texts).toContain('—')
      expect(texts.filter((text) => text === 'Pas de rappel')).toHaveLength(1)
    },
  )
})

describe('renderCarnetPdf — historique', () => {
  const texts = () =>
    readPdf(
      renderCarnetPdf([{ content: FULL_CONTENT, photoDataUrl: null }], '0.1.24', i18n.global.t),
    ).texts
  const find = (text: string) => texts().find((item) => item.text === text)

  it('liste sous un vaccin toutes ses injections, la plus récente d’abord', () => {
    expect(find('Injections\u00a0: 01/01/2025 · 01/01/2022')).toBeDefined()
  })

  it('met la dernière prise d’un traitement à part, puis chaque période et ses prises regroupées', () => {
    expect(find('Dernière prise\u00a0: 01/06/2026')).toBeDefined()
    expect(find('Depuis le 01/11/2024 · Tous les mois')).toBeDefined()
    expect(find('13 prises du 01/06/2025 au 01/06/2026')).toBeDefined()
    expect(find('Prises\u00a0: 01/12/2024 · 01/11/2024')).toBeDefined()
  })

  it('écrit « Aucune prise » et la prochaine dose sous un traitement sans prise donnée', () => {
    const content: CarnetPdfContent = {
      ...FULL_CONTENT,
      treatments: [{ ...FULL_CONTENT.treatments[0]!, lastDoseDate: null, periods: [] }],
    }
    const written = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    ).texts.map(({ text }) => text)

    expect(written).toContain('Aucune prise · prochaine dose le 01/09/2026')
    expect(written.some((text) => text.startsWith('Dernière prise'))).toBe(false)
  })

  it('écrit l’historique sous sa ligne, en retrait, sans descendre sous 9 pt', () => {
    const traitement = find('Milbémax')!
    const derniere = find('Dernière prise\u00a0: 01/06/2026')!
    const periode = find('Depuis le 01/11/2024 · Tous les mois')!
    const precedentes = texts().find((item) => item.text.startsWith('Prises'))!

    expect(derniere.baseline).toBeGreaterThan(traitement.baseline)
    expect(periode.baseline).toBeGreaterThan(derniere.baseline)
    expect(precedentes.baseline).toBeGreaterThan(periode.baseline)
    expect(derniere.left).toBeGreaterThan(traitement.left)
    expect(periode.left).toBe(derniere.left)
    expect(precedentes.left).toBeGreaterThan(periode.left)
    expect(derniere.sizePt).toBeGreaterThanOrEqual(9)
    expect(find('Traitements')!.baseline).toBeLessThan(traitement.baseline)
    expect(find('Poids')!.baseline).toBeGreaterThan(precedentes.baseline)
  })

  it('coupe à la ligne une longue liste d’injections, dans la largeur de la page', () => {
    const years = Array.from({ length: 30 }, (_, index) => `${2025 - index}-05-20`)
    const content: CarnetPdfContent = {
      ...FULL_CONTENT,
      vaccinations: [{ ...FULL_CONTENT.vaccinations[0]!, injectionDates: years }],
    }
    const all = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    ).texts
    const [vaccin, titre] = ['Rage', 'Traitements'].map((name) =>
      all.find((text) => text.text === name),
    )
    const lignes = all.filter(
      (text) => text.baseline > vaccin!.baseline && text.baseline < titre!.baseline,
    )
    const ecrites = lignes.flatMap((text) => text.text.match(/\d{2}\/\d{2}\/\d{4}/g) ?? [])

    expect(lignes.length).toBeGreaterThan(1)
    expect(ecrites).toHaveLength(30)
    for (const ligne of lignes) expect(textBounds(ligne).right).toBeLessThanOrEqual(192)
  })
})

describe('renderCarnetPdf — courbe de poids', () => {
  afterEach(() => applyWeightUnit('kg'))

  it('le PDF d’un animal à plusieurs pesées contient la courbe sur l’axe du temps', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts, paths } = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    )
    const courbe = paths.find(
      (path) => path.paint === 'S' && path.points.length === PESEES_IRREGULIERES.length,
    )!
    const debut = PESEES_IRREGULIERES[0]!.measuredOn
    const duree = jours(debut, PESEES_IRREGULIERES.at(-1)!.measuredOn)
    const largeur = courbe.points.at(-1)!.x - courbe.points[0]!.x
    const ecrits = texts.map((text) => text.text)

    PESEES_IRREGULIERES.forEach((entry, index) => {
      const attendu = (jours(debut, entry.measuredOn) / duree) * largeur
      expect(courbe.points[index]!.x - courbe.points[0]!.x).toBeCloseTo(attendu, 1)
    })
    expect(ecrits).toEqual(
      expect.arrayContaining(['Oct.', 'Déc.', 'Févr.', 'Avr.', 'Juin', 'Août']),
    )
    expect(ecrits).toEqual(expect.arrayContaining(['max 4,6', 'min 4,1', '4,3\u00a0kg']))
    expect(ecrits).not.toContain('4,5')
  })

  it('écrit la courbe et le tableau des pesées en livres quand c’est l’unité choisie', () => {
    applyWeightUnit('lb')
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }

    const ecrits = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    ).texts.map((text) => text.text)

    expect(ecrits).toEqual(
      expect.arrayContaining(['max 10,1', 'min 9,0', '9,5\u00a0lb', '20/09/2025', '9,3\u00a0lb']),
    )
    expect(ecrits.join(' ')).not.toContain('kg')
  })

  it('garde le tableau des pesées, sans courbe sous deux pesées', () => {
    const content = {
      ...FULL_CONTENT,
      weightEntries: [{ measuredOn: '2026-06-01', weightKg: 4.3 }],
    }
    const { texts, paths } = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    )
    const tracesDeLaCourbe = paths.filter((path) =>
      [path.stroke, path.fill].some((color) => sameColor(color, PRIMARY)),
    )

    expect(tracesDeLaCourbe).toEqual([])
    expect(texts.map((text) => text.text)).toEqual(
      expect.arrayContaining(['01/06/2026', '4,3\u00a0kg']),
    )
  })

  it('commence la courbe sous le titre « Poids » comme la première ligne d’une section', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts, paths } = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    )
    const seule = new jsPDF({ unit: 'mm', format: 'a4' })
    drawWeightChart(seule, PESEES_IRREGULIERES, { x: 18, y: 0, width: 174 }, i18n.global.t)
    const ligneDeBase = (traces: PdfPath[]) =>
      traces.find((path) => path.paint === 'S')!.points[0]!.y
    const hautDeLaCourbe =
      ligneDeBase(paths) - ligneDeBase(readPdf(new Uint8Array(seule.output('arraybuffer'))).paths)
    const baseline = (text: string) => texts.find((item) => item.text === text)!.baseline

    expect(hautDeLaCourbe - baseline('Poids')).toBeCloseTo(
      baseline('Rage') - baseline('Vaccins'),
      2,
    )
  })

  it('écrit les pesées sous la courbe, du même style que les autres lignes du carnet', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts, paths } = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    )
    const style = ({ bold, sizePt, color }: PdfText) => ({ bold, sizePt, color })
    const vaccin = texts.find((text) => text.text === 'Rage')!
    const titre = texts.findIndex((text) => text.text === 'Poids')
    const premiere = texts.findIndex((text) => text.text === '20/09/2025')
    const textesDeLaCourbe = texts.slice(titre + 1, premiere)
    const basDeLaCourbe = Math.max(
      ...textesDeLaCourbe.map((text) => text.baseline + DESCENT_EM * text.sizePt * MM_PER_PT),
      ...paths.flatMap((path) => path.points.map((point) => point.y)),
    )
    const ligne = texts[premiere]!

    expect(textesDeLaCourbe.length).toBeGreaterThan(0)
    expect(style(ligne)).toEqual(style(vaccin))
    expect(style(texts[premiere + 1]!)).toEqual(style(vaccin))
    expect(ligne.baseline - ASCENT_EM * ligne.sizePt * MM_PER_PT).toBeGreaterThan(basDeLaCourbe)
  })

  it('n’écrit aucun texte sous 9 pt, tableau des pesées compris', () => {
    const content = { ...FULL_CONTENT, weightEntries: PESEES_IRREGULIERES }
    const { texts } = readPdf(
      renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.24', i18n.global.t),
    )

    for (const text of texts) expect(text.sizePt).toBeGreaterThanOrEqual(9)
  })
})
