import { afterEach, describe, expect, it } from 'vitest'

import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import {
  MOT_80,
  NOM_ANIMAL_200,
  NOM_TRAITEMENT_200,
  NOM_VACCIN_200,
  PHOTO_JPEG,
  RACE_120,
} from './pdf-fixture'
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
import i18n from '@/core/i18n'

// A4 : les marges latérales du carnet, et 10 mm en haut et en bas, loin de la marge non imprimable.
const ZONE: PdfBounds = { left: 18, right: 192, top: 10, bottom: 287 }
const FOOTER = 'Généré le 15 sept. 2026 — MémoPatte 0.1.24'
const SECTION_TITLES = ['Vaccins', 'Traitements', 'Poids']
const ETATS = ['À jour', 'En retard', 'Pas de rappel']
// La mise en page laisse au moins 5,7 mm sous l'en-tête (un titre de section) et 4,6 mm sur le pied.
const ECART_SOUS_EN_TETE = 5
const ECART_SUR_PIED = 4

function vaccins(count: number): PdfVaccinationRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Vaccin ${index + 1}`,
    lastInjectionDate: '2025-09-01',
    dueDate: '2026-09-01',
    state: 'upToDate',
  }))
}

function traitements(count: number): PdfTreatmentRow[] {
  return Array.from({ length: count }, (_, index) => ({
    name: `Traitement ${index + 1}`,
    lastDoseDate: '2026-08-01',
    nextDueDate: '2026-11-01',
    stoppedOn: null,
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

const VACCIN_LONG: PdfVaccinationRow = {
  name: NOM_VACCIN_200,
  lastInjectionDate: '2025-09-01',
  dueDate: '2026-09-01',
  state: 'upToDate',
}

const TRAITEMENT_LONG: PdfTreatmentRow = {
  name: NOM_TRAITEMENT_200,
  lastDoseDate: '2026-08-01',
  nextDueDate: '2026-11-01',
  stoppedOn: null,
  state: 'upToDate',
}

const ARRETE: PdfTreatmentRow = {
  name: 'Drontal',
  lastDoseDate: '2026-06-01',
  nextDueDate: null,
  stoppedOn: '2026-06-20',
  state: 'none',
}

function avec(rows: Partial<CarnetPdfContent>): CarnetPdfContent {
  return { ...carnet(0, 0, 0), ...rows }
}

function carnetAuxNomsLongs(count: number): CarnetPdfContent {
  const court = carnet(count, 0, 0)
  return {
    ...court,
    animal: { ...court.animal, name: NOM_ANIMAL_200, breed: RACE_120 },
    vaccinations: [...court.vaccinations, VACCIN_LONG, VACCIN_LONG, VACCIN_LONG],
    treatments: [TRAITEMENT_LONG, ARRETE, TRAITEMENT_LONG],
  }
}

const COURT = carnet(2, 1, 6)
const LONG = carnet(25, 20, 40)
const DEBORDEMENTS = Array.from({ length: 46 }, (_, count) => carnet(count, 3, 8))
const NOMS_LONGS = Array.from({ length: 40 }, (_, count) => carnetAuxNomsLongs(count))
const MOT_SANS_ESPACE = avec({
  animal: { ...LONG.animal, name: MOT_80 },
  vaccinations: [{ ...VACCIN_LONG, name: MOT_80 }, ...vaccins(40)],
  treatments: [{ ...TRAITEMENT_LONG, name: MOT_80 }],
})

function pages(content: CarnetPdfContent): PdfPage[] {
  return readPdfPages(renderCarnetPdf(content, '0.1.24', null))
}

function dansLePied(text: PdfText): boolean {
  return text.text === FOOTER || /^\d+ \/ \d+$/.test(text.text)
}

function enTeteDeSuite(page: PdfPage): PdfText[] {
  return page.texts.filter((text) => text.bold && text.sizePt === 11)
}

function colonneDesNoms(page: PdfPage): PdfText[] {
  return page.texts.filter(
    (text) =>
      Math.abs(text.left - ZONE.left) < 0.01 &&
      !text.bold &&
      text.sizePt === 10.5 &&
      text.color === '#000000',
  )
}

function lignesDuTableau(doc: PdfPage[]): string[][] {
  const lignes: string[][] = []
  for (const page of doc) {
    const noms = colonneDesNoms(page)
    const cellules = page.texts
      .filter((text) => noms.includes(text) || ETATS.includes(text.text))
      .sort((a, b) => a.baseline - b.baseline || b.left - a.left)
    let courante: string[] | null = null
    for (const cellule of cellules) {
      if (ETATS.includes(cellule.text)) {
        courante = []
        lignes.push(courante)
      } else if (courante) {
        courante.push(cellule.text)
      } else {
        lignes.push([`orpheline : ${cellule.text}`])
      }
    }
  }
  return lignes
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

    expect(doc).toHaveLength(3)
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
    expect(suivantes).toHaveLength(2)
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
    for (const content of [COURT, LONG, ...DEBORDEMENTS, ...NOMS_LONGS, MOT_SANS_ESPACE]) {
      pages(content).forEach((page, index) => {
        const lieu = `${content.vaccinations.length} vaccins, page ${index + 1}`
        const pied = hautDuPied(page)
        const enTete = index > 0 ? enTeteDeSuite(page) : []
        if (index > 0 && enTete.length === 0) defauts.push(`pas d’en-tête, ${lieu}`)
        const basDeLEnTete = Math.max(-Infinity, ...enTete.map((text) => textBounds(text).bottom))
        const elements = [
          ...page.texts.map((text) => ({
            nom: text.text,
            box: textBounds(text),
            cadre: dansLePied(text) || enTete.includes(text),
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

  it('ne laisse jamais un titre de section seul en bas de page', () => {
    const defauts: string[] = []
    for (const content of [...DEBORDEMENTS, ...NOMS_LONGS]) {
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

describe('renderCarnetPdf — noms longs', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it.each([
    { quoi: 'vaccin', content: avec({ vaccinations: [VACCIN_LONG] }), nom: NOM_VACCIN_200 },
    {
      quoi: 'traitement',
      content: avec({ treatments: [TRAITEMENT_LONG] }),
      nom: NOM_TRAITEMENT_200,
    },
  ])('coupe à la ligne un nom de $quoi de 200 caractères, dans sa colonne', ({ content, nom }) => {
    const [page, ...suite] = pages(content)
    const lignes = colonneDesNoms(page!)
    const echeance = page!.texts.find((text) => /^\d{2}\/\d{2}\/\d{4}$/.test(text.text))!

    expect(suite).toEqual([])
    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes.map((text) => text.text).join(' ')).toBe(nom)
    expect(lignes[0]!.baseline).toBe(echeance.baseline)
    for (const ligne of lignes) expect(textBounds(ligne).right).toBeLessThan(echeance.left)
  })

  it('coupe un mot sans espace plus long que la colonne', () => {
    const [page] = pages(avec({ vaccinations: [{ ...VACCIN_LONG, name: MOT_80 }] }))
    const lignes = colonneDesNoms(page!)
    const echeance = page!.texts.find((text) => text.text === '01/09/2026')!

    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes.map((text) => text.text).join('')).toBe(MOT_80)
    for (const ligne of lignes) expect(textBounds(ligne).right).toBeLessThan(echeance.left)
  })

  it('coupe à la ligne un nom d’animal de 200 caractères, à côté de la photo', () => {
    const content = { ...COURT, animal: { ...COURT.animal, name: NOM_ANIMAL_200 } }
    const [page] = readPdfPages(renderCarnetPdf(content, '0.1.24', PHOTO_JPEG))
    const [photo] = page!.images
    const lignes = page!.texts.filter((text) => text.bold && text.sizePt === 15)
    const identite = page!.texts.find((text) => text.text.startsWith('Chat · '))!

    expect(photo).toBeDefined()
    expect(hors(photo!, ZONE)).toBe(false)
    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes.map((text) => text.text).join(' ')).toBe(NOM_ANIMAL_200)
    for (const ligne of lignes) expect(textBounds(ligne).right).toBeLessThan(photo!.left)
    expect(textBounds(identite).top).toBeGreaterThan(
      Math.max(...lignes.map((ligne) => textBounds(ligne).bottom)),
    )
  })

  it.each([
    { cas: 'avec photo', photo: PHOTO_JPEG },
    { cas: 'sans photo', photo: null },
  ])('coupe à la ligne une identité à race de 120 caractères, $cas', ({ photo }) => {
    const identiteCourte = pages(COURT)[0]!.texts.find((text) => text.text.startsWith('Chat · '))!
    const content = { ...COURT, animal: { ...COURT.animal, breed: RACE_120 } }
    const [page] = readPdfPages(renderCarnetPdf(content, '0.1.24', photo))
    const lignes = page!.texts.filter((text) => text.sizePt === 11 && !text.bold)
    const titre = page!.texts.find((text) => text.text === 'Vaccins')!
    const limite = page!.images[0]?.left ?? ZONE.right

    expect(page!.images).toHaveLength(photo ? 1 : 0)
    expect(lignes.length).toBeGreaterThan(1)
    expect(lignes.map((text) => text.text).join(' ')).toBe(
      identiteCourte.text.replace('Européen', RACE_120),
    )
    for (const ligne of lignes) {
      expect(hors(textBounds(ligne), ZONE)).toBe(false)
      expect(textBounds(ligne).right).toBeLessThanOrEqual(limite)
    }
    expect(textBounds(titre).top).toBeGreaterThan(
      Math.max(...lignes.map((ligne) => textBounds(ligne).bottom)),
    )
  })

  it('reprend un nom d’animal long, coupé à la ligne, en tête des pages suivantes', () => {
    const [, ...suivantes] = pages({ ...LONG, animal: { ...LONG.animal, name: NOM_ANIMAL_200 } })

    expect(suivantes.length).toBeGreaterThan(0)
    for (const page of suivantes) {
      const enTete = enTeteDeSuite(page)
      expect(enTete.length).toBeGreaterThan(1)
      expect(enTete.map((text) => text.text).join(' ')).toBe(NOM_ANIMAL_200)
    }
  })

  it('garde d’un seul tenant, au saut de page, une ligne de tableau sur plusieurs lignes', () => {
    const court = pages(COURT)[0]!.texts
    const baseline = (nom: string) => court.find((text) => text.text === nom)!.baseline
    const interligne = baseline('Vaccin 2') - baseline('Vaccin 1')
    let reportees = 0
    for (const content of NOMS_LONGS) {
      const doc = pages(content)
      const attendues = [...content.vaccinations, ...content.treatments].map((row) => row.name)

      expect(lignesDuTableau(doc).map((ligne) => ligne.join(' '))).toEqual(attendues)
      doc.slice(0, -1).forEach((page, index) => {
        const [premiere] = lignesDuTableau([doc[index + 1]!])
        const bas = Math.max(
          ...page.texts.filter((text) => !dansLePied(text)).map((text) => textBounds(text).bottom),
        )
        const place = hautDuPied(page) - ECART_SUR_PIED - bas
        if (premiere && premiere.length > 1 && place > 2 * interligne) reportees += 1
      })
    }

    expect(reportees).toBeGreaterThan(0)
  })

  it.each([
    { langue: 'fr', echeance: 'Arrêté le 20/06/2026', etat: 'Pas de rappel' },
    { langue: 'en', echeance: 'Stopped on 06/20/2026', etat: 'No reminder' },
  ] as const)(
    'traitement arrêté ($langue) : $echeance dans l’échéance, $etat dans l’état seulement',
    ({ langue, echeance, etat }) => {
      i18n.global.locale.value = langue
      const { texts } = pages(avec({ treatments: [ARRETE] }))[0]!
      const nom = texts.find((text) => text.text === 'Drontal')!
      const [, date, statut] = texts.filter((text) => text.baseline === nom.baseline)

      expect(
        texts
          .filter((text) => text.left === date!.left)
          .map((text) => text.text)
          .join(' '),
      ).toBe(echeance)
      expect(statut!.text).toBe(etat)
      expect(texts.filter((text) => text.text === etat)).toHaveLength(1)
    },
  )
})
