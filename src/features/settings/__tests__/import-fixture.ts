import { animalOf, periodOf } from './export-fixture'
import { toJsonExport } from '../logic/export-format'
import type { ExportData } from '@/shared/domain/carnet-data'
import type { ImportFile } from '@/shared/domain/import-plan'

export const MILO_ID = '11111111-1111-4111-8111-111111111111'
export const LUNA_ID = '33333333-3333-4333-8333-333333333333'
export const CHPPIL_ID = '44444444-4444-4444-8444-444444444444'
export const TYPHUS_ID = '55555555-5555-4555-8555-555555555555'
export const MILBEMAX_ID = '66666666-6666-4666-8666-666666666666'
export const LUNA_WEIGHT_ID = '77777777-7777-4777-8777-777777777777'
export const MILO_WEIGHT_ID = '88888888-8888-4888-8888-888888888888'
export const LEUCOSE_ID = '99999999-9999-4999-8999-999999999999'
export const PANACUR_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
export const PANACUR_PERIOD_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
export const PANACUR_MATIN_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
export const PANACUR_SOIR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
export const PANACUR_REPORT_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'

const PANACUR = {
  periodId: PANACUR_PERIOD_ID,
  treatmentId: PANACUR_ID,
  animalId: MILO_ID,
  createdAt: '2026-09-01T07:00:00.000Z',
  updatedAt: '2026-09-01T07:00:00.000Z',
} as const

/**
 * Luna : un vaccin avec injection, un vaccin seulement prévu, un vermifuge trimestriel. Milo : un
 * traitement quotidien à deux heures, avec une prise donnée, une oubliée et un report.
 */
export const IMPORT_FIXTURE: ExportData = {
  carnetSettings: {
    vaccineReminderTime: '18:30',
    remindBeforeDue: false,
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
  },
  animals: [
    animalOf({
      id: LUNA_ID,
      name: 'Luna',
      species: 'cat',
      breed: 'Européen',
      birthDate: '2019-03-02',
      birthDateApproximate: true,
      photoFileName: '0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
    }),
    animalOf({
      id: MILO_ID,
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: null,
      photoFileName: null,
      createdAt: '2026-01-12T08:00:00.000Z',
      updatedAt: '2026-01-12T08:00:00.000Z',
    }),
  ],
  vaccinations: [
    {
      id: CHPPIL_ID,
      animalId: MILO_ID,
      name: 'CHPPiL',
      plannedDueDate: null,
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
    },
    {
      id: TYPHUS_ID,
      animalId: LUNA_ID,
      name: 'Typhus',
      plannedDueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
    },
    {
      id: LEUCOSE_ID,
      animalId: LUNA_ID,
      name: 'Leucose',
      plannedDueDate: '2026-11-02',
      createdAt: '2026-01-10T08:06:00.000Z',
      updatedAt: '2026-01-10T08:06:00.000Z',
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
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    },
    {
      id: PANACUR_ID,
      animalId: MILO_ID,
      name: 'Panacur',
      type: 'deworming',
      createdAt: PANACUR.createdAt,
      updatedAt: PANACUR.updatedAt,
    },
  ],
  treatmentPeriods: [
    periodOf({
      id: MILBEMAX_ID,
      treatmentId: MILBEMAX_ID,
      animalId: LUNA_ID,
      startsOn: '2026-06-15',
      frequency: { value: 3, unit: 'month' },
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    }),
    periodOf({
      id: PANACUR_PERIOD_ID,
      treatmentId: PANACUR_ID,
      animalId: MILO_ID,
      startsOn: '2026-09-01',
      endsOn: '2026-09-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      reminderOffsetMinutes: 30,
      createdAt: PANACUR.createdAt,
      updatedAt: PANACUR.updatedAt,
    }),
  ],
  treatmentDoses: [
    {
      id: MILBEMAX_ID,
      periodId: MILBEMAX_ID,
      treatmentId: MILBEMAX_ID,
      animalId: LUNA_ID,
      dueOn: '2026-06-15',
      dueTime: null,
      givenOn: '2026-06-15',
      status: 'given',
      nextDueDate: '2026-09-15',
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
    },
    {
      ...PANACUR,
      id: PANACUR_REPORT_ID,
      dueOn: '2026-09-02',
      dueTime: '08:00',
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-09-03',
    },
    {
      ...PANACUR,
      id: PANACUR_SOIR_ID,
      dueOn: '2026-09-01',
      dueTime: '20:00',
      givenOn: null,
      status: 'missed',
      nextDueDate: '2026-09-02',
    },
    {
      ...PANACUR,
      id: PANACUR_MATIN_ID,
      dueOn: '2026-09-01',
      dueTime: '08:00',
      givenOn: '2026-09-01',
      status: 'given',
      nextDueDate: '2026-09-01',
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

export const IMPORT_FILE: ImportFile = { schemaVersion: 3, data: IMPORT_FIXTURE }

export function importFile(data: ExportData = IMPORT_FIXTURE): ImportFile {
  return { schemaVersion: 3, data }
}

export function importFixtureJson(data: ExportData = IMPORT_FIXTURE): string {
  return toJsonExport(data, {
    exportedAt: new Date('2026-09-15T08:30:00.000Z'),
    appVersion: '0.1.25',
  })
}
