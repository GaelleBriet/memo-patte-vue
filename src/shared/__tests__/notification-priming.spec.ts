import { afterEach, describe, expect, it, vi } from 'vitest'

import { routeAfterReminderSaved } from '../notification-priming'
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
