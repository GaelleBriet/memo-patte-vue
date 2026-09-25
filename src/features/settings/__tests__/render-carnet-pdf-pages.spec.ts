import { describe, expect, it } from 'vitest'

import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import {
  pathBounds,
  readPdfPages,
  textBounds,
  type PdfBounds,
  type PdfPage,
  type PdfText,
} from './pdf-reader'
import type {
  CarnetPdfContent,
  PdfTreatmentRow,
  PdfVaccinationRow,
  PdfWeightRow,
} from '../logic/pdf-content'

// A4 : les marges latérales du carnet, et 10 mm en haut et en bas, loin de la marge non imprimable.
const ZONE: PdfBounds = { left: 18, right: 192, top: 10, bottom: 287 }
const FOOTER = 'Généré le 15 sept. 2026 — MémoPatte 0.1.24'
const SECTION_TITLES = ['Vaccins', 'Traitements', 'Poids']
// La mise en page laisse au moins 5,7 mm sous l'en-tête (un titre de section) et 4,6 mm sur le pied.
const ECART_SOUS_EN_TETE = 5
const ECART_SUR_PIED = 4

function vaccins(count: number): PdfVaccinationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Vaccin ${index + 1}`,
    lastInjectionDate: '2025-09-01',
    injectionDates: ['2025-09-01'],
    dueDate: '2026-09-01',
    state: 'upToDate',
  }))
}

function traitements(count: number): PdfTreatmentRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Traitement ${index + 1}`,
    lastDoseDate: '2026-08-01',
    previousDoses: [{ kind: 'range', count: 6, from: '2025-08-01', to: '2026-05-01' }],
    nextDueDate: '2026-11-01',
    state: 'upToDate',
  }))
}

function pesees(count: number): PdfWeightRow[] {
  return Array.from({ length: count }, (_, index) => ({
    measuredOn: new Date(Date.UTC(2024, 0, 7 + 7 * index)).toISOString().slice(0, 10),
    weightKg: 4 + (index % 5) / 10,
  }))
}

function carnet(vaccinCount: number, treatmentCount: number, weighInCount: number) {
  return {
    animal: {
      name: 'Luna',
      species: 'cat',
      breed: 'Européen',
      birthDate: '2019-03-02',
      photoFileName: null,
    },
    generatedOn: '2026-09-15',
    vaccinations: vaccins(vaccinCount),
    treatments: traitements(treatmentCount),
    weightEntries: pesees(weighInCount),
  } satisfies CarnetPdfContent
}

const COURT = carnet(2, 1, 6)
const LONG = carnet(25, 20, 40)
const DEBORDEMENTS = Array.from({ length: 46 }, (_, count) => carnet(count, 3, 8))

function pages(content: CarnetPdfContent): PdfPage[] {
  return readPdfPages(renderCarnetPdf(content, '0.1.24', null))
}

function dansLePied(text: PdfText): boolean {
  return text.text === FOOTER || /^\d+ \/ \d+$/.test(text.text)
}

function hautDuPied(page: PdfPage): number {
  return Math.min(...page.texts.filter(dansLePied).map((text) => textBounds(text).top))
}

function hors(box: PdfBounds, zone: PdfBounds): boolean {
  return (
    box.left < zone.left || box.right > zone.right || box.top < zone.top || box.bottom > zone.bottom
  )
}

function dateNumerique(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}

describe('renderCarnetPdf — pages', () => {
  it('tient un carnet court sur une seule page, numérotée « 1 / 1 »', () => {
    const doc = pages(COURT)
    const texts = doc[0]!.texts.map((text) => text.text)

    expect(doc).toHaveLength(1)
    expect(texts).toEqual(expect.arrayContaining(['1 / 1', FOOTER, 'Vaccin 2', 'Traitement 1']))
  })

  it('continue un carnet long sur de nouvelles pages, sans perdre ni répéter une ligne', () => {
    const doc = pages(LONG)
    const lignes = [
      ...LONG.vaccinations.map((row) => row.name),
      ...LONG.treatments.map((row) => row.name),
      ...LONG.weightEntries.map((entry) => dateNumerique(entry.measuredOn)),
    ]
    const ecrites = doc.flatMap((page) => page.texts.map((text) => text.text))

    expect(doc).toHaveLength(4)
    expect(ecrites.filter((text) => lignes.includes(text))).toEqual(lignes)
  })

  it('écrit le pied de page sur chaque page : date de génération et numéro « n / total »', () => {
    const doc = pages(LONG)

    doc.forEach((page, index) => {
      const numero = page.texts.find((text) => text.text === `${index + 1} / ${doc.length}`)!
      const pied = page.texts.find((text) => text.text === FOOTER)!

      expect(numero).toBeDefined()
      expect(pied).toBeDefined()
      expect(numero.baseline).toBe(pied.baseline)
      expect(pied.left).toBeCloseTo(ZONE.left, 1)
      expect(textBounds(numero).right).toBeCloseTo(ZONE.right, 1)
    })
  })

  it('reprend le nom de l’animal en tête de chaque page suivante', () => {
    const [premiere, ...suivantes] = pages(LONG)
    const enTete = (page: PdfPage) =>
      page.texts.reduce((haut, text) => (text.baseline < haut.baseline ? text : haut))

    expect(enTete(premiere!).text).toBe('MémoPatte')
    expect(suivantes).toHaveLength(3)
    for (const page of suivantes) {
      expect(enTete(page)).toMatchObject({ text: 'Luna', bold: true })
    }
  })

  it('écrit les lignes des pages suivantes du même style que celles de la première', () => {
    const [premiere, ...suivantes] = pages(LONG)
    const style = ({ bold, sizePt, color }: PdfText) => ({ bold, sizePt, color })
    const cellule = (text: PdfText) =>
      /^(Vaccin \d+|Traitement \d+|\d{2}\/\d{2}\/\d{4}|\d+,\d kg|À jour)$/.test(text.text)
    const reference = style(premiere!.texts.find((text) => text.text === 'Vaccin 1')!)
    const lignes = suivantes.flatMap((page) => page.texts.filter(cellule))

    expect(lignes.length).toBeGreaterThan(0)
    expect(lignes.map(style)).toEqual(lignes.map(() => reference))
  })

  it('n’écrit ni ne dessine rien hors de la zone imprimable, ni contre l’en-tête ou le pied', () => {
    const defauts: string[] = []
    for (const content of [COURT, LONG, ...DEBORDEMENTS]) {
      pages(content).forEach((page, index) => {
        const lieu = `${content.vaccinations.length} vaccins, page ${index + 1}`
        const pied = hautDuPied(page)
        const enTete =
          index > 0 ? page.texts.find((text) => text.text === content.animal.name) : undefined
        if (index > 0 && !enTete) defauts.push(`pas d’en-tête, ${lieu}`)
        const basDeLEnTete = enTete ? textBounds(enTete).bottom : -Infinity
        const elements = [
          ...page.texts.map((text) => ({
            nom: text.text,
            box: textBounds(text),
            cadre: dansLePied(text) || text === enTete,
          })),
          ...page.paths.map((path) => ({
            nom: `tracé ${path.paint}`,
            box: pathBounds(path),
            cadre: false,
          })),
        ]
        for (const { nom, box, cadre } of elements) {
          if (hors(box, ZONE)) defauts.push(`${nom} hors de la zone, ${lieu}`)
          if (cadre) continue
          if (box.top - basDeLEnTete < ECART_SOUS_EN_TETE) {
            defauts.push(`${nom} contre l’en-tête, ${lieu}`)
          }
          if (pied - box.bottom < ECART_SUR_PIED) defauts.push(`${nom} contre le pied, ${lieu}`)
        }
      })
    }

    expect(defauts).toEqual([])
  })

  it('ne coupe jamais la courbe : elle passe entière à la page suivante, avec son titre', () => {
    let reportees = 0
    for (const content of DEBORDEMENTS) {
      const doc = pages(content)
      const avecCourbe = doc.filter((page) => page.paths.length > 0)
      const page = avecCourbe[0]!
      const courbe = page.paths.map(pathBounds)
      const titre = page.texts.find((text) => text.text === 'Poids')

      expect(avecCourbe).toHaveLength(1)
      expect(titre!.baseline).toBeLessThan(Math.min(...courbe.map((box) => box.top)))
      expect(Math.max(...courbe.map((box) => box.bottom))).toBeLessThan(hautDuPied(page))
      const precedente = doc[doc.indexOf(page) - 1]
      if (precedente?.texts.some((text) => text.text === 'Traitement 3')) reportees += 1
    }

    expect(reportees).toBeGreaterThan(0)
  })

  it('ne coupe jamais une ligne de tableau : nom, échéance et état sur la même page', () => {
    const doc = pages(LONG)
    const cellules = (nom: string) => [
      nom,
      nom.startsWith('Vaccin') ? '01/09/2026' : '01/11/2026',
      'À jour',
    ]
    const pagesDesTraitements = doc.filter((page) =>
      page.texts.some((text) => text.text.startsWith('Traitement ')),
    )

    expect(pagesDesTraitements).toHaveLength(2)
    for (const page of doc) {
      for (const nom of page.texts.filter((text) => /^(Vaccin|Traitement) \d+$/.test(text.text))) {
        const ligne = page.texts.filter((text) => text.baseline === nom.baseline)
        expect(ligne.map((text) => text.text)).toEqual(cellules(nom.text))
      }
    }
  })

  it('garde un vaccin ou un traitement et son historique sur la même page', () => {
    for (const content of [LONG, ...DEBORDEMENTS]) {
      for (const page of pages(content)) {
        const nombre = (pattern: RegExp) =>
          page.texts.filter((text) => pattern.test(text.text)).length

        expect(nombre(/^Injections/)).toBe(nombre(/^Vaccin \d+$/))
        expect(nombre(/^Dernière prise/)).toBe(nombre(/^Traitement \d+$/))
        expect(nombre(/^Prises précédentes/)).toBe(nombre(/^Traitement \d+$/))
      }
    }
  })

  it('ne laisse jamais un titre de section seul en bas de page', () => {
    const defauts: string[] = []
    for (const content of DEBORDEMENTS) {
      pages(content).forEach((page, index) => {
        for (const titre of page.texts.filter((text) => SECTION_TITLES.includes(text.text))) {
          const visible = (box: PdfBounds) =>
            box.top > titre.baseline && box.bottom < hautDuPied(page)
          const suite =
            page.texts.some((text) => !dansLePied(text) && visible(textBounds(text))) ||
            page.paths.some((path) => visible(pathBounds(path)))
          if (!suite) {
            defauts.push(
              `${titre.text} seul, ${content.vaccinations.length} vaccins, p. ${index + 1}`,
            )
          }
        }
      })
    }

    expect(defauts).toEqual([])
  })
})
