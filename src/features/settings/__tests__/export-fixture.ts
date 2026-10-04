import type {
  ExportAnimal,
  ExportData,
  ExportFrequency,
  ExportTreatment,
  ExportTreatmentPeriod,
  ExportVaccination,
  ExportWeightEntry,
} from '@/shared/domain/carnet-data'

export const MILO_ID = '11111111-1111-4111-8111-111111111111'
export const LUNA_ID = '33333333-3333-4333-8333-333333333333'

type Stamps = { createdAt: string; updatedAt: string }

export const FIXTURE_DEVICE = 'ffffffff-ffff-4fff-8fff-ffffffffffff'
export const BY_FIXTURE_DEVICE = {
  createdByDevice: FIXTURE_DEVICE,
  updatedByDevice: FIXTURE_DEVICE,
}

export type SummaryAnimal = Pick<
  ExportAnimal,
  'id' | 'name' | 'species' | 'breed' | 'birthDate' | 'photoFileName' | keyof Stamps
> &
  Partial<ExportAnimal>

export type SummaryVaccination = Omit<ExportVaccination, 'plannedDueDate'> & {
  lastInjectionDate: string
  dueDate: string | null
}

export type SummaryTreatment = ExportTreatment & {
  frequency: ExportFrequency
  lastDoseDate: string
  nextDueDate: string
  stoppedOn?: string | null
}

/** Carnet résumé : chaque vaccin avec sa dernière injection, chaque traitement avec sa dernière prise. */
export type CarnetSummary = {
  animals: SummaryAnimal[]
  vaccinations: SummaryVaccination[]
  treatments: SummaryTreatment[]
  weightEntries: ExportWeightEntry[]
}

export function animalOf(animal: SummaryAnimal): ExportAnimal {
  return {
    birthDateApproximate: false,
    unfollowedOn: null,
    departureReason: null,
    departureDate: null,
    ...BY_FIXTURE_DEVICE,
    ...animal,
  }
}

export function periodOf(
  period: Pick<
    ExportTreatmentPeriod,
    'id' | 'treatmentId' | 'animalId' | 'startsOn' | keyof Stamps
  > &
    Partial<ExportTreatmentPeriod>,
): ExportTreatmentPeriod {
  return {
    firstDueOn: period.startsOn,
    referenceOn: period.firstDueOn ?? period.startsOn,
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 1, unit: 'month' },
    times: [],
    doseQuantity: null,
    doseUnit: null,
    reminderOffsetMinutes: null,
    reminderTime: null,
    ...BY_FIXTURE_DEVICE,
    ...period,
  }
}

/** Injection, période et prise portent l'identifiant de leur parent, comme à la création dans l'app. */
export function carnetOf({
  animals,
  vaccinations,
  treatments,
  weightEntries,
}: CarnetSummary): ExportData {
  return {
    carnetSettings: null,
    animals: animals.map(animalOf),
    vaccinations: vaccinations.map(({ id, animalId, name, createdAt, updatedAt }) => ({
      id,
      animalId,
      name,
      plannedDueDate: null,
      createdAt,
      updatedAt,
      ...BY_FIXTURE_DEVICE,
    })),
    vaccinationInjections: vaccinations.map((vaccination) => ({
      id: vaccination.id,
      vaccinationId: vaccination.id,
      animalId: vaccination.animalId,
      injectedOn: vaccination.lastInjectionDate,
      nextDueDate: vaccination.dueDate,
      createdAt: vaccination.createdAt,
      updatedAt: vaccination.updatedAt,
      ...BY_FIXTURE_DEVICE,
    })),
    treatments: treatments.map(({ id, animalId, name, type, createdAt, updatedAt }) => ({
      id,
      animalId,
      name,
      type,
      createdAt,
      updatedAt,
      ...BY_FIXTURE_DEVICE,
    })),
    treatmentPeriods: treatments.map((treatment) =>
      periodOf({
        id: treatment.id,
        treatmentId: treatment.id,
        animalId: treatment.animalId,
        startsOn: treatment.lastDoseDate,
        frequency: treatment.frequency,
        stoppedOn: treatment.stoppedOn ?? null,
        createdAt: treatment.createdAt,
        updatedAt: treatment.updatedAt,
        ...BY_FIXTURE_DEVICE,
      }),
    ),
    treatmentDoses: treatments.map((treatment) => ({
      id: treatment.id,
      periodId: treatment.id,
      treatmentId: treatment.id,
      animalId: treatment.animalId,
      dueOn: treatment.lastDoseDate,
      dueTime: null,
      givenOn: treatment.lastDoseDate,
      status: 'given',
      nextDueDate: treatment.nextDueDate,
      createdAt: treatment.createdAt,
      updatedAt: treatment.updatedAt,
      ...BY_FIXTURE_DEVICE,
    })),
    weightEntries,
    devices: [],
  }
}

const PANACUR = {
  treatmentId: 't-panacur',
  periodId: 'p-panacur',
  animalId: MILO_ID,
  createdAt: '2026-09-10T07:00:00.000Z',
  updatedAt: '2026-09-10T07:00:00.000Z',
  ...BY_FIXTURE_DEVICE,
} as const

export const EXPORT_FIXTURE: ExportData = {
  carnetSettings: {
    vaccineReminderTime: '18:30',
    remindBeforeDue: false,
    createdAt: '2026-01-10T08:00:00.000Z',
    updatedAt: '2026-03-01T08:00:00.000Z',
    ...BY_FIXTURE_DEVICE,
  },
  animals: [
    animalOf({
      id: LUNA_ID,
      name: 'Luna',
      species: 'cat',
      breed: 'Européen ; tigrée "Mimi"',
      birthDate: '2019-03-02',
      birthDateApproximate: true,
      photoFileName: '0f6c1c9e-5d6b-4b43-9a57-2f1d8b0c7a11.jpg',
      createdAt: '2026-01-10T08:00:00.000Z',
      updatedAt: '2026-02-01T08:00:00.000Z',
      ...BY_FIXTURE_DEVICE,
    }),
    animalOf({
      id: MILO_ID,
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: null,
      photoFileName: null,
      unfollowedOn: '2026-09-14',
      departureReason: 'rehomed',
      departureDate: '2026-09-12',
      createdAt: '2026-01-12T08:00:00.000Z',
      updatedAt: '2026-01-12T08:00:00.000Z',
      ...BY_FIXTURE_DEVICE,
    }),
  ],
  vaccinations: [
    {
      id: 'v-chppil',
      animalId: MILO_ID,
      name: 'CHPPiL',
      plannedDueDate: null,
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'v-typhus',
      animalId: LUNA_ID,
      name: 'Typhus; coryza',
      plannedDueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'v-leucose',
      animalId: LUNA_ID,
      name: 'Leucose',
      plannedDueDate: '2026-11-02',
      createdAt: '2026-01-10T08:06:00.000Z',
      updatedAt: '2026-01-10T08:06:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
  ],
  vaccinationInjections: [
    {
      id: 'i-chppil-2025',
      vaccinationId: 'v-chppil',
      animalId: MILO_ID,
      injectedOn: '2025-09-01',
      nextDueDate: '2026-09-01',
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'i-chppil-2024',
      vaccinationId: 'v-chppil',
      animalId: MILO_ID,
      injectedOn: '2024-09-01',
      nextDueDate: '2025-09-01',
      createdAt: '2026-01-12T08:06:00.000Z',
      updatedAt: '2026-01-12T08:06:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'i-typhus',
      vaccinationId: 'v-typhus',
      animalId: LUNA_ID,
      injectedOn: '2024-05-20',
      nextDueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
  ],
  treatments: [
    {
      id: 't-milbemax',
      animalId: LUNA_ID,
      name: 'Milbémax',
      type: 'deworming',
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 't-panacur',
      animalId: MILO_ID,
      name: 'Panacur',
      type: 'deworming',
      createdAt: PANACUR.createdAt,
      updatedAt: PANACUR.updatedAt,
      ...BY_FIXTURE_DEVICE,
    },
  ],
  treatmentPeriods: [
    periodOf({
      id: 'p-milbemax',
      treatmentId: 't-milbemax',
      animalId: LUNA_ID,
      startsOn: '2026-03-15',
      frequency: { value: 3, unit: 'month' },
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
      ...BY_FIXTURE_DEVICE,
    }),
    periodOf({
      id: 'p-panacur',
      treatmentId: 't-panacur',
      animalId: MILO_ID,
      startsOn: '2026-09-10',
      endsOn: '2026-09-20',
      frequency: { value: 1, unit: 'day' },
      times: ['08:00', '20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      reminderOffsetMinutes: 30,
      createdAt: PANACUR.createdAt,
      updatedAt: PANACUR.updatedAt,
      ...BY_FIXTURE_DEVICE,
    }),
  ],
  treatmentDoses: [
    {
      id: 'd-milbemax-06',
      periodId: 'p-milbemax',
      treatmentId: 't-milbemax',
      animalId: LUNA_ID,
      dueOn: '2026-06-15',
      dueTime: null,
      givenOn: '2026-06-15',
      status: 'given',
      nextDueDate: '2026-09-15',
      createdAt: '2026-06-15T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'd-milbemax-03',
      periodId: 'p-milbemax',
      treatmentId: 't-milbemax',
      animalId: LUNA_ID,
      dueOn: '2026-03-15',
      dueTime: null,
      givenOn: '2026-03-15',
      status: 'given',
      nextDueDate: '2026-06-15',
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-01-10T08:10:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      ...PANACUR,
      id: 'd-panacur-soir',
      dueOn: '2026-09-10',
      dueTime: '20:00',
      givenOn: null,
      status: 'missed',
      nextDueDate: '2026-09-11',
    },
    {
      ...PANACUR,
      id: 'd-panacur-matin',
      dueOn: '2026-09-10',
      dueTime: '08:00',
      givenOn: '2026-09-10',
      status: 'given',
      nextDueDate: '2026-09-10',
    },
  ],
  weightEntries: [
    {
      id: 'w-luna-1',
      animalId: LUNA_ID,
      weightKg: 4.25,
      measuredOn: '2025-12-24',
      createdAt: '2026-01-10T08:15:00.000Z',
      updatedAt: '2026-01-10T08:15:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
    {
      id: 'w-milo-1',
      animalId: MILO_ID,
      weightKg: 12,
      measuredOn: '2026-08-30',
      createdAt: '2026-08-30T08:15:00.000Z',
      updatedAt: '2026-08-30T08:15:00.000Z',
      ...BY_FIXTURE_DEVICE,
    },
  ],
  devices: [
    {
      id: FIXTURE_DEVICE,
      model: 'Pixel 8',
      installedAt: '2026-01-10T07:55:00.000Z',
      createdAt: '2026-01-10T07:55:00.000Z',
      updatedAt: '2026-01-10T07:55:00.000Z',
    },
  ],
}
