import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it, vi } from 'vitest'

import {
  createDataExportService,
  type DataExportDependencies,
} from '../service/data-export.service'
import type { ExportFile } from '../logic/export-format'
import { EXPORT_FIXTURE, LUNA_ID, MILO_ID } from './export-fixture'
import type { AnimalRecord } from '@/features/animals/schema/animal.schema'
import type { TreatmentDose } from '@/features/treatments/schema/treatment-dose.schema'
import type { TreatmentPeriodRecord } from '@/features/treatments/schema/treatment-period.schema'
import type { VaccinationInjection } from '@/features/vaccinations/schema/vaccination-injection.schema'
import type { WeightEntry } from '@/features/weight/schema/weight.schema'
import type { Stamped } from '@/shared/domain/carnet-data'

const NOW = new Date('2026-09-15T10:30:00')

const animals: AnimalRecord[] = EXPORT_FIXTURE.animals.map(({ photoFileName, ...animal }) => ({
  ...animal,
  photoPath: photoFileName,
  deletedAt: null,
}))
const injections: Stamped<VaccinationInjection>[] = EXPORT_FIXTURE.vaccinationInjections.map(
  (row) => ({
    ...row,
    deletedAt: null,
  }),
)
const periods: Stamped<TreatmentPeriodRecord>[] = EXPORT_FIXTURE.treatmentPeriods.map((row) => ({
  ...row,
  deletedAt: null,
}))
const doses: Stamped<TreatmentDose>[] = EXPORT_FIXTURE.treatmentDoses.map((row) => ({
  ...row,
  frequency: { value: 3, unit: 'month' },
  deletedAt: null,
}))
const weightEntries: Stamped<WeightEntry>[] = EXPORT_FIXTURE.weightEntries.map((row) => ({
  ...row,
  deletedAt: null,
}))

function setup(overrides: Partial<DataExportDependencies> = {}) {
  const deliver = vi.fn<DataExportDependencies['deliver']>(async () => 'shared')
  const service = createDataExportService({
    carnetSettings: () => ({ getRecord: async () => EXPORT_FIXTURE.carnetSettings }),
    animals: () => ({ listRecords: async () => animals }),
    vaccinations: () => ({ listRecords: async () => EXPORT_FIXTURE.vaccinations }),
    vaccinationInjections: () => ({ listAll: async () => injections }),
    treatments: async () => ({ listRecords: async () => EXPORT_FIXTURE.treatments }),
    treatmentPeriods: () => ({ listRecords: async () => periods }),
    treatmentDoses: () => ({ listRecords: async () => doses }),
    weight: () => ({ listRecords: async () => weightEntries }),
    devices: () => ({ listRecords: async () => EXPORT_FIXTURE.devices }),
    deliver,
    now: () => NOW,
    appVersion: '0.1.24',
    weightUnit: () => 'kg',
    ...overrides,
  })
  return { service, deliver }
}

function delivered(deliver: ReturnType<typeof setup>['deliver']): ExportFile {
  return deliver.mock.calls[0]![0]
}

describe('data-export.service', () => {
  it('rassemble le carnet complet depuis les repositories, sans suppression logique', async () => {
    const { service } = setup()

    await expect(service.collect()).resolves.toEqual(EXPORT_FIXTURE)
  })

  it('n’exporte pas les pesées d’un animal non exporté', async () => {
    const stray = { ...weightEntries[0]!, id: 'w-orpheline', animalId: 'a-supprime' }
    const { service } = setup({
      weight: () => ({ listRecords: async () => [stray, ...weightEntries] }),
    })

    const { weightEntries: exported } = await service.collect()

    expect(exported.map(({ animalId }) => animalId)).toEqual([LUNA_ID, MILO_ID])
  })

  it('exporte `null` pour des réglages du carnet jamais touchés', async () => {
    const { service } = setup({ carnetSettings: () => ({ getRecord: async () => null }) })

    await expect(service.collect()).resolves.toMatchObject({ carnetSettings: null })
  })

  it('range les événements dans l’ordre de leurs parents, sans ceux d’un parent non exporté', async () => {
    const orphan = { ...injections[0]!, id: 'i-orpheline', vaccinationId: 'v-supprime' }
    const { service } = setup({
      vaccinationInjections: () => ({ listAll: async () => [orphan, ...injections].reverse() }),
    })

    const { vaccinationInjections } = await service.collect()

    expect(vaccinationInjections.map(({ id }) => id)).toEqual([
      'i-chppil-2024',
      'i-chppil-2025',
      'i-typhus',
    ])
  })

  it('n’exporte ni la période d’un traitement non exporté, ni la prise d’une période non exportée', async () => {
    const stray = { ...periods[0]!, id: 'p-orpheline', treatmentId: 't-supprime' }
    const { service } = setup({
      treatmentPeriods: () => ({ listRecords: async () => [stray, periods[1]!] }),
    })

    const { treatmentPeriods, treatmentDoses } = await service.collect()

    expect(treatmentPeriods.map(({ id }) => id)).toEqual(['p-panacur'])
    expect(treatmentDoses.map(({ id }) => id)).toEqual(['d-panacur-soir', 'd-panacur-matin'])
  })

  it('exporte chaque ligne d’un traitement, oubliée ou reportée comprise, sans la fréquence de sa période', async () => {
    const reportee: Stamped<TreatmentDose> = {
      ...doses[0]!,
      id: 'd-reportee',
      dueOn: '2026-09-15',
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-09-20',
    }
    const { service } = setup({
      treatmentDoses: () => ({ listRecords: async () => [reportee, ...doses] }),
    })

    const { treatmentDoses } = await service.collect()

    const { frequency: _, deletedAt: __, ...exported } = reportee
    expect(treatmentDoses).toEqual([exported, ...EXPORT_FIXTURE.treatmentDoses])
  })

  it('JSON : remet le fichier du jour, versionné, et renvoie l’issue du partage', async () => {
    const { service, deliver } = setup()

    await expect(service.exportData('json', 'share')).resolves.toBe('shared')

    expect(deliver.mock.calls[0]![1]).toBe('share')
    const file = delivered(deliver)
    expect(file.name).toBe('memopatte-export-20260915-1030.json')
    const document = JSON.parse(file.content as string)
    expect(document).toMatchObject({
      schemaVersion: 4,
      exportedAt: NOW.toISOString(),
      appVersion: '0.1.24',
    })
    expect(document.animals).toHaveLength(2)
    expect(document.animals[0]).not.toHaveProperty('deletedAt')
    expect(document.animals[0]).not.toHaveProperty('photoPath')
  })

  it('CSV : remet l’archive des huit tables', async () => {
    const { service, deliver } = setup()

    await service.exportData('csv', 'share')

    const file = delivered(deliver)
    expect(file.name).toBe('memopatte-export-20260915-1030.zip')
    expect(Object.keys(unzipSync(file.content as Uint8Array))).toHaveLength(8)
  })

  it('CSV : écrit les poids dans l’unité choisie au moment de l’export', async () => {
    const { service, deliver } = setup({ weightUnit: () => 'lb' })

    await service.exportData('csv', 'share')

    const poids = strFromU8(unzipSync(delivered(deliver).content as Uint8Array)['poids.csv']!)
    expect(poids).toContain('measuredOn;weightLb\r\n')
  })

  it('JSON : garde les kilos quelle que soit l’unité choisie', async () => {
    const { service, deliver } = setup({ weightUnit: () => 'lb' })

    await service.exportData('json', 'share')

    const document = JSON.parse(delivered(deliver).content as string)
    expect(document.weightEntries[0].weightKg).toBe(EXPORT_FIXTURE.weightEntries[0]!.weightKg)
  })

  it('transmet l’annulation du partage', async () => {
    const { service } = setup({ deliver: async () => 'cancelled' })

    await expect(service.exportData('json', 'share')).resolves.toBe('cancelled')
  })

  it('remet le même fichier pour l’enregistrer sur le téléphone', async () => {
    const saved = {
      status: 'saved',
      file: { uri: 'file:///memopatte-export-20260915-1030.json', mimeType: 'application/json' },
    } as const
    const deliver = vi.fn<DataExportDependencies['deliver']>(async () => saved)
    const { service } = setup({ deliver })

    await expect(service.exportData('json', 'save')).resolves.toBe(saved)

    expect(deliver).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'memopatte-export-20260915-1030.json' }),
      'save',
    )
  })

  it('lève si la base ne répond pas, sans rien remettre', async () => {
    const { service, deliver } = setup({
      vaccinations: () => ({
        listRecords: async () => {
          throw new Error('base fermée')
        },
      }),
    })

    await expect(service.exportData('json', 'save')).rejects.toThrow('base fermée')
    expect(deliver).not.toHaveBeenCalled()
  })
})
