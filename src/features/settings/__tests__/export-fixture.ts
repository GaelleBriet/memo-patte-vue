import type { ExportData } from '@/shared/domain/carnet-data'

export const MILO_ID = '11111111-1111-4111-8111-111111111111'
export const LUNA_ID = '33333333-3333-4333-8333-333333333333'

export const EXPORT_FIXTURE: ExportData = {
  animals: [
    {
      id: LUNA_ID,
      name: 'Luna',
      species: 'cat',
      breed: 'Européen ; tigrée "Mimi"',
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
      id: 'v-chppil',
      animalId: MILO_ID,
      name: 'CHPPiL',
      lastInjectionDate: '2025-09-01',
      dueDate: '2026-09-01',
      createdAt: '2026-01-12T08:05:00.000Z',
      updatedAt: '2026-01-12T08:05:00.000Z',
    },
    {
      id: 'v-typhus',
      animalId: LUNA_ID,
      name: 'Typhus; coryza',
      lastInjectionDate: '2024-05-20',
      dueDate: null,
      createdAt: '2026-01-10T08:05:00.000Z',
      updatedAt: '2026-01-10T08:05:00.000Z',
    },
  ],
  treatments: [
    {
      id: 't-milbemax',
      animalId: LUNA_ID,
      name: 'Milbémax',
      type: 'deworming',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-15',
      nextDueDate: '2026-09-15',
      createdAt: '2026-01-10T08:10:00.000Z',
      updatedAt: '2026-06-15T08:10:00.000Z',
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
    },
    {
      id: 'w-milo-1',
      animalId: MILO_ID,
      weightKg: 12,
      measuredOn: '2026-08-30',
      createdAt: '2026-08-30T08:15:00.000Z',
      updatedAt: '2026-08-30T08:15:00.000Z',
    },
  ],
}
