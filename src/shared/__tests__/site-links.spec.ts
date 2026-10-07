// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { legalNoticeUrl, privacyPolicyUrl, siteUrl } from '../domain/site-links'

describe('liens vers le site', () => {
  it.each([
    ['fr', 'https://memopatte.gaelle-briet.fr/confidentialite/'],
    ['en', 'https://memopatte.gaelle-briet.fr/en/privacy/'],
  ] as const)('ouvre la politique de confidentialité en %s', (locale, url) => {
    expect(privacyPolicyUrl(locale)).toBe(url)
  })

  it.each([
    ['fr', 'https://memopatte.gaelle-briet.fr/'],
    ['en', 'https://memopatte.gaelle-briet.fr/en/'],
  ] as const)('ouvre le site en %s', (locale, url) => {
    expect(siteUrl(locale)).toBe(url)
  })

  it('ouvre les mentions légales', () => {
    expect(legalNoticeUrl()).toBe('https://gaelle-briet.fr/mentions-legales/')
  })
})
