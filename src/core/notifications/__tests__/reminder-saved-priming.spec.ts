import { afterEach, describe, expect, it, vi } from 'vitest'

import { createMemoryHistory, createRouter } from 'vue-router'

import {
  leaveAfterReminderSaved,
  primingAfterReminderSaved,
  routeAfterReminderSaved,
} from '../reminder-saved-priming'
import { shouldShowPriming } from '@/core/notifications/permission'
import { primingReturnRoute } from '@/shared/domain/notification-priming'

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(),
}))

const shouldShow = vi.mocked(shouldShowPriming)

afterEach(() => {
  vi.clearAllMocks()
})

describe('routeAfterReminderSaved', () => {
  it('passe par l’écran d’explication quand une échéance est posée et que rien n’a été demandé', async () => {
    shouldShow.mockResolvedValue(true)

    expect(
      await routeAfterReminderSaved({ hasDueDate: true, animalName: 'Milo', kind: 'vaccination' }),
    ).toEqual({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'vaccination' },
    })
  })

  it('n’envoie pas de prénom vide quand l’animal n’est pas résolu', async () => {
    shouldShow.mockResolvedValue(true)

    expect(
      await routeAfterReminderSaved({ hasDueDate: true, animalName: null, kind: 'treatment' }),
    ).toEqual({ name: 'notifications-priming', query: { kind: 'treatment' } })
  })

  it('revient au Carnet quand l’écran a déjà eu sa réponse ou que la permission est accordée', async () => {
    shouldShow.mockResolvedValue(false)

    expect(
      await routeAfterReminderSaved({ hasDueDate: true, animalName: 'Milo', kind: 'treatment' }),
    ).toEqual({ name: 'carnet' })
  })

  it('revient au Carnet sans rien vérifier quand il n’y a pas d’échéance', async () => {
    expect(
      await routeAfterReminderSaved({ hasDueDate: false, animalName: 'Milo', kind: 'vaccination' }),
    ).toEqual({ name: 'carnet' })
    expect(shouldShow).not.toHaveBeenCalled()
  })
})

describe('routeAfterReminderSaved, depuis un écran d’origine', () => {
  it('revient à l’écran d’origine, ou y ramènera après l’écran d’explication', async () => {
    shouldShow.mockResolvedValue(false)
    const saved = { hasDueDate: true, animalName: 'Milo', kind: 'treatment', from: 'home' } as const

    expect(await routeAfterReminderSaved(saved)).toEqual({ name: 'home' })

    shouldShow.mockResolvedValue(true)
    expect(await routeAfterReminderSaved(saved)).toEqual({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'treatment', from: 'home' },
    })
  })

  it('revient au Carnet depuis une origine inconnue', async () => {
    shouldShow.mockResolvedValue(false)

    expect(
      await routeAfterReminderSaved({
        hasDueDate: true,
        animalName: 'Milo',
        kind: 'treatment',
        from: 'treatment-edit',
      }),
    ).toEqual({ name: 'carnet' })
  })
})

describe('routeAfterReminderSaved, depuis la feuille d’un rappel', () => {
  const saved = {
    hasDueDate: true,
    animalName: 'Boree',
    kind: 'treatment',
    from: 'home',
    reminder: 'treatment:t1',
  } as const

  it('revient à l’accueil en gardant le rappel dont la feuille se rouvre', async () => {
    shouldShow.mockResolvedValue(false)

    expect(await routeAfterReminderSaved(saved)).toEqual({
      name: 'home',
      query: { reminder: 'treatment:t1' },
    })
  })

  it('confie le rappel à l’écran d’explication, qui le rendra au retour', async () => {
    shouldShow.mockResolvedValue(true)

    expect(await routeAfterReminderSaved(saved)).toEqual({
      name: 'notifications-priming',
      query: { animalName: 'Boree', kind: 'treatment', from: 'home', reminder: 'treatment:t1' },
    })
    expect(primingReturnRoute('home', 'treatment:t1')).toEqual({
      name: 'home',
      query: { reminder: 'treatment:t1' },
    })
  })
})

describe('primingAfterReminderSaved', () => {
  it('ne propose l’écran d’explication qu’au premier rappel, quand rien n’a été demandé', async () => {
    shouldShow.mockResolvedValue(true)
    const saved = {
      hasDueDate: true,
      animalName: 'Boree',
      kind: 'vaccination',
      from: 'home',
    } as const

    expect(await primingAfterReminderSaved(saved)).toEqual({
      name: 'notifications-priming',
      query: { animalName: 'Boree', kind: 'vaccination', from: 'home' },
    })
    expect(await primingAfterReminderSaved({ ...saved, hasDueDate: false })).toBeNull()

    shouldShow.mockResolvedValue(false)
    expect(await primingAfterReminderSaved(saved)).toBeNull()
  })
})

describe('leaveAfterReminderSaved', () => {
  const Vide = { render: () => null }

  async function routeur() {
    const memoire = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: Vide },
        { path: '/animals', name: 'carnet', component: Vide },
        { path: '/settings', name: 'settings', component: Vide },
        { path: '/form', name: 'form', component: Vide },
        { path: '/priming', name: 'notifications-priming', component: Vide },
      ],
    })
    await memoire.push('/')
    await memoire.push('/form')
    return memoire
  }

  it('va à l’écran d’explication quand il est dû', async () => {
    shouldShow.mockResolvedValue(true)
    const memoire = await routeur()

    await leaveAfterReminderSaved(memoire, {
      hasDueDate: true,
      animalName: null,
      kind: 'vaccination',
    })

    expect(memoire.currentRoute.value.name).toBe('notifications-priming')
  })

  it('retombe sur l’écran d’origine, sans lever, quand le calcul de la route échoue', async () => {
    shouldShow.mockRejectedValue(new Error('plugin indisponible'))
    const memoire = await routeur()

    await leaveAfterReminderSaved(memoire, {
      hasDueDate: true,
      animalName: null,
      kind: 'vaccination',
      from: 'settings',
    })

    expect(memoire.currentRoute.value.name).toBe('settings')
  })

  it('ne lève pas quand la navigation échoue', async () => {
    shouldShow.mockResolvedValue(false)
    const memoire = await routeur()
    vi.spyOn(memoire, 'replace').mockRejectedValue(new Error('navigation refusée'))

    await expect(
      leaveAfterReminderSaved(memoire, { hasDueDate: false, animalName: null, kind: 'treatment' }),
    ).resolves.toBeUndefined()
  })
})
