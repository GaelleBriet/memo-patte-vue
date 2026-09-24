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

let notifications: FakeNotifications
let getById: ReturnType<typeof vi.fn<(id: string) => Promise<Animal | null>>>
let service: TreatmentRemindersService

beforeEach(() => {
  notifications = createFakeNotifications()
  getById = vi.fn<(id: string) => Promise<Animal | null>>().mockResolvedValue(LUNA)
  service = createTreatmentRemindersService({
    animals: () => ({ getById }),
    notifications,
    t: i18n.global.t,
    now: () => new Date(2026, 8, 15, 12),
  })
})

describe('treatmentRemindersService', () => {
  it('reprogramme les rappels sur la prochaine échéance du traitement', async () => {
    await service.reschedule(MILBEMAX)

    expect(getById).toHaveBeenCalledWith(LUNA.id)
    expect(
      notifications.scheduleReminders.mock.calls.flatMap(([reminders]) =>
        reminders.map((reminder) => reminder.at),
      ),
    ).toEqual([new Date(2026, 9, 12, 9), new Date(2026, 9, 15, 9), new Date(2026, 9, 18, 9)])
  })

  it('programme tous les rappels d’un traitement hebdomadaire en un seul appel au plugin', async () => {
    await service.reschedule({ ...MILBEMAX, frequency: { value: 1, unit: 'week' } })

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0].length).toBeGreaterThan(10)
  })

  it('ne lit pas la base sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await service.reschedule(MILBEMAX)

    expect(getById).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('retire tous les rappels programmés d’un traitement supprimé, et les siens seulement', async () => {
    await service.reschedule({ ...MILBEMAX, frequency: { value: 1, unit: 'week' } })
    const other = `treatment:55555555-5555-4555-8555-555555555555:2026-10-01:due`
    notifications.pending.set(other, { key: other, title: '', body: '', at: new Date() })
    expect(notifications.pending.size).toBeGreaterThan(10)

    await service.cancel(MILBEMAX.id)

    expect([...notifications.pending.keys()]).toEqual([other])
  })
})
