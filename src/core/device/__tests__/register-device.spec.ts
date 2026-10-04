import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { currentDevice, forgetCurrentDeviceForTests, type DeviceIdentity } from '../device-identity'
import { registerCurrentDevice } from '../register-device'

type Register = (identity: DeviceIdentity, model: string | null) => Promise<void>

const getInfo = vi.hoisted(() => vi.fn<() => Promise<{ manufacturer?: string; model: string }>>())

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

  it.each([
    [
      'le fabricant suivi du modèle',
      { manufacturer: 'samsung', model: 'SM-X710' },
      'samsung SM-X710',
    ],
    [
      'des espaces normalisés',
      { manufacturer: ' OnePlus ', model: 'CPH  2581 ' },
      'OnePlus CPH 2581',
    ],
    ['le modèle seul, fabricant vide', { manufacturer: '', model: 'A059' }, 'A059'],
    [
      'un modèle déjà lisible, précédé du fabricant',
      { manufacturer: 'Google', model: 'Pixel 8' },
      'Google Pixel 8',
    ],
    [
      'le modèle seul quand il commence par le fabricant',
      { manufacturer: 'Google', model: 'google Pixel 8' },
      'google Pixel 8',
    ],
    ['le fabricant seul, modèle vide', { manufacturer: 'Nothing', model: '' }, 'Nothing'],
    ['rien quand les deux manquent', { manufacturer: ' ', model: '' }, null],
  ])('enregistre l’appareil courant avec %s', async (_, info, expected) => {
    getInfo.mockResolvedValue(info)
    const register = vi.fn<Register>(async () => undefined)

    await registerCurrentDevice(async () => ({ register }))

    expect(register).toHaveBeenCalledWith(currentDevice(), expected)
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
