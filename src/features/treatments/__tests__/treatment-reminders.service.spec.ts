// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import type { Treatment } from '../schema/treatment.schema'
import {
  createTreatmentRemindersService,
  type TreatmentRemindersService,
} from '../service/treatment-reminders.service'

const LUNA: Animal = {
  id: '33333333-3333-4333-8333-333333333333',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const MILBEMAX: Treatment = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: LUNA.id,
  name: 'Milbemax',
  type: 'deworming',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-07-15',
  nextDueDate: '2026-10-15',
  stoppedOn: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const OTHER = `treatment:55555555-5555-4555-8555-555555555555:2026-10-01:due`

let notifications: FakeNotifications
let getAnimal: ReturnType<typeof vi.fn<(id: string) => Promise<Animal | null>>>
let getTreatment: ReturnType<typeof vi.fn<(id: string) => Promise<Treatment | null>>>
let service: TreatmentRemindersService

function programmes(): Date[] {
  return [...notifications.pending.values()]
    .filter((reminder) => reminder.key.startsWith(`treatment:${MILBEMAX.id}:`))
    .map((reminder) => reminder.at)
    .sort((a, b) => a.getTime() - b.getTime())
}

beforeEach(() => {
  notifications = createFakeNotifications()
  getAnimal = vi.fn<(id: string) => Promise<Animal | null>>().mockResolvedValue(LUNA)
  getTreatment = vi.fn<(id: string) => Promise<Treatment | null>>().mockResolvedValue(MILBEMAX)
  service = createTreatmentRemindersService({
    treatments: () => ({ getById: getTreatment }),
    animals: () => ({ getById: getAnimal }),
    notifications,
    t: i18n.global.t,
    now: () => new Date(2026, 8, 15, 12),
  })
})

describe('treatmentRemindersService', () => {
  it('relit le traitement puis reprogramme les rappels de sa prochaine échéance', async () => {
    await service.reschedule(MILBEMAX.id)

    expect(getTreatment).toHaveBeenCalledWith(MILBEMAX.id)
    expect(getAnimal).toHaveBeenCalledWith(LUNA.id)
    expect(programmes()).toEqual([
      new Date(2026, 9, 12, 9),
      new Date(2026, 9, 15, 9),
      new Date(2026, 9, 18, 9),
    ])
  })

  it('lit la tête au moment de reprogrammer, pas celle d’avant l’écriture', async () => {
    await service.reschedule(MILBEMAX.id)
    getTreatment.mockResolvedValue({ ...MILBEMAX, nextDueDate: '2026-11-20' })

    await service.reschedule(MILBEMAX.id)

    expect(programmes()).toEqual([
      new Date(2026, 10, 17, 9),
      new Date(2026, 10, 20, 9),
      new Date(2026, 10, 23, 9),
    ])
  })

  it('programme tous les rappels d’un traitement hebdomadaire en un seul appel au plugin', async () => {
    getTreatment.mockResolvedValue({ ...MILBEMAX, frequency: { value: 1, unit: 'week' } })

    await service.reschedule(MILBEMAX.id)

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0].length).toBeGreaterThan(10)
  })

  it('ne lit pas la base sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await service.reschedule(MILBEMAX.id)

    expect(getTreatment).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it.each([
    ['supprimé', null],
    ['arrêté', { ...MILBEMAX, stoppedOn: '2026-09-15' }],
  ])('retire tous les rappels d’un traitement %s, et les siens seulement', async (_etat, relu) => {
    getTreatment.mockResolvedValue({ ...MILBEMAX, frequency: { value: 1, unit: 'week' } })
    await service.reschedule(MILBEMAX.id)
    notifications.pending.set(OTHER, { key: OTHER, title: '', body: '', at: new Date() })
    expect(notifications.pending.size).toBeGreaterThan(10)

    getTreatment.mockResolvedValue(relu)
    await service.reschedule(MILBEMAX.id)

    expect([...notifications.pending.keys()]).toEqual([OTHER])
  })
})
