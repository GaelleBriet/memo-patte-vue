import { jsPDF } from 'jspdf'
import { afterEach, describe, expect, it } from 'vitest'

import { drawWeightChart } from '../logic/pdf-weight-chart'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { PHOTO_JPEG } from './pdf-fixture'
import { readPdf, sameColor, textBounds, type PdfPath, type PdfText } from './pdf-reader'
import type { CarnetPdfContent } from '../logic/pdf-content'
import vuetify from '@/core/theme/vuetify'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'

const MM_PER_PT = 25.4 / 72
const ASCENT_EM = 0.75
const DESCENT_EM = 0.22
const PRIMARY = String(vuetify.theme.themes.value.light!.colors.primary).toUpperCase()

const EMPTY_CONTENT: CarnetPdfContent = {
  animal: { name: 'Milo', species: 'dog', breed: null, birthDate: null, photoFileName: null },
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
      previousDoses: [
        { kind: 'range', count: 12, from: '2025-06-01', to: '2026-05-01' },
        { kind: 'dates', dates: ['2024-12-01', '2024-11-01'] },
      ],
      nextDueDate: '2026-09-01',
      stoppedOn: null,
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
    const bytes = renderCarnetPdf(EMPTY_CONTENT, '0.1.24', null)
    expect(bytes).toBeInstanceOf(Uint8Array)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('rend un document avec rappels, traitement, tableau et courbe de poids ensemble', () => {
    const bytes = renderCarnetPdf(FULL_CONTENT, '0.1.24', null)
    expect(bytes.length).toBeGreaterThan(0)
  })

  it('dessine la photo quand elle est fournie', () => {
    const withoutPhoto = renderCarnetPdf(FULL_CONTENT, '0.1.24', null)
    const withPhoto = renderCarnetPdf(FULL_CONTENT, '0.1.24', PHOTO_JPEG)
    expect(withPhoto.length).toBeGreaterThan(withoutPhoto.length)
  })

  it("n'échoue pas si la photo est illisible", () => {
    expect(() =>
      renderCarnetPdf(FULL_CONTENT, '0.1.24', 'data:image/jpeg;base64,invalide'),
    ).not.toThrow()
  })
})

describe('renderCarnetPdf — historique', () => {
  const texts = () => readPdf(renderCarnetPdf(FULL_CONTENT, '0.1.24', null)).texts
  const find = (text: string) => texts().find((item) => item.text === text)

  it('liste sous un vaccin toutes ses injections, la plus récente d’abord', () => {
    expect(find('Injections\u00a0: 01/01/2025 · 01/01/2022')).toBeDefined()
  })

  it('met la dernière prise d’un traitement à part, puis ses prises précédentes regroupées', () => {
    expect(find('Dernière prise\u00a0: 01/06/2026')).toBeDefined()
    expect(
      find(
        'Prises précédentes\u00a0: 12 prises du 01/06/2025 au 01/05/2026 · 01/12/2024 · 01/11/2024',
      ),
    ).toBeDefined()
  })

  it('écrit l’historique sous sa ligne, en retrait, sans descendre sous 9 pt', () => {
    const traitement = find('Milbémax')!
    const derniere = find('Dernière prise\u00a0: 01/06/2026')!
    const precedentes = texts().find((item) => item.text.startsWith('Prises précédentes'))!

    expect(derniere.baseline).toBeGreaterThan(traitement.baseline)
    expect(precedentes.baseline).toBeGreaterThan(derniere.baseline)
    expect(derniere.left).toBeGreaterThan(traitement.left)
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
    const all = readPdf(renderCarnetPdf(content, '0.1.24', null)).texts
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
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))
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

    const ecrits = readPdf(renderCarnetPdf(content, '0.1.24', null)).texts.map((text) => text.text)

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
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))
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
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))
    const seule = new jsPDF({ unit: 'mm', format: 'a4' })
    drawWeightChart(seule, PESEES_IRREGULIERES, { x: 18, y: 0, width: 174 })
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
    const { texts, paths } = readPdf(renderCarnetPdf(content, '0.1.24', null))
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
    const { texts } = readPdf(renderCarnetPdf(content, '0.1.24', null))

    for (const text of texts) expect(text.sizePt).toBeGreaterThanOrEqual(9)
  })
})
