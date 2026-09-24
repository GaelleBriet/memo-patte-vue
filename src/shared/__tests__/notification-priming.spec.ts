import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  primingAfterReminderSaved,
  primingReturnRoute,
  routeAfterReminderSaved,
} from '../domain/notification-priming'
import { shouldShowPriming } from '@/core/notifications/permission'
import router from '@/router'

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
    ).toEqual({ name: 'animals' })
  })

  it('revient au Carnet sans rien vérifier quand il n’y a pas d’échéance', async () => {
    expect(
      await routeAfterReminderSaved({ hasDueDate: false, animalName: 'Milo', kind: 'vaccination' }),
    ).toEqual({ name: 'animals' })
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
    ).toEqual({ name: 'animals' })
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

describe('primingReturnRoute', () => {
  it('revient à l’écran d’origine quand il est nommé', () => {
    expect(primingReturnRoute('home')).toEqual({ name: 'home' })
    expect(primingReturnRoute('settings')).toEqual({ name: 'settings' })
    expect(primingReturnRoute('animals')).toEqual({ name: 'animals' })
  })

  it('revient au Carnet sans origine, avec une origine inconnue ou l’écran lui-même', () => {
    expect(primingReturnRoute(undefined)).toEqual({ name: 'animals' })
    expect(primingReturnRoute('inconnu')).toEqual({ name: 'animals' })
    expect(primingReturnRoute('animal-edit')).toEqual({ name: 'animals' })
    expect(primingReturnRoute(['home'])).toEqual({ name: 'animals' })
    expect(primingReturnRoute('notifications-priming')).toEqual({ name: 'animals' })
  })
})

describe('route de l’écran d’explication', () => {
  it('passe l’animal et le type de rappel en props', () => {
    const route = router.resolve({
      name: 'notifications-priming',
      query: { animalName: 'Luna', kind: 'treatment' },
    })
    const props = route.matched[0]!.props.default as (r: typeof route) => unknown

    expect(route.path).toBe('/notifications/priming')
    expect(props(route)).toEqual({ animalName: 'Luna', kind: 'treatment' })
  })

  it('retombe sur un vaccin quand le type est inconnu', () => {
    const route = router.resolve({ name: 'notifications-priming', query: { animalName: 'Luna' } })
    const props = route.matched[0]!.props.default as (r: typeof route) => unknown

    expect(props(route)).toEqual({ animalName: 'Luna', kind: 'vaccination' })
  })
})
