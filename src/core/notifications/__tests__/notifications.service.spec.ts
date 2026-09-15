import { beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalNotifications } from '@capacitor/local-notifications'
import type { Channel, LocalNotificationsPlugin } from '@capacitor/local-notifications'

import {
  cancelReminders,
  checkPermission,
  listScheduled,
  requestPermission,
  rescheduleAll,
  SCHEDULE_BATCH_SIZE,
  scheduleReminder,
  scheduleReminders,
} from '../notifications.service'
import { reminderNotificationId, type Reminder } from '../reminder'
import { REMINDERS_CHANNEL_ID } from '../reminders-channel'

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    schedule: vi.fn<LocalNotificationsPlugin['schedule']>(),
    cancel: vi.fn<LocalNotificationsPlugin['cancel']>(),
    getPending: vi.fn<LocalNotificationsPlugin['getPending']>(),
    checkPermissions: vi.fn<LocalNotificationsPlugin['checkPermissions']>(),
    requestPermissions: vi.fn<LocalNotificationsPlugin['requestPermissions']>(),
    createChannel: vi.fn<LocalNotificationsPlugin['createChannel']>(),
    listChannels: vi.fn<LocalNotificationsPlugin['listChannels']>(),
  },
}))

const schedule = vi.mocked(LocalNotifications.schedule)
const cancel = vi.mocked(LocalNotifications.cancel)
const getPending = vi.mocked(LocalNotifications.getPending)
const checkPermissions = vi.mocked(LocalNotifications.checkPermissions)
const requestPermissions = vi.mocked(LocalNotifications.requestPermissions)
const createChannel = vi.mocked(LocalNotifications.createChannel)
const listChannels = vi.mocked(LocalNotifications.listChannels)

const rabies: Reminder = {
  key: 'vaccination:11111111-1111-4111-8111-111111111111',
  title: 'Rappel de vaccin',
  body: 'Rage — Pilou',
  at: new Date('2026-10-01T09:00:00.000Z'),
}

const dewormer: Reminder = {
  key: 'treatment:22222222-2222-4222-8222-222222222222',
  title: 'Vermifuge',
  body: 'Mistigri',
  at: new Date('2026-11-15T08:30:00.000Z'),
}

beforeEach(() => {
  vi.clearAllMocks()
  schedule.mockResolvedValue({ notifications: [] })
  cancel.mockResolvedValue()
  getPending.mockResolvedValue({ notifications: [] })
  checkPermissions.mockResolvedValue({ display: 'granted' })
  createChannel.mockResolvedValue()
  listChannels.mockResolvedValue({ channels: [] })
})

function remindersChannelImportance(importance: Channel['importance']): void {
  listChannels.mockResolvedValue({
    channels: [
      { id: 'default', name: 'Default', importance: 3 },
      { id: REMINDERS_CHANNEL_ID, name: 'Rappels', importance },
    ],
  })
}

const NOT_GRANTED = ['prompt', 'prompt-with-rationale', 'denied'] as const

describe('reminderNotificationId', () => {
  it('renvoie le même identifiant pour la même clé', () => {
    expect(reminderNotificationId(rabies.key)).toBe(reminderNotificationId(rabies.key))
  })

  it('renvoie un entier strictement positif tenant sur 32 bits signés', () => {
    const keys = ['', 'a', rabies.key, dewormer.key, 'weight:3', 'é🐶']

    for (const key of keys) {
      const id = reminderNotificationId(key)
      expect(Number.isInteger(id)).toBe(true)
      expect(id).toBeGreaterThan(0)
      expect(id).toBeLessThanOrEqual(2147483647)
    }
  })

  it('renvoie des identifiants distincts sur un échantillon de clés distinctes', () => {
    const keys = Array.from({ length: 500 }, (_, index) => `vaccination:${index}`).concat(
      Array.from({ length: 500 }, (_, index) => `treatment:${index}`),
    )

    const ids = keys.map(reminderNotificationId)

    expect(new Set(ids).size).toBe(keys.length)
    expect(Math.min(...ids)).toBeGreaterThan(0)
  })
})

describe('scheduleReminder', () => {
  it('convertit un Reminder en notification du plugin', async () => {
    await scheduleReminder(rabies)

    expect(schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: reminderNotificationId(rabies.key),
          title: rabies.title,
          body: rabies.body,
          schedule: { at: rabies.at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: REMINDERS_CHANNEL_ID,
          extra: { key: rabies.key },
        },
      ],
    })
  })

  it('crée le canal « Rappels » avant de programmer', async () => {
    await scheduleReminder(rabies)

    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: REMINDERS_CHANNEL_ID, name: 'Rappels', importance: 3 }),
    )
    expect(createChannel.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      schedule.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('programme quand même là où les canaux n’existent pas', async () => {
    createChannel.mockRejectedValue(new Error('Not implemented on web.'))

    await scheduleReminder(rabies)

    expect(schedule).toHaveBeenCalledOnce()
  })

  it('ne programme jamais d’alarme exacte', async () => {
    await scheduleReminder(rabies)

    const notification = schedule.mock.calls[0]?.[0].notifications[0]
    expect(notification?.isExactNotification).toBe(false)
    expect(notification?.isExactMandatory).toBeUndefined()
  })
})

describe('scheduleReminder sans permission', () => {
  it.each(NOT_GRANTED)(
    'ne programme rien quand la permission est « %s », pour ne jamais ouvrir la popup système',
    async (display) => {
      checkPermissions.mockResolvedValue({ display })

      await scheduleReminder(rabies)

      expect(schedule).not.toHaveBeenCalled()
      expect(requestPermissions).not.toHaveBeenCalled()
    },
  )

  it('ne programme rien quand le canal des rappels est coupé dans les réglages', async () => {
    remindersChannelImportance(0)

    await scheduleReminder(rabies)

    expect(schedule).not.toHaveBeenCalled()
  })
})

describe('scheduleReminders', () => {
  it('crée le canal « Rappels » avant de programmer', async () => {
    await scheduleReminders([rabies, dewormer])

    expect(createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: REMINDERS_CHANNEL_ID }),
    )
    expect(createChannel.mock.invocationCallOrder[0] ?? Infinity).toBeLessThan(
      schedule.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('programme tous les rappels en un seul appel au plugin, après une seule vérification', async () => {
    await scheduleReminders([rabies, dewormer])

    expect(checkPermissions).toHaveBeenCalledOnce()
    expect(schedule).toHaveBeenCalledExactlyOnceWith({
      notifications: [
        {
          id: reminderNotificationId(rabies.key),
          title: rabies.title,
          body: rabies.body,
          schedule: { at: rabies.at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: REMINDERS_CHANNEL_ID,
          extra: { key: rabies.key },
        },
        {
          id: reminderNotificationId(dewormer.key),
          title: dewormer.title,
          body: dewormer.body,
          schedule: { at: dewormer.at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: REMINDERS_CHANNEL_ID,
          extra: { key: dewormer.key },
        },
      ],
    })
  })

  it('n’appelle pas le plugin pour une liste vide', async () => {
    await scheduleReminders([])

    expect(checkPermissions).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it.each(NOT_GRANTED)(
    'ne programme rien quand la permission est « %s », pour ne jamais ouvrir la popup système',
    async (display) => {
      checkPermissions.mockResolvedValue({ display })

      await scheduleReminders([rabies, dewormer])

      expect(schedule).not.toHaveBeenCalled()
      expect(requestPermissions).not.toHaveBeenCalled()
    },
  )
})

describe('cancelReminders', () => {
  it('annule en un seul appel les notifications dérivées des clés', async () => {
    await cancelReminders([rabies.key, dewormer.key])

    expect(cancel).toHaveBeenCalledExactlyOnceWith({
      notifications: [
        { id: reminderNotificationId(rabies.key) },
        { id: reminderNotificationId(dewormer.key) },
      ],
    })
  })

  it('n’appelle pas le plugin pour une liste vide', async () => {
    await cancelReminders([])

    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('listScheduled', () => {
  it('restitue les rappels en attente avec leur clé métier', async () => {
    getPending.mockResolvedValue({
      notifications: [
        {
          id: reminderNotificationId(rabies.key),
          title: rabies.title,
          body: rabies.body,
          schedule: { at: rabies.at },
          extra: { key: rabies.key },
        },
      ],
    })

    await expect(listScheduled()).resolves.toEqual([
      {
        id: reminderNotificationId(rabies.key),
        key: rabies.key,
        title: rabies.title,
        body: rabies.body,
        at: rabies.at,
      },
    ])
  })

  it('tolère une notification programmée sans clé métier', async () => {
    getPending.mockResolvedValue({
      notifications: [{ id: 42, title: 'Titre', body: 'Corps' }],
    })

    await expect(listScheduled()).resolves.toEqual([
      { id: 42, key: undefined, title: 'Titre', body: 'Corps', at: undefined },
    ])
  })
})

describe('rescheduleAll', () => {
  it('programme la liste fournie puis annule ce qu’elle ne reprend pas', async () => {
    getPending.mockResolvedValue({
      notifications: [
        { id: 1, title: 'Ancien', body: 'Ancien' },
        { id: 2, title: 'Ancien', body: 'Ancien' },
      ],
    })

    await rescheduleAll([rabies, dewormer])

    expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }, { id: 2 }] })
    expect(schedule).toHaveBeenCalledWith({
      notifications: [
        {
          id: reminderNotificationId(rabies.key),
          title: rabies.title,
          body: rabies.body,
          schedule: { at: rabies.at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: REMINDERS_CHANNEL_ID,
          extra: { key: rabies.key },
        },
        {
          id: reminderNotificationId(dewormer.key),
          title: dewormer.title,
          body: dewormer.body,
          schedule: { at: dewormer.at, allowWhileIdle: true },
          isExactNotification: false,
          channelId: REMINDERS_CHANNEL_ID,
          extra: { key: dewormer.key },
        },
      ],
    })
    expect(schedule.mock.invocationCallOrder[0] ?? 0).toBeLessThan(
      cancel.mock.invocationCallOrder[0] ?? 0,
    )
  })

  it('n’appelle ni cancel ni schedule quand il n’y a rien à faire', async () => {
    await rescheduleAll([])

    expect(cancel).not.toHaveBeenCalled()
    expect(schedule).not.toHaveBeenCalled()
  })

  it('garde en place une notification déjà en attente que la liste reprend', async () => {
    getPending.mockResolvedValue({
      notifications: [
        { id: reminderNotificationId(rabies.key), title: 'Ancien', body: 'Ancien' },
        { id: 7, title: 'Ancien', body: 'Ancien' },
      ],
    })

    await rescheduleAll([rabies])

    expect(cancel).toHaveBeenCalledExactlyOnceWith({ notifications: [{ id: 7 }] })
  })

  it('programme par lots, pour ne pas dépasser la taille d’une transaction native', async () => {
    const reminders = Array.from({ length: SCHEDULE_BATCH_SIZE * 2 + 1 }, (_, index) => ({
      ...rabies,
      key: `vaccination:${index}`,
    }))

    await rescheduleAll(reminders)

    expect(schedule).toHaveBeenCalledTimes(3)
    expect(
      schedule.mock.calls.flatMap(([{ notifications }]) => notifications).map(({ id }) => id),
    ).toEqual(reminders.map(({ key }) => reminderNotificationId(key)))
  })

  it('n’annule rien et se signale quand la programmation échoue', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    getPending.mockResolvedValue({ notifications: [{ id: 1, title: 'Ancien', body: 'Ancien' }] })
    schedule.mockRejectedValue(new Error('quota d’alarmes'))

    await expect(rescheduleAll([rabies])).rejects.toThrow('quota d’alarmes')

    expect(cancel).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
  })

  it('garde les lots déjà programmés quand un lot suivant échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const reminders = Array.from({ length: SCHEDULE_BATCH_SIZE + 1 }, (_, index) => ({
      ...rabies,
      key: `vaccination:${index}`,
    }))
    schedule.mockResolvedValueOnce({ notifications: [] }).mockRejectedValue(new Error('plugin'))

    await expect(rescheduleAll(reminders)).rejects.toThrow('plugin')

    expect(schedule).toHaveBeenCalledTimes(2)
    expect(cancel).not.toHaveBeenCalled()
  })
})

describe('rescheduleAll sans permission', () => {
  it.each(NOT_GRANTED)(
    'annule l’existant sans rien programmer quand la permission est « %s »',
    async (display) => {
      checkPermissions.mockResolvedValue({ display })
      getPending.mockResolvedValue({ notifications: [{ id: 1, title: 'Ancien', body: 'Ancien' }] })

      await rescheduleAll([rabies])

      expect(cancel).toHaveBeenCalledWith({ notifications: [{ id: 1 }] })
      expect(schedule).not.toHaveBeenCalled()
      expect(requestPermissions).not.toHaveBeenCalled()
    },
  )

  it('ne reprogramme rien quand le canal des rappels est coupé', async () => {
    remindersChannelImportance(0)

    await rescheduleAll([rabies])

    expect(schedule).not.toHaveBeenCalled()
  })
})

describe('permissions', () => {
  it('checkPermission ne demande rien et reflète display === granted', async () => {
    checkPermissions.mockResolvedValue({ display: 'granted' })
    await expect(checkPermission()).resolves.toBe(true)

    checkPermissions.mockResolvedValue({ display: 'denied' })
    await expect(checkPermission()).resolves.toBe(false)

    expect(requestPermissions).not.toHaveBeenCalled()
  })

  it('checkPermission est faux quand le canal des rappels est coupé', async () => {
    remindersChannelImportance(0)

    await expect(checkPermission()).resolves.toBe(false)
  })

  it('checkPermission reste vrai quand le canal est actif ou pas encore créé', async () => {
    remindersChannelImportance(2)
    await expect(checkPermission()).resolves.toBe(true)

    listChannels.mockResolvedValue({
      channels: [{ id: 'default', name: 'Default', importance: 0 }],
    })
    await expect(checkPermission()).resolves.toBe(true)
  })

  it('checkPermission s’en tient à la permission là où les canaux n’existent pas', async () => {
    listChannels.mockRejectedValue(new Error('Not implemented on web.'))

    await expect(checkPermission()).resolves.toBe(true)
  })

  it('requestPermission est faux quand le canal des rappels est coupé', async () => {
    requestPermissions.mockResolvedValue({ display: 'granted' })
    remindersChannelImportance(0)

    await expect(requestPermission()).resolves.toBe(false)
  })

  it('requestPermission renvoie un booléen depuis display === granted', async () => {
    requestPermissions.mockResolvedValue({ display: 'granted' })
    await expect(requestPermission()).resolves.toBe(true)

    requestPermissions.mockResolvedValue({ display: 'prompt' })
    await expect(requestPermission()).resolves.toBe(false)
  })
})
