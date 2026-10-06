// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { enqueueReminderTask } from '@/shared/domain/due-reminders-schedule'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import {
  createTreatmentRemindersService,
  type TreatmentRemindersService,
} from '../service/treatment-reminders.service'
import { dose, period, treatment } from './treatment-fixtures'

const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }

/** Tous les 3 mois, sans heure, première dose le 15 octobre. */
const MILBEMAX = treatment([
  period({ firstDueOn: '2026-10-15', frequency: { value: 3, unit: 'month' } }),
])
const ID = MILBEMAX.id

const OTHER = `treatment:55555555-5555-4555-8555-555555555555:2026-10-01::due`

let notifications: FakeNotifications
let getAnimal: ReturnType<typeof vi.fn<(id: string) => Promise<Animal | null>>>
let getWithHistory: ReturnType<typeof vi.fn<(id: string) => Promise<TreatmentWithHistory | null>>>
let settings: ReturnType<typeof vi.fn<() => Promise<CarnetReminderSettings>>>
let service: TreatmentRemindersService

function programmes(): Date[] {
  return [...notifications.pending.values()]
    .filter((reminder) => reminder.key.startsWith(`treatment:${ID}:`))
    .map((reminder) => reminder.at)
    .sort((a, b) => a.getTime() - b.getTime())
}

function withFirstDue(firstDueOn: string): TreatmentWithHistory {
  return treatment([period({ firstDueOn, frequency: { value: 3, unit: 'month' } })])
}

beforeEach(() => {
  notifications = createFakeNotifications()
  getAnimal = vi.fn<(id: string) => Promise<Animal | null>>().mockResolvedValue(LUNA)
  getWithHistory = vi
    .fn<(id: string) => Promise<TreatmentWithHistory | null>>()
    .mockResolvedValue(MILBEMAX)
  settings = vi.fn<() => Promise<CarnetReminderSettings>>().mockResolvedValue(SETTINGS)
  service = createTreatmentRemindersService({
    treatments: () => ({ getWithHistory }),
    animals: () => ({ getById: getAnimal }),
    settings,
    notifications,
    t: i18n.global.t,
    now: () => new Date(2026, 8, 15, 12),
  })
})

describe('treatmentRemindersService', () => {
  it('relit le traitement et son historique, puis programme les rappels du moteur', async () => {
    await service.reschedule(ID)

    expect(getWithHistory).toHaveBeenCalledWith(ID)
    expect(getAnimal).toHaveBeenCalledWith(LUNA.id)
    expect(programmes().slice(0, 3)).toEqual([
      new Date(2026, 9, 12, 9),
      new Date(2026, 9, 15, 9),
      new Date(2026, 9, 18, 9),
    ])
  })

  it('passe les réglages du carnet au plan', async () => {
    settings.mockResolvedValue({ ...SETTINGS, remindBeforeDue: false })

    await service.reschedule(ID)

    expect(programmes().slice(0, 2)).toEqual([new Date(2026, 9, 15, 9), new Date(2026, 9, 18, 9)])
  })

  it('lit l’historique au moment de reprogrammer, pas celui d’avant l’écriture', async () => {
    await service.reschedule(ID)
    getWithHistory.mockResolvedValue(withFirstDue('2026-11-20'))

    await service.reschedule(ID)

    expect(programmes()[0]).toEqual(new Date(2026, 10, 17, 9))
  })

  it('lit l’historique à son tour dans la file des rappels, pas à l’appel', async () => {
    let liberer = () => {}
    void enqueueReminderTask(() => new Promise<void>((resolve) => (liberer = resolve)))

    const reprogrammation = service.reschedule(ID)
    await new Promise((resolve) => setTimeout(resolve, 0))
    getWithHistory.mockResolvedValue(withFirstDue('2026-11-20'))
    liberer()
    await reprogrammation

    expect(programmes()[0]).toEqual(new Date(2026, 10, 17, 9))
  })

  it('programme tous les rappels d’un traitement quotidien en un seul appel au plugin', async () => {
    getWithHistory.mockResolvedValue(treatment([period({ firstDueOn: '2026-09-16' })]))

    await service.reschedule(ID)

    expect(notifications.scheduleReminders).toHaveBeenCalledOnce()
    expect(notifications.scheduleReminders.mock.calls[0]![0].length).toBeGreaterThan(10)
  })

  it('RA-19 : retire du volet la notification affichée de l’échéance que la prise a notée', async () => {
    const daily = period({ startsOn: '2026-09-14', firstDueOn: '2026-09-14', times: ['08:00'] })
    getWithHistory.mockResolvedValue(
      treatment([daily], [dose('2026-09-15', '2026-09-16', { dueTime: '08:00' })]),
    )
    const noted = `treatment:${ID}:2026-09-15:0800:due`
    const awaited = `treatment:${ID}:2026-09-14:0800:due`
    const legacy = `treatment:${ID}:2026-09-15:due`
    for (const key of [noted, awaited, legacy]) {
      notifications.pending.set(key, { key, title: '', body: '', at: new Date(2026, 8, 14, 8) })
    }

    await service.reschedule(ID)

    expect(notifications.removeDelivered).toHaveBeenCalledExactlyOnceWith([
      notifications.idOf(noted),
      notifications.idOf(legacy),
    ])
  })

  it('ne lit pas la base sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await service.reschedule(ID)

    expect(getWithHistory).not.toHaveBeenCalled()
    expect(notifications.scheduleReminders).not.toHaveBeenCalled()
  })

  it('garde les rappels en place quand l’historique ne se lit pas', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    await service.reschedule(ID)
    const before = programmes()
    getWithHistory.mockRejectedValue(new Error('base verrouillée'))

    await service.reschedule(ID)

    expect(programmes()).toEqual(before)
  })

  it.each([
    ['supprimé', null],
    ['arrêté', treatment([period({ firstDueOn: '2026-09-16', stoppedOn: '2026-09-15' })])],
    ['illisible (Q40)', treatment([period({ firstDueOn: '2026-02-30' })])],
  ])('retire tous les rappels d’un traitement %s, et les siens seulement', async (_etat, relu) => {
    getWithHistory.mockResolvedValue(treatment([period({ firstDueOn: '2026-09-16' })]))
    await service.reschedule(ID)
    notifications.pending.set(OTHER, { key: OTHER, title: '', body: '', at: new Date() })
    expect(notifications.pending.size).toBeGreaterThan(10)

    getWithHistory.mockResolvedValue(relu)
    await service.reschedule(ID)

    expect([...notifications.pending.keys()]).toEqual([OTHER])
  })
})
