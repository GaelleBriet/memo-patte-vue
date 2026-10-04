import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  DEVICE_STORAGE_KEY,
  currentDevice,
  currentDeviceId,
  forgetCurrentDeviceForTests,
} from '../device-identity'

const NOW = new Date('2026-10-03T09:15:00.000Z')
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('identité de l’appareil', () => {
  beforeEach(() => {
    localStorage.clear()
    forgetCurrentDeviceForTests()
    vi.useFakeTimers({ toFake: ['Date'], now: NOW })
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('tire un identifiant au hasard au premier lancement, daté de ce lancement', () => {
    const device = currentDevice()

    expect(device.id).toMatch(UUID)
    expect(device.installedAt).toBe(NOW.toISOString())
  })

  it('le range dans le stockage du WebView, exclu de la sauvegarde d’Android', () => {
    const device = currentDevice()

    expect(JSON.parse(localStorage.getItem(DEVICE_STORAGE_KEY) ?? 'null')).toEqual(device)
  })

  it('garde le même identifiant d’un lancement à l’autre', () => {
    const first = currentDevice()
    forgetCurrentDeviceForTests()
    vi.setSystemTime(new Date('2026-12-01T00:00:00.000Z'))

    expect(currentDevice()).toEqual(first)
    expect(currentDeviceId()).toBe(first.id)
  })

  it('deux installations ne partagent pas le même identifiant', () => {
    const first = currentDeviceId()
    localStorage.clear()
    forgetCurrentDeviceForTests()

    expect(currentDeviceId()).not.toBe(first)
  })

  it('remplace une valeur illisible par un nouvel appareil', () => {
    localStorage.setItem(DEVICE_STORAGE_KEY, '{"id":42}')

    expect(currentDeviceId()).toMatch(UUID)
  })

  it.each([
    ['un identifiant qui n’est pas un UUID', { id: 'pixel', installedAt: NOW.toISOString() }],
    ['une date d’installation illisible', { id: crypto.randomUUID(), installedAt: 'hier' }],
  ])('remplace %s par un nouvel appareil', (_, saved) => {
    localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(saved))

    const device = currentDevice()

    expect(device.id).toMatch(UUID)
    expect(device).not.toEqual(saved)
    expect(device.installedAt).toBe(NOW.toISOString())
  })

  it('garde un identifiant pour la session quand le stockage est indisponible', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('stockage indisponible')
    })

    const id = currentDeviceId()

    expect(id).toMatch(UUID)
    expect(currentDeviceId()).toBe(id)
  })
})
