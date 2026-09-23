import type { PermissionState } from '@capacitor/core'
import { Capacitor } from '@capacitor/core'
import { Filesystem } from '@capacitor/filesystem'
import { AndroidSettings, NativeSettings } from 'capacitor-native-settings'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { checkSaveAccess, openAppSettings, requestSaveAccess } from '../logic/export-storage-access'

type Status = { publicStorage: PermissionState }

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn<() => boolean>(() => true) },
}))

vi.mock('@capacitor/filesystem', () => ({
  Filesystem: {
    checkPermissions: vi.fn<() => Promise<Status>>(async () => ({ publicStorage: 'granted' })),
    requestPermissions: vi.fn<() => Promise<Status>>(async () => ({ publicStorage: 'granted' })),
  },
}))

vi.mock('capacitor-native-settings', () => ({
  AndroidSettings: { ApplicationDetails: 'application_details' },
  NativeSettings: {
    openAndroid: vi.fn<() => Promise<{ status: boolean }>>(async () => ({ status: true })),
  },
}))

function permissionIs(state: PermissionState) {
  vi.mocked(Filesystem.checkPermissions).mockResolvedValue({ publicStorage: state })
}

function answerIs(state: PermissionState) {
  vi.mocked(Filesystem.requestPermissions).mockResolvedValue({ publicStorage: state })
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true)
  permissionIs('granted')
  answerIs('granted')
})

describe('checkSaveAccess', () => {
  it.each([
    ['granted', 'granted'],
    ['prompt', 'unasked'],
    ['prompt-with-rationale', 'refused'],
    ['denied', 'blocked'],
  ] as const)(
    'traduit l’état « %s » du plugin en « %s », sans rien demander',
    async (state, access) => {
      permissionIs(state)

      await expect(checkSaveAccess()).resolves.toBe(access)
      expect(Filesystem.requestPermissions).not.toHaveBeenCalled()
    },
  )

  it('laisse l’enregistrement proposé quand l’état ne peut pas être lu', async () => {
    vi.mocked(Filesystem.checkPermissions).mockRejectedValue(new Error('not implemented'))

    await expect(checkSaveAccess()).resolves.toBe('unasked')
  })

  it('n’interroge aucun plugin dans le navigateur', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    await expect(checkSaveAccess()).resolves.toBe('granted')
    expect(Filesystem.checkPermissions).not.toHaveBeenCalled()
  })
})

describe('requestSaveAccess', () => {
  it('ne demande rien quand l’accès est déjà accordé (Android 11 et plus)', async () => {
    await expect(requestSaveAccess()).resolves.toBe('granted')
    expect(Filesystem.requestPermissions).not.toHaveBeenCalled()
  })

  it.each([
    ['granted', 'granted'],
    ['prompt-with-rationale', 'refused'],
    ['prompt', 'refused'],
    ['denied', 'blocked'],
  ] as const)(
    'demande l’accès à Android puis traduit la réponse « %s » en « %s »',
    async (answer, access) => {
      permissionIs('prompt')
      answerIs(answer)

      await expect(requestSaveAccess()).resolves.toBe(access)
      expect(Filesystem.requestPermissions).toHaveBeenCalledOnce()
    },
  )

  it('redemande après un premier refus', async () => {
    permissionIs('prompt-with-rationale')

    await expect(requestSaveAccess()).resolves.toBe('granted')
    expect(Filesystem.requestPermissions).toHaveBeenCalledOnce()
  })

  it('laisse Android trancher même après un refus définitif, qui a pu être levé depuis', async () => {
    permissionIs('denied')

    await expect(requestSaveAccess()).resolves.toBe('granted')
  })

  it('accorde sans rien demander dans le navigateur', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    await expect(requestSaveAccess()).resolves.toBe('granted')
    expect(Filesystem.checkPermissions).not.toHaveBeenCalled()
    expect(Filesystem.requestPermissions).not.toHaveBeenCalled()
  })
})

describe('openAppSettings', () => {
  it('ouvre l’écran Android « Infos sur l’application »', async () => {
    await openAppSettings()

    expect(NativeSettings.openAndroid).toHaveBeenCalledExactlyOnceWith({
      option: AndroidSettings.ApplicationDetails,
    })
  })

  it('ne fait rien dans le navigateur', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false)

    await openAppSettings()

    expect(NativeSettings.openAndroid).not.toHaveBeenCalled()
  })
})
