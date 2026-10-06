import { LocalNotifications } from '@capacitor/local-notifications'
import type {
  LocalNotificationsPlugin,
  SettingsPermissionStatus,
} from '@capacitor/local-notifications'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ExactRemindersModule from '../exact-reminders'

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    checkExactNotificationSetting:
      vi.fn<LocalNotificationsPlugin['checkExactNotificationSetting']>(),
    changeExactNotificationSetting:
      vi.fn<LocalNotificationsPlugin['changeExactNotificationSetting']>(),
  },
}))

const checkExact = vi.mocked(LocalNotifications.checkExactNotificationSetting)
const changeExact = vi.mocked(LocalNotifications.changeExactNotificationSetting)

let exact: typeof ExactRemindersModule

function androidAccess(state: SettingsPermissionStatus['exact_alarm']): void {
  checkExact.mockResolvedValue({ exact_alarm: state })
}

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
  exact = await import('../exact-reminders')
  androidAccess('denied')
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('getExactRemindersStatus', () => {
  it('annonce « precise » quand Android accorde l’accès', async () => {
    androidAccess('granted')

    expect(await exact.getExactRemindersStatus()).toBe('precise')
  })

  it('annonce « never-enabled » tant que l’accès n’a jamais été vu accordé', async () => {
    expect(await exact.getExactRemindersStatus()).toBe('never-enabled')
  })

  it('annonce « removed » quand l’accès, vu accordé, a été retiré', async () => {
    androidAccess('granted')
    await exact.getExactRemindersStatus()
    androidAccess('denied')

    expect(await exact.getExactRemindersStatus()).toBe('removed')
  })

  it('se souvient d’un accès vu accordé par la programmation seule', async () => {
    androidAccess('granted')
    await exact.canScheduleExact()
    androidAccess('denied')

    expect(await exact.getExactRemindersStatus()).toBe('removed')
  })

  it('annonce « unavailable » là où le plugin n’a pas l’API (navigateur)', async () => {
    checkExact.mockRejectedValue(new Error('Not implemented on web.'))

    expect(await exact.getExactRemindersStatus()).toBe('unavailable')
  })

  it('ne demande jamais rien', async () => {
    await exact.getExactRemindersStatus()

    expect(changeExact).not.toHaveBeenCalled()
  })
})

describe('canScheduleExact', () => {
  it('est vrai seulement quand l’accès est accordé', async () => {
    androidAccess('granted')
    expect(await exact.canScheduleExact()).toBe(true)

    androidAccess('denied')
    expect(await exact.canScheduleExact()).toBe(false)
  })

  it('est faux là où le plugin n’a pas l’API', async () => {
    checkExact.mockRejectedValue(new Error('Not implemented on web.'))

    expect(await exact.canScheduleExact()).toBe(false)
  })
})

describe('openExactRemindersSettings', () => {
  it('ouvre l’écran Android « Alarmes et rappels » et rend l’état au retour', async () => {
    changeExact.mockImplementation(async () => {
      androidAccess('granted')
      return { exact_alarm: 'granted' }
    })

    expect(await exact.openExactRemindersSettings()).toBe('precise')
    expect(changeExact).toHaveBeenCalledOnce()
  })

  it('rend l’état relu quand l’écran ne s’ouvre pas', async () => {
    changeExact.mockRejectedValue(new Error('Not implemented on web.'))
    checkExact.mockRejectedValue(new Error('Not implemented on web.'))

    expect(await exact.openExactRemindersSettings()).toBe('unavailable')
  })
})

describe('suggestion des rappels précis (RA-23)', () => {
  it('n’a jamais été faite sur un téléphone neuf, l’est pour toujours une fois notée', () => {
    expect(exact.wasExactRemindersSuggested()).toBe(false)

    exact.markExactRemindersSuggested()

    expect(exact.wasExactRemindersSuggested()).toBe(true)
  })

  it('sans stockage, se lit comme déjà faite : elle ne revient pas à chaque heure ajoutée', () => {
    const blocked = () => {
      throw new Error('stockage bloqué')
    }
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked })

    expect(() => exact.markExactRemindersSuggested()).not.toThrow()
    expect(exact.wasExactRemindersSuggested()).toBe(true)
  })
})
