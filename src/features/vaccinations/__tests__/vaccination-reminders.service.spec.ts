// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/animal.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import type { Vaccination } from '../vaccination.schema'
import {
  createVaccinationRemindersService,
  type VaccinationRemindersService,
} from '../vaccination-reminders.service'

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const CHPPI: Vaccination = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: MILO.id,
  name: 'CHPPi',
  lastInjectionDate: '2025-10-15',
  dueDate: '2026-10-15',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

let notifications: FakeNotifications
let getById: ReturnType<typeof vi.fn<(id: string) => Promise<Animal | null>>>
let service: VaccinationRemindersService

beforeEach(() => {
  notifications = createFakeNotifications()
  getById = vi.fn<(id: string) => Promise<Animal | null>>().mockResolvedValue(MILO)
  service = createVaccinationRemindersService({
    animals: () => ({ getById }),
    notifications,
    t: i18n.global.t,
    now: () => new Date(2026, 8, 15, 12),
  })
})

describe('vaccinationRemindersService', () => {
  it('reprogramme les rappels du vaccin avec le prénom de son animal', async () => {
    const stale = `vaccination:${CHPPI.id}:2026-09-20:due`
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date() })

    await service.reschedule(CHPPI)

    expect(getById).toHaveBeenCalledWith(MILO.id)
    expect([...notifications.pending.keys()]).toEqual([
      `vaccination:${CHPPI.id}:2026-10-15:before`,
      `vaccination:${CHPPI.id}:2026-10-15:due`,
      `vaccination:${CHPPI.id}:2026-10-15:overdue`,
    ])
    expect(notifications.scheduleReminder.mock.calls.map(([reminder]) => reminder.title)).toEqual([
      'Vaccin CHPPi de Milo dans 3 jours',
      'Vaccin CHPPi de Milo aujourd’hui',
      'Vaccin CHPPi de Milo en retard de 3 jours',
    ])
  })

  it('annule sans reprogrammer quand le rappel du vaccin est retiré', async () => {
    const stale = `vaccination:${CHPPI.id}:2026-10-15:due`
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date() })

    await service.reschedule({ ...CHPPI, dueDate: null })

    expect(notifications.pending.size).toBe(0)
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne programme rien quand l’échéance tombe au-delà de la fenêtre de 60 jours', async () => {
    await service.reschedule({ ...CHPPI, dueDate: '2027-10-15' })

    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne programme rien quand l’animal n’existe plus', async () => {
    getById.mockResolvedValue(null)

    await service.reschedule(CHPPI)

    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne lit pas la base sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await service.reschedule(CHPPI)

    expect(getById).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('annule les rappels d’un vaccin supprimé', async () => {
    await service.reschedule(CHPPI)

    await service.cancel(CHPPI.id)

    expect(notifications.cancelReminder).toHaveBeenCalledTimes(3)
    expect(notifications.pending.size).toBe(0)
  })
})
