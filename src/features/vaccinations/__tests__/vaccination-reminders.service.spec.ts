// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import type { Vaccination } from '../schema/vaccination.schema'
import {
  createVaccinationRemindersService,
  type VaccinationRemindersService,
} from '../service/vaccination-reminders.service'

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
let getVaccination: ReturnType<typeof vi.fn<(id: string) => Promise<Vaccination | null>>>
let service: VaccinationRemindersService

beforeEach(() => {
  notifications = createFakeNotifications()
  getById = vi.fn<(id: string) => Promise<Animal | null>>().mockResolvedValue(MILO)
  getVaccination = vi.fn<(id: string) => Promise<Vaccination | null>>().mockResolvedValue(CHPPI)
  service = createVaccinationRemindersService({
    vaccinations: () => ({ getById: getVaccination }),
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

    await service.reschedule(CHPPI.id)

    expect(getVaccination).toHaveBeenCalledWith(CHPPI.id)
    expect(getById).toHaveBeenCalledWith(MILO.id)
    expect([...notifications.pending.keys()]).toEqual([
      `vaccination:${CHPPI.id}:2026-10-15:before`,
      `vaccination:${CHPPI.id}:2026-10-15:due`,
      `vaccination:${CHPPI.id}:2026-10-15:overdue`,
    ])
    expect(
      notifications.scheduleReminders.mock.calls.flatMap(([reminders]) =>
        reminders.map((reminder) => reminder.title),
      ),
    ).toEqual([
      'CHPPi de Milo dans 3 jours',
      'CHPPi de Milo aujourd’hui',
      'CHPPi de Milo en retard de 3 jours',
    ])
  })

  it('annule sans reprogrammer quand le rappel du vaccin est retiré', async () => {
    const stale = `vaccination:${CHPPI.id}:2026-10-15:due`
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date() })

    getVaccination.mockResolvedValue({ ...CHPPI, dueDate: null })

    await service.reschedule(CHPPI.id)

    expect(notifications.pending.size).toBe(0)
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('programme les trois rappels d’un vaccin dont l’échéance est dans huit mois', async () => {
    getVaccination.mockResolvedValue({ ...CHPPI, dueDate: '2027-05-15' })

    await service.reschedule(CHPPI.id)

    expect([...notifications.pending.keys()]).toEqual([
      `vaccination:${CHPPI.id}:2027-05-15:before`,
      `vaccination:${CHPPI.id}:2027-05-15:due`,
      `vaccination:${CHPPI.id}:2027-05-15:overdue`,
    ])
  })

  it('ne programme rien quand l’animal n’existe plus', async () => {
    getById.mockResolvedValue(null)

    await service.reschedule(CHPPI.id)

    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('ne lit pas la base sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await service.reschedule(CHPPI.id)

    expect(getVaccination).not.toHaveBeenCalled()
    expect(getById).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('annule les rappels d’un vaccin supprimé, relu au moment de reprogrammer', async () => {
    await service.reschedule(CHPPI.id)
    getVaccination.mockResolvedValue(null)

    await service.reschedule(CHPPI.id)

    expect(notifications.cancelReminders.mock.calls.at(-1)?.[0]).toHaveLength(3)
    expect(notifications.pending.size).toBe(0)
  })
})
