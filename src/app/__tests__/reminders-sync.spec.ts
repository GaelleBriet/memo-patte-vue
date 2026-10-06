import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import type { Animal } from '@/features/animals/schema/animal.schema'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import { provideAnimalsRepository, useAnimalsStore } from '@/features/animals/store/animals.store'
import { dose, period, treatment } from '@/features/treatments/__tests__/treatment-fixtures'
import type { TreatmentWithHistory } from '@/features/treatments/repository/treatments.repository'
import type { TreatmentPeriodRecord } from '@/features/treatments/schema/treatment-period.schema'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  createFakeNotifications,
  type FakeNotifications,
} from '@/shared/__tests__/fake-notifications'
import { parseReminderKey } from '@/shared/domain/due-reminders'
import {
  carnetReminderSettings,
  enqueueReminderTask,
  markRebuilt,
  MAX_SCHEDULED_REMINDERS,
  replaceDueReminders,
  withOneRetry,
} from '@/shared/domain/due-reminders-schedule'
import { MAX_REMINDERS_PER_CARE, type CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { REMINDER_DONE_ACTION_TYPE, type Reminder } from '@/core/notifications'
import { createRemindersSync, installRemindersSync } from '../reminders-sync'

const STAMP = '2026-09-01T09:00:00.000Z'
const NOW = new Date(2026, 8, 15, 12)

function animal(id: string, name: string): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    photoPath: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo')
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna')
const GONE = '99999999-9999-4999-8999-999999999999'
const MILBEMAX_ID = '44444444-4444-4444-8444-444444444444'

function vaccination(id: string, animalId: string, dueDate: string | null): Vaccination {
  return {
    id,
    animalId,
    name: 'CHPPi',
    lastInjectionDate: '2025-10-15',
    dueDate,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

/** Milbemax de Luna, tous les 3 mois sans heure, première dose le 17 septembre, sauf mention. */
function milbemax(
  overrides: Partial<TreatmentPeriodRecord> = {},
  id = MILBEMAX_ID,
  doses: Parameters<typeof treatment>[1] = [],
): TreatmentWithHistory {
  const periods = [
    period({ firstDueOn: '2026-09-17', frequency: { value: 3, unit: 'month' }, ...overrides }),
  ]
  return { ...treatment(periods, doses), id, animalId: LUNA.id, name: 'Milbemax' }
}

const MILBEMAX = milbemax()
const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }

let notifications: FakeNotifications
let list: ReturnType<typeof vi.fn<() => Promise<Animal[]>>>
let listVaccinations: ReturnType<typeof vi.fn<() => Promise<Vaccination[]>>>
let listTreatments: ReturnType<typeof vi.fn<() => Promise<TreatmentWithHistory[]>>>
let getSettings: ReturnType<typeof vi.fn<() => Promise<CarnetReminderSettings>>>

function sync() {
  return createRemindersSync({
    animals: () => ({ list }),
    vaccinations: () => ({ listAll: listVaccinations }),
    treatments: () => ({ listAllWithHistory: listTreatments }),
    carnetSettings: () => ({ get: getSettings }),
    notifications,
    t: i18n.global.t,
    now: () => NOW,
  })
}

function scheduledNow(): Reminder[] {
  return notifications.rescheduleAll.mock.calls.at(-1)?.[0] ?? []
}

/** `kind jour heure moment` d'une clé. */
function slot(key: string): string {
  const parsed = parseReminderKey(key)!
  return `${key.split(':')[0]} ${parsed.dueDate} ${parsed.dueTime ?? '-'} ${parsed.moment}`
}

beforeEach(() => {
  notifications = createFakeNotifications()
  list = vi.fn<() => Promise<Animal[]>>().mockResolvedValue([MILO, LUNA])
  listVaccinations = vi.fn<() => Promise<Vaccination[]>>().mockResolvedValue([])
  listTreatments = vi.fn<() => Promise<TreatmentWithHistory[]>>().mockResolvedValue([])
  getSettings = vi.fn<() => Promise<CarnetReminderSettings>>().mockResolvedValue(SETTINGS)
})

afterEach(() => {
  vi.restoreAllMocks()
  provideAnimalsRepository(null)
  markRebuilt()
})

const noGrant = () => () => {}

function uuid(index: number): string {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`
}

describe('syncAllReminders', () => {
  it('reconstruit d’un bloc les rappels de tous les vaccins et traitements, depuis le moteur', async () => {
    const chppi = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15')
    listVaccinations.mockResolvedValue([
      chppi,
      vaccination('55555555-5555-4555-8555-555555555555', MILO.id, null),
    ])
    listTreatments.mockResolvedValue([MILBEMAX])

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledTimes(1)
    expect(
      scheduledNow()
        .slice(0, 6)
        .map(({ key, title }) => [slot(key), title.replace(/\s/gu, ' ')]),
    ).toEqual([
      ['treatment 2026-09-17 - due', 'Milbemax de Luna aujourd’hui'],
      ['treatment 2026-09-17 - overdue', 'Milbemax de Luna en retard de 3 jours'],
      ['vaccination 2026-10-15 - before', 'CHPPi de Milo dans 2 semaines'],
      ['vaccination 2026-10-15 - due', 'CHPPi de Milo aujourd’hui'],
      ['vaccination 2026-10-15 - overdue', 'CHPPi de Milo en retard de 3 jours'],
      ['treatment 2026-12-17 - before', 'Milbemax de Luna dans 3 jours'],
    ])
  })

  it('plus de fenêtre de 60 jours : un traitement trimestriel est programmé jusqu’au plafond par soin', async () => {
    listTreatments.mockResolvedValue([MILBEMAX])

    await sync()()

    const reminders = scheduledNow()
    expect(reminders).toHaveLength(MAX_REMINDERS_PER_CARE)
    expect(reminders.at(-1)!.at.getFullYear()).toBeGreaterThan(2030)
    expect(reminders.at(-1)!.body).toContain('Pour continuer à recevoir les rappels de Luna')
  })

  it('T6 : lit les réglages du carnet et les passe au plan', async () => {
    getSettings.mockResolvedValue({ vaccineReminderTime: '18:30', remindBeforeDue: false })
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])

    await sync()()

    expect(scheduledNow().map(({ key, at }) => [slot(key), at])).toEqual([
      ['vaccination 2026-10-15 - due', new Date(2026, 9, 15, 18, 30)],
      ['vaccination 2026-10-15 - overdue', new Date(2026, 9, 18, 18, 30)],
    ])
  })

  it('reprogramme tout quand les réglages du carnet changent', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    notifications.rescheduleAll.mockClear()
    getSettings.mockResolvedValue({ ...SETTINGS, vaccineReminderTime: '07:00' })

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
    expect(scheduledNow().every(({ at }) => at.getHours() === 7)).toBe(true)
  })

  it('ne touche à rien quand les rappels en attente sont déjà ceux à programmer', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    listTreatments.mockResolvedValue([MILBEMAX])
    await sync()()
    notifications.rescheduleAll.mockClear()

    await sync()()

    expect(notifications.rescheduleAll).not.toHaveBeenCalled()
  })

  it('reprogramme les mêmes rappels quand l’accès aux rappels précis change', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    const inexact = notifications.rescheduleAll.mock.calls[0]?.[0]

    notifications.canScheduleExact.mockResolvedValue(true)
    await sync()()
    notifications.canScheduleExact.mockResolvedValue(false)
    await sync()()

    expect(notifications.rescheduleAll.mock.calls.map(([reminders]) => reminders)).toEqual([
      inexact,
      inexact,
      inexact,
    ])
  })

  it('reprogramme quand un texte en attente diffère', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    notifications.rescheduleAll.mockClear()
    list.mockResolvedValue([{ ...MILO, name: 'Milou' }, LUNA])

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('reprogramme avec le bouton « C’est fait » les rappels posés sans lui avant la mise à jour', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    for (const [key, { actionTypeId: _button, ...withoutButton }] of notifications.pending) {
      notifications.pending.set(key, withoutButton)
    }
    notifications.rescheduleAll.mockClear()

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
    expect(
      [...notifications.pending.values()].map(({ key, actionTypeId }) => [
        key.split(':').at(-1),
        actionTypeId,
      ]),
    ).toEqual([
      ['before', undefined],
      ['due', REMINDER_DONE_ACTION_TYPE],
      ['overdue', REMINDER_DONE_ACTION_TYPE],
    ])
  })

  it('B4 : annule les rappels restés sous l’ancienne clé sans heure', async () => {
    listTreatments.mockResolvedValue([milbemax({ times: ['20:00'] })])
    const legacy = `treatment:${MILBEMAX_ID}:2026-09-17:due`
    notifications.pending.set(legacy, {
      key: legacy,
      title: '',
      body: '',
      at: new Date(2026, 8, 17, 9),
    })

    await sync()()

    expect(notifications.pending.has(legacy)).toBe(false)
    expect(notifications.pending.has(`treatment:${MILBEMAX_ID}:2026-09-17:2000:due`)).toBe(true)
  })

  it('RA-19 : retire du volet les notifications affichées des échéances notées, et d’elles seules', async () => {
    const carre = {
      ...vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2027-09-14'),
      lastInjectionDate: '2026-09-14',
    }
    listVaccinations.mockResolvedValue([carre])
    listTreatments.mockResolvedValue([
      milbemax(
        {
          startsOn: '2026-09-14',
          firstDueOn: '2026-09-14',
          frequency: { value: 1, unit: 'day' },
          times: ['08:00', '20:00'],
        },
        MILBEMAX_ID,
        [
          dose('2026-09-14', '2026-09-15', { dueTime: '08:00' }),
          dose('2026-09-15', '2026-09-16', { dueTime: '08:00', status: 'missed', givenOn: null }),
        ],
      ),
    ])
    const shown = (key: string) => ({ key, title: '', body: '', at: new Date(2026, 8, 15, 8) })
    const vaccineNoted = `vaccination:${carre.id}:2026-09-14::due`
    const doseGiven = `treatment:${MILBEMAX_ID}:2026-09-14:0800:due`
    const doseMissed = `treatment:${MILBEMAX_ID}:2026-09-15:0800:due`
    const awaited = `treatment:${MILBEMAX_ID}:2026-09-14:2000:due`
    const deleted = `vaccination:${GONE}:2026-09-14::due`
    for (const key of [vaccineNoted, doseGiven, doseMissed, awaited, deleted]) {
      notifications.pending.set(key, shown(key))
    }

    await sync()()

    expect(notifications.removeDelivered).toHaveBeenCalledExactlyOnceWith(
      [vaccineNoted, doseGiven, doseMissed].map(notifications.idOf),
    )
  })

  it('reconstruit les rappels même quand le volet ne se laisse pas vider', async () => {
    const carre = {
      ...vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2027-09-14'),
      lastInjectionDate: '2026-09-14',
    }
    listVaccinations.mockResolvedValue([carre])
    const noted = `vaccination:${carre.id}:2026-09-14:due`
    notifications.pending.set(noted, {
      key: noted,
      title: '',
      body: '',
      at: new Date(2026, 8, 14, 9),
    })
    notifications.removeDelivered.mockRejectedValue(new Error('plugin'))
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('ignore les entrées dont l’animal n’est plus en base', async () => {
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', GONE, '2026-10-15'),
    ])
    const stale = 'vaccination:22222222-2222-4222-8222-222222222222:2026-10-15:due'
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date(2026, 9, 15) })

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledWith([])
    expect(notifications.pending.size).toBe(0)
  })

  it.each([
    ['arrêté', milbemax({ stoppedOn: '2026-09-14' })],
    [
      'fini par sa date de fin',
      milbemax(
        { startsOn: '2026-06-17', firstDueOn: '2026-06-17', endsOn: '2026-09-01' },
        MILBEMAX_ID,
        [dose('2026-06-17', '2026-09-17')],
      ),
    ],
  ])('ne fait pas resonner un traitement %s', async (_etat, relu) => {
    listTreatments.mockResolvedValue([relu])
    const stale = `treatment:${MILBEMAX_ID}:2026-12-17:due`
    notifications.pending.set(stale, {
      key: stale,
      title: '',
      body: '',
      at: new Date(2026, 11, 17),
    })

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledWith([])
    expect(notifications.pending.size).toBe(0)
  })

  it('garde au plus 400 rappels : le jour même de chaque première échéance, puis les plus proches', async () => {
    const count = Math.ceil(MAX_SCHEDULED_REMINDERS / 3) + 1
    listVaccinations.mockResolvedValue(
      Array.from({ length: count }, (_, index) =>
        vaccination(uuid(index), MILO.id, index === 0 ? '2026-11-10' : '2026-10-15'),
      ),
    )

    await sync()()

    const scheduled = scheduledNow()
    const keys = scheduled.map(({ key }) => key)
    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(keys).toContain(`vaccination:${uuid(0)}:2026-11-10::due`)
    expect(keys).not.toContain(`vaccination:${uuid(0)}:2026-11-10::overdue`)
    expect(scheduled.map(({ at }) => at.getTime())).toEqual(
      scheduled.map(({ at }) => at.getTime()).sort((a, b) => a - b),
    )
  })

  it('respecte le plafond avec beaucoup de traitements quotidiens, sans perdre l’échéance lointaine', async () => {
    listTreatments.mockResolvedValue([
      milbemax({ firstDueOn: '2026-11-10', frequency: { value: 1, unit: 'week' } }, uuid(0)),
      ...Array.from({ length: 20 }, (_, index) =>
        milbemax(
          { firstDueOn: '2026-09-16', frequency: { value: 1, unit: 'day' } },
          uuid(index + 1),
        ),
      ),
    ])

    await sync()()

    const scheduled = scheduledNow()
    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(
      scheduled.map(({ key }) => key).filter((key) => key.startsWith(`treatment:${uuid(0)}:`)),
    ).toEqual([
      `treatment:${uuid(0)}:2026-11-10::before`,
      `treatment:${uuid(0)}:2026-11-10::due`,
      `treatment:${uuid(0)}:2026-11-10::overdue`,
    ])
  })

  it('Q40 : un traitement illisible n’a pas de rappel et ne prive pas les autres', async () => {
    const chppi = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15')
    listVaccinations.mockResolvedValue([chppi])
    listTreatments.mockResolvedValue([
      milbemax({ firstDueOn: '2026-02-30' }),
      milbemax({ frequency: { value: 10_000_000, unit: 'month' } }, uuid(1)),
    ])

    await sync()()

    expect(scheduledNow().map(({ key }) => slot(key))).toEqual([
      'vaccination 2026-10-15 - before',
      'vaccination 2026-10-15 - due',
      'vaccination 2026-10-15 - overdue',
    ])
  })

  it('saute la ligne dont les rappels ne se calculent pas, sans perdre les autres', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const chppi = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15')
    listVaccinations.mockResolvedValue([chppi])
    listTreatments.mockResolvedValue([{ ...MILBEMAX, periods: null as never }])

    await sync()()

    expect(scheduledNow()).toHaveLength(3)
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining('traitement'),
      MILBEMAX_ID,
      expect.anything(),
    )
  })

  it('programme la première échéance de chaque entrée, même lointaine, avant de remplir au plus proche', async () => {
    const rage = vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2027-05-15')
    listVaccinations.mockResolvedValue([rage])
    listTreatments.mockResolvedValue(
      Array.from({ length: 10 }, (_, index) =>
        milbemax(
          {
            firstDueOn: '2026-09-16',
            frequency: { value: 1, unit: 'day' },
            times: ['08:00', '20:00'],
          },
          uuid(index),
        ),
      ),
    )

    await sync()()

    const scheduled = scheduledNow()
    expect(scheduled).toHaveLength(MAX_SCHEDULED_REMINDERS)
    expect(scheduled.map(({ key }) => key)).toContain(`vaccination:${rage.id}:2027-05-15::due`)
  })

  it('attend son tour dans la file des opérations de rappel', async () => {
    let release: () => void = () => {}
    const pending = enqueueReminderTask(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        }),
    )

    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    const syncing = sync()()
    await Promise.resolve()
    expect(notifications.checkPermission).not.toHaveBeenCalled()

    release()
    await Promise.all([pending, syncing])
    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('annule ce qui reste programmé quand la permission n’est plus accordée, sans lire le carnet', async () => {
    const stale = 'vaccination:22222222-2222-4222-8222-222222222222:2026-10-15:due'
    notifications.pending.set(stale, { key: stale, title: '', body: '', at: new Date(2026, 9, 15) })
    notifications.checkPermission.mockResolvedValue(false)

    await sync()()

    expect(list).not.toHaveBeenCalled()
    expect(notifications.rescheduleAll).toHaveBeenCalledExactlyOnceWith([])
    expect(notifications.pending.size).toBe(0)
  })

  it('#486 : rejoue aussitôt une fois la programmation ratée', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    notifications.rescheduleAll.mockRejectedValueOnce(new Error('quota d’alarmes'))

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledTimes(2)
    expect(notifications.pending.size).toBe(3)
  })

  it('#486 : ratée deux fois, tout est reconstruit à la synchro suivante', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    notifications.rescheduleAll.mockRejectedValueOnce(new Error('plugin'))
    notifications.rescheduleAll.mockRejectedValueOnce(new Error('plugin'))

    await sync()()
    expect(notifications.pending.size).toBe(0)

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledTimes(3)
    expect(notifications.pending.size).toBe(3)
  })

  it('#486 : après l’échec d’un soin, reprogramme tout même quand l’attente paraît à jour', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    await withOneRetry(() => Promise.reject(new Error('plugin')))
    notifications.rescheduleAll.mockClear()

    await sync()()
    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('#486 : une synchro qui échoue avant de reprogrammer garde la demande de tout reconstruire', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    listVaccinations.mockResolvedValue([
      vaccination('22222222-2222-4222-8222-222222222222', MILO.id, '2026-10-15'),
    ])
    await sync()()
    await withOneRetry(() => Promise.reject(new Error('plugin')))
    list.mockRejectedValueOnce(new Error('base indisponible'))
    await sync()()
    notifications.rescheduleAll.mockClear()

    await sync()()

    expect(notifications.rescheduleAll).toHaveBeenCalledOnce()
  })

  it('ne lève pas quand la base ou le plugin échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    list.mockRejectedValue(new Error('base indisponible'))

    await expect(sync()()).resolves.toBeUndefined()
    expect(notifications.rescheduleAll).not.toHaveBeenCalled()
  })
})

describe('installRemindersSync', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('synchronise tout quand la permission est accordée, jusqu’à la désinstallation', () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
    const grantListeners = new Set<() => void>()
    const onGranted = (listener: () => void) => {
      grantListeners.add(listener)
      return () => grantListeners.delete(listener)
    }

    const uninstall = installRemindersSync(syncAll, onGranted)
    syncAll.mockClear()

    for (const listener of grantListeners) listener()
    expect(syncAll).toHaveBeenCalledOnce()

    uninstall()
    expect(grantListeners.size).toBe(0)
  })

  it('T6 : donne les réglages du carnet aux rappels d’un soin, jusqu’à la désinstallation', async () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
    const settings = { vaccineReminderTime: '18:30', remindBeforeDue: false }

    const uninstall = installRemindersSync(syncAll, noGrant, async () => settings)
    await expect(carnetReminderSettings()).resolves.toEqual(settings)

    uninstall()
    await expect(carnetReminderSettings()).resolves.toEqual(SETTINGS)
  })

  it('branche la synchro complète demandée quand le plafond est atteint', async () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
    const uninstall = installRemindersSync(syncAll, noGrant)
    syncAll.mockClear()
    const pending = new Map<string, Reminder>()
    for (let index = 0; index < MAX_SCHEDULED_REMINDERS; index += 1) {
      const key = `vaccination:${index}:x:due`
      pending.set(key, { key, title: '', body: '', at: new Date(2099, 0, 1) })
    }
    notifications.pending.clear()
    for (const [key, value] of pending) notifications.pending.set(key, value)

    const entry = { kind: 'treatment' as const, id: MILBEMAX_ID }
    await replaceDueReminders(notifications, entry, () => ({
      care: {
        entry,
        reminders: [
          {
            key: `treatment:${MILBEMAX_ID}:2026-10-15::due`,
            title: '',
            body: '',
            at: new Date(2098, 0, 1),
          },
        ],
        complete: true,
        relay: '',
      },
      isNoted: () => false,
    }))
    await enqueueReminderTask(async () => {})

    expect(syncAll).toHaveBeenCalledOnce()
    uninstall()
  })

  it('synchronise au démarrage puis à chaque retour au premier plan', () => {
    const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()

    const uninstall = installRemindersSync(syncAll, noGrant)
    expect(syncAll).toHaveBeenCalledTimes(1)

    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)

    uninstall()
    simulateWebResume()
    expect(syncAll).toHaveBeenCalledTimes(2)
  })
})

it('resynchronise après la modification d’un animal, pour que son prénom suive', async () => {
  setActivePinia(createPinia())
  const renamed = { ...MILO, name: 'Milou' }
  provideAnimalsRepository(
    () =>
      ({
        getById: async () => MILO,
        update: async () => renamed,
        list: async () => [renamed],
      }) as unknown as AnimalsRepository,
  )
  const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
  const uninstall = installRemindersSync(syncAll, noGrant)
  syncAll.mockClear()

  await useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' })
  expect(syncAll).toHaveBeenCalledOnce()

  uninstall()
  await useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' })
  expect(syncAll).toHaveBeenCalledOnce()
})

it('ne resynchronise pas quand la modification d’un animal échoue', async () => {
  setActivePinia(createPinia())
  provideAnimalsRepository(
    () =>
      ({
        getById: async () => MILO,
        update: async () => {
          throw new Error('base verrouillée')
        },
        list: async () => [MILO],
      }) as unknown as AnimalsRepository,
  )
  const syncAll = vi.fn<() => Promise<void>>().mockResolvedValue()
  const uninstall = installRemindersSync(syncAll, noGrant)
  syncAll.mockClear()

  await expect(
    useAnimalsStore().update(MILO.id, { name: 'Milou', species: 'dog' }),
  ).rejects.toThrow('base verrouillée')

  expect(syncAll).not.toHaveBeenCalled()
  uninstall()
})
