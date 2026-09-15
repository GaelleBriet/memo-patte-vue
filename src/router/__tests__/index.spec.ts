import { describe, expect, it } from 'vitest'

import router from '@/router'

describe('routeur', () => {
  it('ramène à l’accueil une adresse qui ne correspond à aucun écran', async () => {
    await router.push('/animals/11111111-1111-4111-8111-111111111111/documents')

    expect(router.currentRoute.value.name).toBe('home')
    expect(router.currentRoute.value.path).toBe('/')
  })

  it('fait passer le repli par les gardes, qui gardent le dernier mot', async () => {
    await router.replace('/notifications/priming')
    const vues: (string | symbol | undefined)[] = []
    const retirerGarde = router.beforeEach((to) => {
      vues.push(to.name)
      return false
    })

    await router.push('/oups')
    retirerGarde()

    expect(vues).toEqual(['home'])
    expect(router.currentRoute.value.name).toBe('notifications-priming')
  })
})
