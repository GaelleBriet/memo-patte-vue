import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import type { LocalNotificationsPlugin, PermissionStatus } from '@capacitor/local-notifications'
import { AndroidSettings, NativeSettings } from 'capacitor-native-settings'
import type * as NativeSettingsModule from 'capacitor-native-settings'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import type * as PermissionModule from '../permission'

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkPermissions: vi.fn<LocalNotificationsPlugin['checkPermissions']>(),
    requestPermissions: vi.fn<LocalNotificationsPlugin['requestPermissions']>(),
    listChannels: vi.fn<LocalNotificationsPlugin['listChannels']>(),
  },
}))

vi.mock('capacitor-native-settings', async (importOriginal) => ({
  ...(await importOriginal<typeof NativeSettingsModule>()),
  NativeSettings: { openAndroid: vi.fn<() => Promise<{ status: boolean }>>() },
}))

const checkPermissions = vi.mocked(LocalNotifications.checkPermissions)
const requestPermissions = vi.mocked(LocalNotifications.requestPermissions)
const listChannels = vi.mocked(LocalNotifications.listChannels)
const openAndroid = vi.mocked(NativeSettings.openAndroid)

let permission: typeof PermissionModule

function remindersChannelMuted(muted: boolean): void {
  listChannels.mockResolvedValue({
    channels: [{ id: 'reminders', name: 'Rappels', importance: muted ? 0 : 3 }],
  })
}

function osPermission(display: PermissionStatus['display']): void {
  checkPermissions.mockResolvedValue({ display })
}

// Node 26 expose un `localStorage` vide qui masque celui de jsdom.
function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.resetModules()
  permission = await import('../permission')
  osPermission('prompt')
  requestPermissions.mockResolvedValue({ display: 'granted' })
  openAndroid.mockResolvedValue({ status: true })
  listChannels.mockResolvedValue({ channels: [] })
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('getNotificationPermissionStatus', () => {
  it('annonce « granted » quand le système a accordé la permission', async () => {
    osPermission('granted')

    expect(await permission.getNotificationPermissionStatus()).toBe('granted')
  })

  it('annonce « disabled » quand seul le canal des rappels est coupé', async () => {
    osPermission('granted')
    remindersChannelMuted(true)

    expect(await permission.getNotificationPermissionStatus()).toBe('disabled')
  })

  it('annonce « granted » là où les canaux n’existent pas', async () => {
    osPermission('granted')
    listChannels.mockRejectedValue(new Error('Not implemented on web.'))

    expect(await permission.getNotificationPermissionStatus()).toBe('granted')
  })

  it('annonce « unasked » tant que l’écran d’explication n’a pas eu de réponse', async () => {
    osPermission('prompt-with-rationale')

    expect(await permission.getNotificationPermissionStatus()).toBe('unasked')
  })

  it('annonce « disabled » après une réponse à l’écran d’explication sans permission', async () => {
    permission.postponePriming()

    expect(await permission.getNotificationPermissionStatus()).toBe('disabled')
  })

  it('annonce « disabled » quand le système refuse sans que l’écran ait été montré', async () => {
    osPermission('denied')

    expect(await permission.getNotificationPermissionStatus()).toBe('disabled')
  })

  it('annonce « unavailable » quand le plugin ne répond pas', async () => {
    checkPermissions.mockRejectedValue(new Error('Notifications not supported in this browser.'))

    expect(await permission.getNotificationPermissionStatus()).toBe('unavailable')
  })

  it('se souvient de la réponse d’une session à l’autre', async () => {
    permission.postponePriming()
    vi.resetModules()
    const nextSession = await import('../permission')

    expect(await nextSession.getNotificationPermissionStatus()).toBe('disabled')
  })
})

describe('shouldShowPriming', () => {
  it('ne propose l’écran que si rien n’a encore été demandé', async () => {
    expect(await permission.shouldShowPriming()).toBe(true)

    permission.postponePriming()

    expect(await permission.shouldShowPriming()).toBe(false)
  })

  it('ne le propose pas quand la permission est déjà accordée', async () => {
    osPermission('granted')

    expect(await permission.shouldShowPriming()).toBe(false)
  })

  it('ne le propose pas sans plugin de notifications', async () => {
    checkPermissions.mockRejectedValue(new Error('unavailable'))

    expect(await permission.shouldShowPriming()).toBe(false)
  })
})

describe('requestAfterPriming', () => {
  it('déclenche la demande système et renvoie la réponse', async () => {
    requestPermissions.mockResolvedValue({ display: 'denied' })

    expect(await permission.requestAfterPriming()).toBe(false)
    expect(requestPermissions).toHaveBeenCalledOnce()
  })

  it('ne repropose jamais l’écran, même après un refus', async () => {
    requestPermissions.mockResolvedValue({ display: 'denied' })

    await permission.requestAfterPriming()

    expect(await permission.shouldShowPriming()).toBe(false)
    expect(await permission.getNotificationPermissionStatus()).toBe('disabled')
  })

  it('renvoie false si la demande système échoue', async () => {
    requestPermissions.mockRejectedValue(new Error('boom'))

    expect(await permission.requestAfterPriming()).toBe(false)
  })
})

describe('onNotificationPermissionGranted', () => {
  it('prévient les abonnés quand la demande est accordée', async () => {
    const listener = vi.fn<() => void>()
    permission.onNotificationPermissionGranted(listener)

    await permission.requestAfterPriming()

    expect(listener).toHaveBeenCalledOnce()
  })

  it('ne prévient personne sur un refus', async () => {
    const listener = vi.fn<() => void>()
    permission.onNotificationPermissionGranted(listener)
    requestPermissions.mockResolvedValue({ display: 'denied' })

    await permission.requestAfterPriming()

    expect(listener).not.toHaveBeenCalled()
  })

  it('prévient quand la permission est activée dans les réglages, au retour au premier plan', async () => {
    const listener = vi.fn<() => void>()
    osPermission('denied')
    permission.onNotificationPermissionGranted(listener)
    await vi.waitFor(() => expect(checkPermissions).toHaveBeenCalled())

    osPermission('granted')
    simulateWebResume()

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
  })

  it('prévient quand le canal des rappels est réactivé, au retour au premier plan', async () => {
    const listener = vi.fn<() => void>()
    osPermission('granted')
    remindersChannelMuted(true)
    permission.onNotificationPermissionGranted(listener)
    await vi.waitFor(() => expect(listChannels).toHaveBeenCalled())
    await permission.getNotificationPermissionStatus()
    expect(listener).not.toHaveBeenCalled()

    remindersChannelMuted(false)
    simulateWebResume()

    await vi.waitFor(() => expect(listener).toHaveBeenCalledOnce())
  })

  it('ne prévient pas quand la permission était déjà accordée', async () => {
    const listener = vi.fn<() => void>()
    osPermission('granted')
    permission.onNotificationPermissionGranted(listener)
    await vi.waitFor(() => expect(checkPermissions).toHaveBeenCalled())

    simulateWebResume()
    await permission.getNotificationPermissionStatus()

    expect(listener).not.toHaveBeenCalled()
  })

  it('ne prévient qu’une fois quand deux vérifications se croisent', async () => {
    const listener = vi.fn<() => void>()
    osPermission('denied')
    permission.onNotificationPermissionGranted(listener)
    await permission.getNotificationPermissionStatus()

    osPermission('granted')
    await Promise.all([
      permission.getNotificationPermissionStatus(),
      permission.getNotificationPermissionStatus(),
    ])

    expect(listener).toHaveBeenCalledOnce()
  })

  it('ignore une lecture partie avant l’accord, qui ne doit pas provoquer un second appel', async () => {
    const listener = vi.fn<() => void>()
    osPermission('denied')
    permission.onNotificationPermissionGranted(listener)
    await permission.getNotificationPermissionStatus()
    let answerStaleRead!: (status: PermissionStatus) => void
    checkPermissions.mockImplementationOnce(
      () => new Promise((resolve) => (answerStaleRead = resolve)),
    )
    const staleRead = permission.getNotificationPermissionStatus()

    await permission.requestAfterPriming()
    answerStaleRead({ display: 'denied' })
    await staleRead
    osPermission('granted')
    await permission.getNotificationPermissionStatus()

    expect(listener).toHaveBeenCalledOnce()
  })

  it('cesse de prévenir après désinscription', async () => {
    const listener = vi.fn<() => void>()
    const stop = permission.onNotificationPermissionGranted(listener)

    stop()
    await permission.requestAfterPriming()

    expect(listener).not.toHaveBeenCalled()
  })
})

describe('openNotificationSettings', () => {
  it('ouvre les réglages de notifications de l’app sur Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)

    await permission.openNotificationSettings()

    expect(openAndroid).toHaveBeenCalledWith({ option: AndroidSettings.AppNotification })
  })

  it('se replie sur la fiche de l’app quand l’écran de notifications n’existe pas', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    openAndroid.mockRejectedValueOnce(new Error('No Activity found'))

    await permission.openNotificationSettings()

    expect(openAndroid).toHaveBeenLastCalledWith({ option: AndroidSettings.ApplicationDetails })
  })

  it('ne lève pas quand aucun écran de réglages ne s’ouvre', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    openAndroid.mockRejectedValue(new Error('No Activity found'))

    await expect(permission.openNotificationSettings()).resolves.toBeUndefined()
  })

  it('ne fait rien dans le navigateur', async () => {
    await permission.openNotificationSettings()

    expect(openAndroid).not.toHaveBeenCalled()
  })
})
