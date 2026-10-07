import { afterEach, describe, expect, it } from 'vitest'

import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { readPdfPages, textBounds } from './pdf-reader'
import type {
  CarnetPdfContent,
  PdfHistoryLine,
  PdfTreatmentPeriod,
  PdfTreatmentRow,
} from '../logic/pdf-content'
import i18n from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const ANIMAL: CarnetPdfContent['animal'] = {
  name: 'Milo',
  species: 'dog',
  breed: 'Labrador',
  birthDate: '2019-03-02',
  birthDateApproximate: false,
  departureDate: null,
  photoFileName: null,
}

function carnet(fields: Partial<CarnetPdfContent>): CarnetPdfContent {
  return {
    animal: ANIMAL,
    generatedOn: '2026-09-15',
    vaccinations: [],
    treatments: [],
    weightEntries: [],
    ...fields,
  }
}

function textes(content: CarnetPdfContent): string[] {
  return readPdfPages(renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.62')).flatMap(
    (page) => page.texts.map((text) => plain(text.text)),
  )
}

function dose(on: string, time: string | null = null) {
  return { on, time, extra: false }
}

function periode(fields: Partial<PdfTreatmentPeriod>): PdfTreatmentPeriod {
  return {
    from: '2026-09-01',
    to: '2026-09-30',
    frequency: { value: 1, unit: 'day' },
    times: ['08:00', '20:00'],
    dosage: { doseQuantity: 0.5, doseUnit: 'tablet' },
    lines: [],
    ...fields,
  }
}

function traitement(fields: Partial<PdfTreatmentRow>): PdfTreatmentRow {
  return {
    name: 'Amoxicilline',
    lastDoseDate: '2026-09-12',
    lastDoseExtra: false,
    periods: [],
    due: { kind: 'due', dueOn: '2026-09-15', dueTime: '08:00', overdue: false },
    state: 'upToDate',
    ...fields,
  }
}

const LIGNES: PdfHistoryLine[] = [
  {
    kind: 'given',
    series: { kind: 'range', count: 6, from: '2026-09-10', to: '2026-09-12', time: null },
  },
  {
    kind: 'given',
    series: { kind: 'range', count: 5, from: '2026-09-03', to: '2026-09-07', time: '08:00' },
  },
  { kind: 'unlogged', from: '2026-09-03', to: '2026-09-09', time: null },
  { kind: 'unlogged', from: '2026-09-03', to: '2026-09-07', time: '20:00' },
  { kind: 'unlogged', from: '2026-09-02', to: '2026-09-02', time: null },
  { kind: 'missed', series: { kind: 'dates', doses: [dose('2026-09-01', '20:00')] } },
  {
    kind: 'missed',
    series: { kind: 'dates', doses: [dose('2026-08-31', '20:00'), dose('2026-08-31', '08:00')] },
  },
  {
    kind: 'missed',
    series: { kind: 'range', count: 4, from: '2026-08-20', to: '2026-08-21', time: null },
  },
  { kind: 'moved', dueOn: '2026-08-15', to: '2026-08-18', advanced: false },
  { kind: 'moved', dueOn: '2026-08-10', to: '2026-08-08', advanced: true },
  { kind: 'given', series: { kind: 'dates', doses: [dose('2026-09-01', '08:00')] } },
]

describe('renderCarnetPdf — identité', () => {
  it('écrit la date de naissance et l’âge', () => {
    expect(textes(carnet({}))).toContain(
      'Chien · Labrador · Date de naissance : 2 mars 2019 · 7 ans',
    )
  })

  it('écrit « environ » devant une date approximative et son âge', () => {
    const animal = { ...ANIMAL, birthDate: '2026-07-07', birthDateApproximate: true }

    expect(textes(carnet({ animal }))).toContain(
      'Chien · Labrador · Date de naissance : environ 7 juil. 2026 · environ 10 semaines',
    )
  })

  it('écrit « jusqu’au … » pour un animal qu’on ne suit plus, sans âge', () => {
    const animal = { ...ANIMAL, departureDate: '2026-09-12' }

    expect(textes(carnet({ animal }))).toContain(
      'Chien · Labrador · Date de naissance : 2 mars 2019 · jusqu’au 12 sept. 2026',
    )
  })
})

describe('renderCarnetPdf — vaccin prévu', () => {
  it('écrit « Prévu le … », sans ligne d’injections', () => {
    const ecrits = textes(
      carnet({
        vaccinations: [
          {
            name: 'CHPPiL',
            lastInjectionDate: null,
            injectionDates: [],
            dueDate: '2026-10-05',
            state: 'planned',
          },
        ],
      }),
    )

    expect(ecrits).toContain('Prévu le 5 oct.')
    expect(ecrits).toContain('05/10/2026')
    expect(ecrits.some((texte) => texte.startsWith('Injections'))).toBe(false)
  })
})

describe('renderCarnetPdf — historique d’un traitement', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  const CONTENT = carnet({
    treatments: [traitement({ periods: [periode({ lines: LIGNES })] })],
  })

  it('écrit la période, sa fréquence, ses heures et sa posologie, puis chaque ligne à sa place', () => {
    const ecrits = textes(CONTENT)
    const debut = ecrits.indexOf('Dernière prise : 12/09/2026')

    expect(ecrits.slice(debut, debut + 13)).toEqual([
      'Dernière prise : 12/09/2026',
      'Du 01/09/2026 au 30/09/2026 · Tous les jours · 8 h et 20 h · ½ comprimé',
      '6 prises du 10/09/2026 au 12/09/2026',
      '5 prises du 03/09/2026 au 07/09/2026 · 8 h',
      'Non renseigné du 03/09/2026 au 09/09/2026',
      'Non renseigné du 03/09/2026 au 07/09/2026 · 20 h',
      'Non renseigné le 02/09/2026',
      'Oubliée : 01/09/2026 à 20 h',
      'Oubliées : 31/08/2026 à 20 h · 31/08/2026 à 8 h',
      '4 prises oubliées du 20/08/2026 au 21/08/2026',
      'Reportée au 18/08/2026 (prévue le 15/08/2026)',
      'Avancée au 08/08/2026 (prévue le 10/08/2026)',
      'Prise : 01/09/2026 à 8 h',
    ])
  })

  it('écrit l’historique en anglais selon le glossaire', () => {
    i18n.global.locale.value = 'en'
    const ecrits = textes(CONTENT)

    expect(ecrits).toEqual(
      expect.arrayContaining([
        'Last dose: 09/12/2026',
        '09/01/2026 – 09/30/2026 · Every day · 8 am and 8 pm · ½ tablet',
        '6 doses from 09/10/2026 to 09/12/2026',
        '5 doses from 09/03/2026 to 09/07/2026 · 8 am',
        'Not logged from 09/03/2026 to 09/09/2026',
        'Not logged from 09/03/2026 to 09/07/2026 · 8 pm',
        'Not logged on 09/02/2026',
        'Missed: 09/01/2026 at 8 pm',
        '4 doses missed from 08/20/2026 to 08/21/2026',
        'Postponed to 08/18/2026 (was due 08/15/2026)',
        'Moved up to 08/08/2026 (was due 08/10/2026)',
        'Dose: 09/01/2026 at 8 am',
      ]),
    )
  })

  it('écrit une période ouverte « Depuis le … », sans heure ni posologie quand il n’y en a pas', () => {
    const ecrits = textes(
      carnet({
        treatments: [
          traitement({
            periods: [
              periode({
                to: null,
                frequency: { value: 3, unit: 'month' },
                times: [],
                dosage: { doseQuantity: null, doseUnit: null },
              }),
            ],
          }),
        ],
      }),
    )

    expect(ecrits).toContain('Depuis le 01/09/2026 · Tous les 3 mois')
  })

  it('écrit une période d’un seul jour « Le … »', () => {
    const ecrits = textes(
      carnet({
        treatments: [
          traitement({
            periods: [
              periode({
                to: '2026-09-01',
                times: [],
                dosage: { doseQuantity: null, doseUnit: null },
              }),
            ],
          }),
        ],
      }),
    )

    expect(ecrits).toContain('Le 01/09/2026 · Tous les jours')
  })

  it('garde « Donnée illisible » pour un traitement que le moteur ne sait pas lire', () => {
    const ecrits = textes(
      carnet({ treatments: [traitement({ due: { kind: 'unreadable' }, state: 'none' })] }),
    )

    expect(ecrits).toContain('Donnée illisible')
  })

  it('continue sur la page suivante un historique trop long pour une page, sans rien perdre', () => {
    const lignes: PdfHistoryLine[] = Array.from({ length: 80 }, (_, index) => ({
      kind: 'unlogged',
      from: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      to: `2025-02-${String((index % 28) + 1).padStart(2, '0')}`,
      time: null,
    }))
    const content = carnet({
      treatments: [traitement({ periods: [periode({ lines: lignes })] })],
    })
    const pages = readPdfPages(renderCarnetPdf([{ content, photoDataUrl: null }], '0.1.62'))
    const ecrites = pages.flatMap((page) =>
      page.texts.filter((text) => text.text.startsWith('Non renseigné')),
    )

    const [nom, premiere] = pages[1]!.texts

    expect(pages.length).toBeGreaterThan(1)
    expect(ecrites).toHaveLength(80)
    for (const texte of ecrites) expect(textBounds(texte).bottom).toBeLessThanOrEqual(279)
    expect(nom!.text).toBe('Milo')
    expect(premiere!.text).toMatch(/^Non renseigné/)
    expect(premiere!.baseline).toBeCloseTo(nom!.baseline + 10, 0)
  })
})

describe('renderCarnetPdf — animal qu’on ne suit plus', () => {
  it('n’écrit aucun statut, ni pour ses vaccins ni pour ses traitements', () => {
    const ecrits = textes(
      carnet({
        animal: { ...ANIMAL, departureDate: '2026-09-12' },
        vaccinations: [
          {
            name: 'CHPPiL',
            lastInjectionDate: null,
            injectionDates: [],
            dueDate: '2026-10-05',
            state: null,
          },
          {
            name: 'Rage',
            lastInjectionDate: '2025-01-01',
            injectionDates: ['2025-01-01'],
            dueDate: '2026-01-01',
            state: null,
          },
        ],
        treatments: [traitement({ state: null })],
      }),
    )

    expect(ecrits).toEqual(expect.arrayContaining(['CHPPiL', 'Rage', 'Amoxicilline']))
    for (const statut of ['Prévu le 5 oct.', 'En retard', 'À jour', 'Pas de rappel']) {
      expect(ecrits).not.toContain(statut)
    }
    expect(ecrits.filter((texte) => texte.includes('settings.'))).toEqual([])
  })
})
