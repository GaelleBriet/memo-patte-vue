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
    previousDoses: [],
    nextDueDate: '2026-11-01',
    stoppedOn: null,
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
  return readPdfPages(renderCarnetPdf(content, '0.1.24', photo))
}

function textes(content: CarnetPdfContent): string[] {
  return pages(content).flatMap((page) => page.texts.map((text) => text.text))
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

    expect(ecrits).toContain('Chien · Date de naissance : 2 mars 2019')
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

describe('emoji retirés du PDF seulement', () => {
  const [luna, ...autres] = EXPORT_FIXTURE.animals
  const data = { ...EXPORT_FIXTURE, animals: [{ ...luna!, name: 'Luna 🐱' }, ...autres] }

  it('garde le nom d’origine dans le contenu du PDF, avant l’écriture', () => {
    expect(buildCarnetPdfContent(data, LUNA_ID, '2026-09-15')?.animal.name).toBe('Luna 🐱')
  })

  it('garde le nom d’origine dans les exports JSON et CSV', () => {
    const json = JSON.parse(toJsonExport(data, { exportedAt: new Date(), appVersion: '0.1.24' }))

    expect(json.animals[0].name).toBe('Luna 🐱')
    expect(toCsvTables(data)['animaux.csv']).toContain(`${LUNA_ID};Luna 🐱;cat`)
  })
})
