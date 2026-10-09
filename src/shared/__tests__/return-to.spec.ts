import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { returnToOr } from '../utils/return-to'

const Vide = { render: () => null }

async function routeur() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'carnet', component: Vide },
      { path: '/form', name: 'form', component: Vide },
      { path: '/priming', name: 'priming', component: Vide },
    ],
  })
  await router.push('/animals')
  await router.push('/form')
  return router
}

describe('returnToOr', () => {
  it('va à la cible quand la navigation aboutit', async () => {
    const router = await routeur()

    await returnToOr(router, { name: 'priming' }, { name: 'carnet' })

    expect(router.currentRoute.value.name).toBe('priming')
  })

  it('retombe sur la route de repli quand la navigation est refusée', async () => {
    const router = await routeur()
    router.beforeEach((to) => (to.name === 'priming' ? false : true))

    await returnToOr(router, { name: 'priming' }, { name: 'carnet' })

    expect(router.currentRoute.value.name).toBe('carnet')
  })

  it('ne lève jamais, même quand la route de repli échoue aussi', async () => {
    const router = await routeur()
    vi.spyOn(router, 'replace').mockRejectedValue(new Error('navigation en échec'))

    await expect(
      returnToOr(router, { name: 'priming' }, { name: 'carnet' }),
    ).resolves.toBeUndefined()
  })
})
