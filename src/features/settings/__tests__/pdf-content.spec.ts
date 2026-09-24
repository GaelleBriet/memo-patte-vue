import { describe, expect, it } from 'vitest'

import { buildCarnetPdfContent, pdfExportFileName } from '../logic/pdf-content'
import type { ExportData } from '@/shared/domain/carnet-data'

const ANIMAL_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_ANIMAL_ID = '22222222-2222-4222-8222-222222222222'

const DATA: ExportData = {
  animals: [
    {
      id: ANIMAL_ID,
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2020-05-01',
      initialWeightKg: 25,
      photoFileName: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: OTHER_ANIMAL_ID,
      name: 'Luna',
      species: 'cat',
      breed: null,
      birthDate: null,
      initialWeightKg: null,
      photoFileName: 'luna.jpg',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  vaccinations: [
    {
      id: 'v-overdue',
      animalId: ANIMAL_ID,
      name: 'Rage',
      lastInjectionDate: '2025-01-01',
      dueDate: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'v-none',
      animalId: ANIMAL_ID,
      name: 'Toux de chenil',
      lastInjectionDate: '2025-06-01',
      dueDate: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'v-other-animal',
      animalId: OTHER_ANIMAL_ID,
      name: 'Typhus',
      lastInjectionDate: '2026-01-01',
      dueDate: '2027-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  treatments: [
    {
      id: 't-upcoming',
      animalId: ANIMAL_ID,
      name: 'Milbémax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-01',
      nextDueDate: '2026-09-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
  weightEntries: [
    {
      id: 'w-2',
      animalId: ANIMAL_ID,
      weightKg: 26,
      measuredOn: '2026-06-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
    {
      id: 'w-1',
      animalId: ANIMAL_ID,
      weightKg: 25,
      measuredOn: '2026-01-01',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    },
  ],
}

const TODAY = '2026-07-01'

describe('buildCarnetPdfContent', () => {
  it('renvoie null pour un animal inconnu', () => {
    expect(buildCarnetPdfContent(DATA, 'introuvable', TODAY)).toBeNull()
  })

  it("ne retient que les lignes de l'animal demandé", () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.animal).toEqual({
      name: 'Milo',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2020-05-01',
      photoFileName: null,
    })
    expect(content.vaccinations.map((row) => row.name)).toEqual(['Rage', 'Toux de chenil'])
    expect(content.treatments).toHaveLength(1)
    expect(content.weightEntries).toHaveLength(2)
  })

  it('classe chaque échéance en retard, à jour ou sans rappel', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    const rage = content.vaccinations.find((row) => row.name === 'Rage')!
    const kennel = content.vaccinations.find((row) => row.name === 'Toux de chenil')!
    expect(rage.state).toBe('overdue')
    expect(kennel.state).toBe('none')
    expect(content.treatments[0]!.state).toBe('upToDate')
  })

  it('montre un traitement arrêté sans échéance ni rappel, après les traitements en cours', () => {
    const data = {
      ...DATA,
      treatments: [
        { ...DATA.treatments[0]!, id: 't-stopped', name: 'Drontal', stoppedOn: '2026-06-20' },
        ...DATA.treatments,
      ],
    }

    const content = buildCarnetPdfContent(data, ANIMAL_ID, TODAY)!

    expect(content.treatments.map((row) => [row.name, row.nextDueDate, row.state])).toEqual([
      ['Milbémax', '2026-09-01', 'upToDate'],
      ['Drontal', null, 'none'],
    ])
  })

  it('trie les échéances par date, les rappels absents en dernier', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.vaccinations.map((row) => row.name)).toEqual(['Rage', 'Toux de chenil'])
  })

  it('trie les pesées par date de mesure', () => {
    const content = buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!

    expect(content.weightEntries.map((row) => row.measuredOn)).toEqual(['2026-01-01', '2026-06-01'])
  })

  it('reprend le nom de fichier de la photo quand il existe', () => {
    expect(buildCarnetPdfContent(DATA, ANIMAL_ID, TODAY)!.animal.photoFileName).toBeNull()
    expect(buildCarnetPdfContent(DATA, OTHER_ANIMAL_ID, TODAY)!.animal.photoFileName).toBe(
      'luna.jpg',
    )
  })
})

describe('pdfExportFileName', () => {
  const AT = new Date('2026-09-23T14:32:00')

  it("compose le nom à partir du mot « carnet », du nom de l'animal et de la minute locale", () => {
    expect(pdfExportFileName('carnet', 'Milo', AT)).toBe('carnet-milo-20260923-1432.pdf')
    expect(pdfExportFileName('carnet', 'Milo', new Date('2026-09-23T09:05:00'))).toBe(
      'carnet-milo-20260923-0905.pdf',
    )
  })

  it('retire les accents, remplace tout autre caractère par un tiret, sans tiret doublé ni en bord', () => {
    expect(pdfExportFileName('carnet', "  Néo l'énergique !! ", AT)).toBe(
      'carnet-neo-l-energique-20260923-1432.pdf',
    )
  })

  it('se passe du nom quand il ne donne aucun caractère', () => {
    expect(pdfExportFileName('carnet', '🐶', AT)).toBe('carnet-20260923-1432.pdf')
  })

  it('simplifie aussi le mot traduit', () => {
    expect(pdfExportFileName('Health record', 'Milo', AT)).toBe(
      'health-record-milo-20260923-1432.pdf',
    )
  })
})
