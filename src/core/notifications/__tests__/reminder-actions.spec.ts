import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { LocalNotifications } from '@capacitor/local-notifications'
import type { ActionPerformed, LocalNotificationsPlugin } from '@capacitor/local-notifications'

import i18n from '@/core/i18n'
import {
  onReminderAction,
  registerReminderActions,
  REMINDER_DONE_ACTION_TYPE,
  type ReminderAction,
} from '../reminder-actions'

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    registerActionTypes: vi.fn<LocalNotificationsPlugin['registerActionTypes']>(),
    addListener: vi.fn(),
  },
}))

const registerActionTypes = vi.mocked(LocalNotifications.registerActionTypes)
const addListener = vi.mocked(LocalNotifications.addListener)
const remove = vi.fn<() => Promise<void>>()

type PluginListener = (event: ActionPerformed) => void

let pluginListener: PluginListener | null

const KEY = 'treatment:22222222-2222-4222-8222-222222222222:2026-09-25:due'

function performed(actionId: string, extra: unknown = { key: KEY }): ActionPerformed {
  return { actionId, notification: { id: 12, title: 'Titre', body: 'Corps', extra } }
}

beforeEach(() => {
  vi.clearAllMocks()
  pluginListener = null
  registerActionTypes.mockResolvedValue()
  remove.mockResolvedValue()
  addListener.mockImplementation(((_event: string, listener: PluginListener) => {
    pluginListener = listener
    return Promise.resolve({ remove })
  }) as never)
})

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('registerReminderActions', () => {
  it('inscrit le bouton « C’est fait » dans la langue courante', async () => {
    await registerReminderActions()

    expect(registerActionTypes).toHaveBeenCalledExactlyOnceWith({
      types: [{ id: REMINDER_DONE_ACTION_TYPE, actions: [{ id: 'done', title: 'C’est fait' }] }],
    })
  })

  it('suit la langue de l’app', async () => {
    i18n.global.locale.value = 'en'

    await registerReminderActions()

    expect(registerActionTypes.mock.calls[0]?.[0].types[0]?.actions).toEqual([
      { id: 'done', title: 'Done' },
    ])
  })

  it('ne lève pas là où le plugin n’inscrit pas de bouton', async () => {
    registerActionTypes.mockRejectedValue(new Error('Not implemented on web.'))

    await expect(registerReminderActions()).resolves.toBeUndefined()
  })
})

describe('onReminderAction', () => {
  function listen(): ReturnType<typeof vi.fn<(action: ReminderAction) => void>> {
    const listener = vi.fn<(action: ReminderAction) => void>()
    onReminderAction(listener)
    return listener
  }

  it('écoute les actions des notifications du plugin', () => {
    listen()

    expect(addListener).toHaveBeenCalledWith(
      'localNotificationActionPerformed',
      expect.any(Function),
    )
  })

  it('rend la clé du rappel et « done » pour le bouton « C’est fait »', () => {
    const listener = listen()

    pluginListener?.(performed('done'))

    expect(listener).toHaveBeenCalledExactlyOnceWith({ key: KEY, action: 'done' })
  })

  it('rend « open » quand la notification est touchée hors du bouton', () => {
    const listener = listen()

    pluginListener?.(performed('tap'))

    expect(listener).toHaveBeenCalledExactlyOnceWith({ key: KEY, action: 'open' })
  })

  it('ignore une notification qui ne porte pas de clé de rappel', () => {
    const listener = listen()

    pluginListener?.(performed('done', null))
    pluginListener?.(performed('done', { key: 12 }))

    expect(listener).not.toHaveBeenCalled()
  })

  it('ignore une action inconnue', () => {
    const listener = listen()

    pluginListener?.(performed('snooze'))

    expect(listener).not.toHaveBeenCalled()
  })

  it('se désinscrit du plugin', async () => {
    const stop = onReminderAction(() => {})

    stop()

    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce())
  })
})
