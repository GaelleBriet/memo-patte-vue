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
    ['https://memopatte.pages.dev/aide/?x=1', 'https://memopatte.app/aide/?x=1'],
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

  describe('en-têtes de sécurité', () => {
    const expected = {
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-frame-options': 'DENY',
      'content-security-policy': "frame-ancestors 'none'",
    }

    function expectSecurityHeaders(res: Response) {
      for (const [name, value] of Object.entries(expected)) {
        expect(res.headers.get(name)).toBe(value)
      }
    }

    it('les pose sur une réponse normale en gardant les en-têtes existants', async () => {
      const assets = {
        fetch: async () =>
          new Response('page', {
            headers: { 'cache-control': 'public, max-age=3600', etag: '"abc"' },
          }),
      }
      const res = await worker.fetch(new Request('https://memopatte.app/aide/'), {
        ASSETS: assets,
      })
      expectSecurityHeaders(res)
      expect(res.status).toBe(200)
      expect(res.headers.get('cache-control')).toBe('public, max-age=3600')
      expect(res.headers.get('etag')).toBe('"abc"')
      expect(await res.text()).toBe('page')
    })

    it('les pose sur une redirection vers le domaine canonique', async () => {
      const { response } = serve('https://www.memopatte.app/aide/')
      const res = await response
      expectSecurityHeaders(res)
      expect(res.status).toBe(301)
      expect(res.headers.get('location')).toBe('https://memopatte.app/aide/')
    })

    it('les pose sur une 404 sans changer son statut', async () => {
      const assets = { fetch: async () => new Response('absent', { status: 404 }) }
      const res = await worker.fetch(new Request('https://memopatte.app/nope'), {
        ASSETS: assets,
      })
      expectSecurityHeaders(res)
      expect(res.status).toBe(404)
      expect(await res.text()).toBe('absent')
    })

    it('les pose sur une réponse sans corps (304)', async () => {
      const assets = { fetch: async () => new Response(null, { status: 304 }) }
      const res = await worker.fetch(new Request('https://memopatte.app/'), { ASSETS: assets })
      expectSecurityHeaders(res)
      expect(res.status).toBe(304)
    })
  })

  describe('politique de contenu en mode rapport', () => {
    const urls = [
      'https://memopatte.app/',
      'https://memopatte.app/en/help/',
      'https://www.memopatte.app/aide/',
    ]

    it.each(urls)('pose un rapport seul sur %s, sans report-uri ni report-to', async (url) => {
      const { response } = serve(url)
      const policy = (await response).headers.get('content-security-policy-report-only')
      expect(policy).toContain("default-src 'self'")
      expect(policy).toContain("script-src 'self'")
      expect(policy).toContain("object-src 'none'")
      expect(policy).not.toMatch(/report-(uri|to)/)
      expect(policy).not.toMatch(/https?:/)
    })

    it.each(urls)('ne rend bloquante que frame-ancestors sur %s', async (url) => {
      const { response } = serve(url)
      expect((await response).headers.get('content-security-policy')).toBe("frame-ancestors 'none'")
    })

    it('la pose aussi sur une 404', async () => {
      const assets = { fetch: async () => new Response('absent', { status: 404 }) }
      const res = await worker.fetch(new Request('https://memopatte.app/nope'), { ASSETS: assets })
      expect(res.headers.get('content-security-policy-report-only')).toContain("default-src 'self'")
    })
  })
})
