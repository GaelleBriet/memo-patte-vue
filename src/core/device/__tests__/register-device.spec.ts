import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentDevice, forgetCurrentDeviceForTests, type DeviceIdentity } from '../device-identity'
import { registerCurrentDevice } from '../register-device'

type Register = (identity: DeviceIdentity, model: string | null) => Promise<void>

const getInfo = vi.hoisted(() => vi.fn<() => Promise<{ model: string }>>())

vi.mock('@capacitor/device', () => ({ Device: { getInfo } }))

describe('registerCurrentDevice', () => {
  beforeEach(() => {
    localStorage.clear()
    forgetCurrentDeviceForTests()
    getInfo.mockReset()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('enregistre l’appareil courant avec le modèle que donne le système', async () => {
    getInfo.mockResolvedValue({ model: 'SM-X710' })
    const register = vi.fn<Register>(async () => undefined)

    await registerCurrentDevice(async () => ({ register }))

    expect(register).toHaveBeenCalledWith(currentDevice(), 'SM-X710')
  })

  it('enregistre l’appareil sans modèle quand le système ne le donne pas', async () => {
    getInfo.mockRejectedValue(new Error('indisponible'))
    const register = vi.fn<Register>(async () => undefined)

    await registerCurrentDevice(async () => ({ register }))

    expect(register).toHaveBeenCalledWith(currentDevice(), null)
  })

  it('ne bloque pas le lancement quand l’écriture échoue', async () => {
    getInfo.mockResolvedValue({ model: 'Pixel 8' })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const register = vi.fn<Register>(async () => {
      throw new Error('base fermée')
    })

    await expect(registerCurrentDevice(async () => ({ register }))).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalled()
  })
})
