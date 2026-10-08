// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { legalNoticeUrl, privacyPolicyUrl, siteUrl } from '../domain/site-links'

describe('liens vers le site', () => {
  it.each([
    ['fr', 'https://memopatte.app/confidentialite/'],
    ['en', 'https://memopatte.app/en/privacy/'],
  ] as const)('ouvre la politique de confidentialité en %s', (locale, url) => {
    expect(privacyPolicyUrl(locale)).toBe(url)
  })

  it.each([
    ['fr', 'https://memopatte.app/'],
    ['en', 'https://memopatte.app/en/'],
  ] as const)('ouvre le site en %s', (locale, url) => {
    expect(siteUrl(locale)).toBe(url)
  })

  it.each([
    ['fr', 'https://memopatte.app/mentions-legales/'],
    ['en', 'https://memopatte.app/en/legal-notice/'],
  ] as const)('ouvre les mentions légales en %s', (locale, url) => {
    expect(legalNoticeUrl(locale)).toBe(url)
  })
})
