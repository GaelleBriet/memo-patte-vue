import { unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import { createDataExportService, type DataExportDependencies } from '../data-export.service'
import type { ExportFile } from '../export-format'
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'
import type { Animal } from '@/features/animals/schema/animal.schema'
import type { Treatment } from '@/features/treatments/schema/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import type { WeightEntry } from '@/features/weight/weight.schema'

const NOW = new Date('2026-09-15T10:30:00')

const animals: Animal[] = EXPORT_FIXTURE.animals.map(({ photoFileName, ...animal }) => ({
  ...animal,
  photoPath: photoFileName,
  deletedAt: null,
}))
const vaccinations: Vaccination[] = EXPORT_FIXTURE.vaccinations.map((row) => ({
  ...row,
  deletedAt: null,
}))
const treatments: Treatment[] = EXPORT_FIXTURE.treatments.map((row) => ({
  ...row,
  deletedAt: null,
}))
const weightEntries: WeightEntry[] = EXPORT_FIXTURE.weightEntries.map((row) => ({
  ...row,
  deletedAt: null,
}))

function setup(overrides: Partial<DataExportDependencies> = {}) {
  const listByAnimal = vi.fn<(animalId: string) => Promise<WeightEntry[]>>(async (animalId) =>
    weightEntries.filter((entry) => entry.animalId === animalId),
  )
  const deliver = vi.fn<DataExportDependencies['deliver']>(async () => 'shared')
  const service = createDataExportService({
    animals: () => ({ list: async () => animals }),
    vaccinations: () => ({ listAll: async () => vaccinations }),
    treatments: async () => ({ listAll: async () => treatments }),
    weight: () => ({ listByAnimal }),
    deliver,
    now: () => NOW,
    appVersion: '0.1.24',
    ...overrides,
  })
  return { service, deliver, listByAnimal }
}

function delivered(deliver: ReturnType<typeof setup>['deliver']): ExportFile {
  return deliver.mock.calls[0]![0]
}

describe('data-export.service', () => {
  it('rassemble le carnet complet depuis les repositories, sans suppression logique', async () => {
    const { service, listByAnimal } = setup()

    await expect(service.collect()).resolves.toEqual(EXPORT_FIXTURE)
    expect(listByAnimal.mock.calls.map(([id]) => id)).toEqual([LUNA_ID, MILO_ID])
  })

  it('JSON : remet le fichier du jour, versionné, et renvoie l’issue du partage', async () => {
    const { service, deliver } = setup()

    await expect(service.exportData('json')).resolves.toBe('shared')

    const file = delivered(deliver)
    expect(file.name).toBe('memopatte-export-2026-09-15.json')
    const document = JSON.parse(file.content as string)
    expect(document).toMatchObject({
      schemaVersion: 1,
      exportedAt: NOW.toISOString(),
      appVersion: '0.1.24',
    })
    expect(document.animals).toHaveLength(2)
    expect(document.animals[0]).not.toHaveProperty('deletedAt')
    expect(document.animals[0]).not.toHaveProperty('photoPath')
  })

  it('CSV : remet l’archive des cinq tables', async () => {
    const { service, deliver } = setup()

    await service.exportData('csv')

    const file = delivered(deliver)
    expect(file.name).toBe('memopatte-export-2026-09-15.zip')
    expect(Object.keys(unzipSync(file.content as Uint8Array))).toHaveLength(5)
  })

  it('transmet l’annulation du partage', async () => {
    const { service } = setup({ deliver: async () => 'cancelled' })

    await expect(service.exportData('json')).resolves.toBe('cancelled')
  })

  it('lève si la base ne répond pas, sans rien remettre', async () => {
    const { service, deliver } = setup({
      vaccinations: () => ({
        listAll: async () => {
          throw new Error('base fermée')
        },
      }),
    })

    await expect(service.exportData('json')).rejects.toThrow('base fermée')
    expect(deliver).not.toHaveBeenCalled()
  })
})
