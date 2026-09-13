import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HomeReminderSource, HomeRemindersService } from '../home-reminders.service'
import { provideHomeRemindersService, useHomeStore } from '../home.store'

type ListSources = HomeRemindersService['listSources']

const RAGE: HomeReminderSource = {
  kind: 'vaccination',
  id: 'v1',
  animalId: 'milo',
  label: 'Rage',
  dueDate: '2026-09-01',
  treatmentType: null,
}

describe('homeStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    provideHomeRemindersService(null)
  })

  it('part vide, ni chargé ni en erreur', () => {
    const store = useHomeStore()

    expect(store.sources).toEqual([])
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('charge les sources depuis le service', async () => {
    provideHomeRemindersService(() => ({ listSources: vi.fn<ListSources>(async () => [RAGE]) }))
    const store = useHomeStore()

    await expect(store.load()).resolves.toBe(true)

    expect(store.sources).toEqual([RAGE])
    expect(store.hasLoaded).toBe(true)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('ne lève pas en cas d’échec : renseigne error et renvoie false', async () => {
    provideHomeRemindersService(() => ({
      listSources: vi.fn<ListSources>(() => Promise.reject(new Error('base indisponible'))),
    }))
    const store = useHomeStore()

    await expect(store.load()).resolves.toBe(false)

    expect(store.error?.message).toBe('base indisponible')
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
  })

  it('efface l’erreur quand un rechargement réussit', async () => {
    let fail = true
    provideHomeRemindersService(() => ({
      listSources: vi.fn<ListSources>(() =>
        fail ? Promise.reject(new Error('boom')) : Promise.resolve([RAGE]),
      ),
    }))
    const store = useHomeStore()

    await store.load()
    fail = false
    await store.load()

    expect(store.error).toBeNull()
    expect(store.sources).toEqual([RAGE])
  })
})
