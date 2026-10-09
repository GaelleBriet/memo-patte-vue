// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import worker from '../../site/_worker.js'

function serve(url: string) {
  const assets = {
    fetch: vi.fn<(request: Request) => Promise<Response>>(async () => new Response('page')),
  }
  return { response: worker.fetch(new Request(url), { ASSETS: assets }), assets }
}

describe('site/_worker.js', () => {
  it.each([
    ['https://memopatte.gaelle-briet.fr/', 'https://memopatte.app/'],
    ['https://memopatte.gaelle-briet.fr/aide/?x=1', 'https://memopatte.app/aide/?x=1'],
    ['http://memopatte.gaelle-briet.fr/en/privacy/', 'https://memopatte.app/en/privacy/'],
    ['https://www.memopatte.app/', 'https://memopatte.app/'],
    ['https://www.memopatte.app/en/help/?x=1', 'https://memopatte.app/en/help/?x=1'],
  ])('redirige %s vers %s en 301', async (from, to) => {
    const { response, assets } = serve(from)
    const res = await response
    expect(res.status).toBe(301)
    expect(res.headers.get('location')).toBe(to)
    expect(assets.fetch).not.toHaveBeenCalled()
  })

  it.each(['https://memopatte.app/aide/', 'https://abc123.memopatte.pages.dev/'])(
    'sert %s tel quel',
    async (url) => {
      const { response, assets } = serve(url)
      expect(await (await response).text()).toBe('page')
      expect(assets.fetch).toHaveBeenCalledOnce()
    },
  )
})
