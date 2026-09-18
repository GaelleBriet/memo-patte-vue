import { describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'

import { installPageviewTracking } from '../analytics-pageview'
import { track } from '@/core/analytics'

vi.mock('@/core/analytics', () => ({
  track: vi.fn<(event: string, properties?: Record<string, unknown>) => void>(),
}))

const Vide = { render: () => null }

function routeur() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
    ],
  })
  installPageviewTracking(router)
  return router
}

describe('installPageviewTracking', () => {
  it('envoie un pageview à chaque navigation aboutie', async () => {
    const router = routeur()

    await router.push('/')
    await router.push('/settings')

    expect(track).toHaveBeenCalledTimes(2)
    expect(track).toHaveBeenCalledWith('$pageview')
  })
})
