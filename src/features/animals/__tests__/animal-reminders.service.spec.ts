// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import {
  createAnimalRemindersService,
  type AnimalRemindersService,
} from '../service/animal-reminders.service'

const LUNA = '11111111-1111-4111-8111-111111111111'
const RAGE = '22222222-2222-4222-8222-222222222222'
const MILBEMAX = '33333333-3333-4333-8333-333333333333'
const OTHER = '44444444-4444-4444-8444-444444444444'

let notifications: FakeNotifications
let rescheduleVaccination: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>
let rescheduleTreatment: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>
let service: AnimalRemindersService

function seed(...keys: string[]): void {
  for (const key of keys)
    notifications.pending.set(key, { key, title: '', body: '', at: new Date() })
}

beforeEach(() => {
  notifications = createFakeNotifications()
  rescheduleVaccination = vi.fn<(id: string) => Promise<void>>().mockResolvedValue()
  rescheduleTreatment = vi.fn<(id: string) => Promise<void>>().mockResolvedValue()
  service = createAnimalRemindersService({
    vaccinations: () => ({
      listByAnimal: async (animalId) => (animalId === LUNA ? [{ id: RAGE }] : []),
    }),
    treatments: () => ({
      listByAnimal: async (animalId) => (animalId === LUNA ? [{ id: MILBEMAX }] : []),
    }),
    vaccinationReminders: { reschedule: rescheduleVaccination },
    treatmentReminders: { reschedule: rescheduleTreatment },
    notifications,
  })
})

describe('animalRemindersService', () => {
  it('liste les soins de l’animal qui ont des rappels', async () => {
    await expect(service.entriesOf(LUNA)).resolves.toEqual([
      { kind: 'vaccination', id: RAGE },
      { kind: 'treatment', id: MILBEMAX },
    ])
  })

  it('retire ses rappels, en attente comme affichés, sans toucher aux autres', async () => {
    seed(
      `vaccination:${RAGE}:2026-10-15:before`,
      `treatment:${MILBEMAX}:2026-09-20:due`,
      `treatment:${OTHER}:2026-09-20:due`,
    )
    const shown = notifications.idOf(`treatment:${MILBEMAX}:2026-09-20:due`)

    await service.withdraw(LUNA)

    expect([...notifications.pending.keys()]).toEqual([`treatment:${OTHER}:2026-09-20:due`])
    expect(notifications.removeDelivered).toHaveBeenCalledWith(expect.arrayContaining([shown]))
  })

  it('annule les rappels d’une liste de soins lue plus tôt', async () => {
    seed(`vaccination:${RAGE}:2026-10-15:before`, `treatment:${OTHER}:2026-09-20:due`)

    await service.cancel([{ kind: 'vaccination', id: RAGE }])

    expect([...notifications.pending.keys()]).toEqual([`treatment:${OTHER}:2026-09-20:due`])
  })

  it('reprogramme chacun de ses soins', async () => {
    await service.reschedule(LUNA)

    expect(rescheduleVaccination).toHaveBeenCalledExactlyOnceWith(RAGE)
    expect(rescheduleTreatment).toHaveBeenCalledExactlyOnceWith(MILBEMAX)
  })
})
