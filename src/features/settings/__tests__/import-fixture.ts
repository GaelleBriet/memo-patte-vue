import { toJsonExport } from '../logic/export-format'
import { fromExportV1, type ExportDataV1 } from '../logic/export-v1'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { ImportFile } from '@/shared/domain/import-plan'

export const MILO_ID = '11111111-1111-4111-8111-111111111111'
export const LUNA_ID = '33333333-3333-4333-8333-333333333333'
export const CHPPIL_ID = '44444444-4444-4444-8444-444444444444'
export const TYPHUS_ID = '55555555-5555-4555-8555-555555555555'
export const MILBEMAX_ID = '66666666-6666-4666-8666-666666666666'
export const LUNA_WEIGHT_ID = '77777777-7777-4777-8777-777777777777'
export const MILO_WEIGHT_ID = '88888888-8888-4888-8888-888888888888'

export const IMPORT_FIXTURE_V1: ExportDataV1 = {
  animals: [
    {
      id: LUNA_ID,
      name: 'Luna',
      species: 'cat',
      breed: 'Européen',
      birthDate: '2019-03-02',
      initialWeightKg: 3.8,
      photoFileName: '0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
    },
    {
      id: MILO_ID,
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: null,
      initialWeightKg: null,
      photoFileName: null,
      createdAt: '2026-01-12T08:00:00.000Z',
      updatedAt: '2026-01-12T08:00:00.000Z',
    },
  ],
  vaccinations: [
    {
      id: CHPPIL_ID,
      animalId: MILO_ID,
      name: 'CHPPiL',
      lastInjectionDate: '2025-09-01',
      dueDate: '2026-09-01',
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
    },
    {
      id: TYPHUS_ID,
      animalId: LUNA_ID,
      name: 'Typhus',
      lastInjectionDate: '2024-05-20',
      dueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
    },
  ],
  treatments: [
    {
      id: MILBEMAX_ID,
      animalId: LUNA_ID,
      name: 'Milbémax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-15',
      nextDueDate: '2026-09-15',
      stoppedOn: null,
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    },
  ],
  weightEntries: [
    {
      id: LUNA_WEIGHT_ID,
      animalId: LUNA_ID,
      weightKg: 4.25,
      measuredOn: '2025-12-24',
      createdAt: '2026-01-10T08:15:00.000Z',
      updatedAt: '2026-01-10T08:15:00.000Z',
    },
    {
      id: MILO_WEIGHT_ID,
      animalId: MILO_ID,
      weightKg: 12,
      measuredOn: '2026-08-30',
      createdAt: '2026-08-30T08:15:00.000Z',
      updatedAt: '2026-08-30T08:15:00.000Z',
    },
  ],
}

/** Le même carnet en v2 : chaque vaccin et traitement avec son seul événement. */
export const IMPORT_FIXTURE: ExportData = {
  animals: IMPORT_FIXTURE_V1.animals,
  vaccinations: [
    {
      id: CHPPIL_ID,
      animalId: MILO_ID,
      name: 'CHPPiL',
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
    },
    {
      id: TYPHUS_ID,
      animalId: LUNA_ID,
      name: 'Typhus',
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
    },
  ],
  vaccinationInjections: [
    {
      id: CHPPIL_ID,
      vaccinationId: CHPPIL_ID,
      animalId: MILO_ID,
      injectedOn: '2025-09-01',
      nextDueDate: '2026-09-01',
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
    },
    {
      id: TYPHUS_ID,
      vaccinationId: TYPHUS_ID,
      animalId: LUNA_ID,
      injectedOn: '2024-05-20',
      nextDueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
    },
  ],
  treatments: [
    {
      id: MILBEMAX_ID,
      animalId: LUNA_ID,
      name: 'Milbémax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      stoppedOn: null,
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    },
  ],
  treatmentDoses: [
    {
      id: MILBEMAX_ID,
      treatmentId: MILBEMAX_ID,
      animalId: LUNA_ID,
      givenOn: '2026-06-15',
      nextDueDate: '2026-09-15',
      frequency: { value: 3, unit: 'month' },
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    },
  ],
  weightEntries: IMPORT_FIXTURE_V1.weightEntries,
}

export const IMPORT_FILE: ImportFile = { schemaVersion: 2, data: IMPORT_FIXTURE }

export function v1File(data: ExportDataV1 = IMPORT_FIXTURE_V1): ImportFile {
  return { schemaVersion: 1, data: fromExportV1(data) }
}

export function importFixtureJson(data: ExportData = IMPORT_FIXTURE): string {
  return toJsonExport(data, {
    exportedAt: new Date('2026-09-15T08:30:00.000Z'),
    appVersion: '0.1.25',
  })
}
