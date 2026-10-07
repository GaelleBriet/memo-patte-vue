import { describe, expect, it } from 'vitest'

import { toCsvTables, toJsonExport } from '../logic/export-format'
import {
  buildCarnetPdfContent,
  type CarnetPdfContent,
  type PdfTreatmentRow,
  type PdfVaccinationRow,
} from '../logic/pdf-content'
import { renderCarnetPdf } from '../logic/render-carnet-pdf'
import { EXPORT_FIXTURE, LUNA_ID } from './export-fixture'
import { PHOTO_JPEG } from './pdf-fixture'
import { readPdfPages, textBounds, type PdfPage } from './pdf-reader'
import { plain } from '@/shared/__tests__/plain'

const ZONE = { left: 18, right: 192, top: 10, bottom: 287 }
const SOIXANTE_EMOJI = '🐶'.repeat(60)

function vaccin(name: string): PdfVaccinationRow {
  return {
    name,
    lastInjectionDate: '2025-09-01',
    injectionDates: ['2025-09-01'],
    dueDate: '2026-09-01',
    state: 'upToDate',
  }
}

function traitement(name: string): PdfTreatmentRow {
  return {
    name,
    lastDoseDate: '2026-08-01',
    lastDoseExtra: false,
    periods: [],
    due: { kind: 'due', dueOn: '2026-11-01', dueTime: null, overdue: false },
    state: 'upToDate',
  }
}

function carnet(animal: Partial<CarnetPdfContent['animal']>, rows: string[]): CarnetPdfContent {
  return {
    animal: {
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: null,
      birthDateApproximate: false,
      departureDate: null,
      photoFileName: null,
      ...animal,
    },
    generatedOn: '2026-09-15',
    vaccinations: rows.map(vaccin),
    treatments: rows.map(traitement),
    weightEntries: [],
  }
}

function pages(content: CarnetPdfContent, photo: string | null = null): PdfPage[] {
  return readPdfPages(renderCarnetPdf([{ content, photoDataUrl: photo }], '0.1.24'))
}

function textes(content: CarnetPdfContent): string[] {
  return pages(content).flatMap((page) => page.texts.map((text) => plain(text.text)))
}

describe('renderCarnetPdf — caractères hors de la police', () => {
  it('écrit les noms sans leurs emoji, et rien d’illisible', () => {
    const content = carnet({ name: 'Milo 🐶', breed: 'Berger 🐕 australien' }, [
      'Rage 💉',
      '🐛 Milbémax',
    ])
    const ecrits = textes(content)

    expect(ecrits).toEqual(expect.arrayContaining(['Milo', 'Rage', 'Milbémax']))
    expect(ecrits).toContain('Chien · Berger australien')
    for (const texte of ecrits) expect(texte).not.toContain('\u0000')
  })

  it('écrit un tiret pour un nom réduit à rien', () => {
    const [premiere, ...suivantes] = pages({
      ...carnet({ name: '🐶🐱' }, ['💉']),
      vaccinations: Array.from({ length: 30 }, () => vaccin('💉')),
    })
    const enTete = premiere!.texts.find((text) => text.bold && text.sizePt === 15)!
    const noms = premiere!.texts.filter((text) => text.text === '—')

    expect(enTete.text).toBe('—')
    expect(noms.length).toBeGreaterThan(1)
    expect(suivantes.length).toBeGreaterThan(0)
    for (const page of suivantes) {
      expect(page.texts.find((text) => text.bold && text.sizePt === 11)?.text).toBe('—')
    }
  })

  it('omet de l’identité une race réduite à rien', () => {
    const ecrits = textes(carnet({ breed: '🐕', birthDate: '2019-03-02' }, []))

    expect(ecrits).toContain('Chien · Date de naissance : 2 mars 2019 · 7 ans')
  })

  it('garde la date de naissance d’un seul tenant', () => {
    const [premiere] = pages(carnet({ birthDate: '2019-03-02' }, []))

    expect(premiere!.texts.some((text) => text.text.includes(': 2\u00a0mars\u00a02019 '))).toBe(
      true,
    )
  })

  it('n’écrit rien hors de la zone imprimable, même avec soixante emoji dans un nom', () => {
    const content = carnet({ name: `Milo ${SOIXANTE_EMOJI}`, breed: SOIXANTE_EMOJI }, [
      `Rage ${SOIXANTE_EMOJI}`,
      SOIXANTE_EMOJI,
    ])
    const defauts = [...pages(content), ...pages(content, PHOTO_JPEG)]
      .flatMap((page) => page.texts)
      .filter((text) => {
        const box = textBounds(text)
        return box.left < ZONE.left || box.right > ZONE.right || box.bottom > ZONE.bottom
      })
      .map((text) => text.text)

    expect(defauts).toEqual([])
    expect(textes(content)).toEqual(expect.arrayContaining(['Milo', 'Rage', '—']))
  })
})

describe('renderCarnetPdf — prise en plus', () => {
  it('marque la date d’une prise en plus', () => {
    const content: CarnetPdfContent = {
      ...carnet({}, []),
      treatments: [
        {
          ...traitement('Milbemax'),
          lastDoseDate: '2026-10-09',
          lastDoseExtra: true,
          periods: [
            {
              from: '2026-10-02',
              to: null,
              frequency: { value: 1, unit: 'month' },
              times: [],
              dosage: { doseQuantity: null, doseUnit: null },
              lines: [
                {
                  kind: 'given',
                  series: {
                    kind: 'dates',
                    doses: [
                      { on: '2026-10-09', time: null, extra: false },
                      { on: '2026-10-02', time: null, extra: true },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    }

    const lisibles = textes(content).map((texte) => texte.replace(/\s/gu, ' '))

    expect(lisibles).toEqual(
      expect.arrayContaining([
        'Dernière prise : 09/10/2026 (prise en plus)',
        'Prises : 09/10/2026 · 02/10/2026 (prise en plus)',
      ]),
    )
  })
})

describe('emoji retirés du PDF seulement', () => {
  const [luna, ...autres] = EXPORT_FIXTURE.animals
  const data = { ...EXPORT_FIXTURE, animals: [{ ...luna!, name: 'Luna 🐱' }, ...autres] }

  it('garde le nom d’origine dans le contenu du PDF, avant l’écriture', () => {
    expect(buildCarnetPdfContent(data, LUNA_ID, '2026-09-15')?.animal.name).toBe('Luna 🐱')
  })

  it('garde le nom d’origine dans les exports JSON et CSV', () => {
    const json = JSON.parse(toJsonExport(data, { exportedAt: new Date(), appVersion: '0.1.24' }))

    expect(json.animals[0].name).toBe('Luna 🐱')
    expect(toCsvTables(data, 'kg', '2026-09-15')['animaux.csv']).toContain(`${LUNA_ID};Luna 🐱;cat`)
  })
})
