import { describe, expect, it } from 'vitest'

import { primingReturnRoute } from '../domain/notification-priming'
import router from '@/router'

describe('primingReturnRoute', () => {
  it('revient à l’écran d’origine quand il est nommé', () => {
    expect(primingReturnRoute('home')).toEqual({ name: 'home' })
    expect(primingReturnRoute('settings')).toEqual({ name: 'settings' })
    expect(primingReturnRoute('settings-reminders')).toEqual({ name: 'settings-reminders' })
    expect(primingReturnRoute('settings-data')).toEqual({ name: 'settings-data' })
    expect(primingReturnRoute('carnet')).toEqual({ name: 'carnet' })
  })

  it('revient au détail d’un vaccin ou d’un traitement, identifié par son rappel', () => {
    expect(primingReturnRoute('vaccination-detail', 'vaccination:v1')).toEqual({
      name: 'vaccination-detail',
      params: { id: 'v1' },
    })
    expect(primingReturnRoute('treatment-detail', 'treatment:t1')).toEqual({
      name: 'treatment-detail',
      params: { id: 't1' },
    })
  })

  it('revient au Carnet depuis un détail sans rappel, ou dont le rappel est d’un autre type', () => {
    expect(primingReturnRoute('vaccination-detail')).toEqual({ name: 'carnet' })
    expect(primingReturnRoute('vaccination-detail', 'treatment:t1')).toMatchObject({
      name: 'carnet',
    })
  })

  it('revient au Carnet sans origine, avec une origine inconnue ou l’écran lui-même', () => {
    expect(primingReturnRoute(undefined)).toEqual({ name: 'carnet' })
    expect(primingReturnRoute('inconnu')).toEqual({ name: 'carnet' })
    expect(primingReturnRoute('animal-edit')).toEqual({ name: 'carnet' })
    expect(primingReturnRoute(['home'])).toEqual({ name: 'carnet' })
    expect(primingReturnRoute('notifications-priming')).toEqual({ name: 'carnet' })
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
