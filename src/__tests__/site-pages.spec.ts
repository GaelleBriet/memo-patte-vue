// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SITE = 'site'
const SITE_URL = 'https://memopatte.gaelle-briet.fr'
const CONTACT_EMAIL = 'memopatte@gaelle-briet.fr'
const CONTACT = `mailto:${CONTACT_EMAIL}`
const LEGAL_NOTICE = 'https://www.gaelle-briet.fr/mentions-legales/'

function htmlPages(dir: string): string[] {
  return readdirSync(join(SITE, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : htmlPages(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const pages = htmlPages('')
const frenchPages = pages.filter((page) => !page.startsWith('en'))
const englishPages = pages.filter((page) => page.startsWith('en'))
const read = (path: string) => readFileSync(join(SITE, path), 'utf8')
const fileOf = (url: string) => join(url.slice(1), 'index.html')

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
}

function decode(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith('#x') || code.startsWith('#X')) {
      return String.fromCodePoint(parseInt(code.slice(2), 16))
    }
    if (code.startsWith('#')) return String.fromCodePoint(parseInt(code.slice(1), 10))
    return NAMED_ENTITIES[code] ?? entity
  })
}

function readableTexts(html: string): string[] {
  const attributes = [...html.matchAll(/\b(?:content|alt)="([^"]*)"/g)].map((match) => match[1]!)
  return [html.replace(/<[^>]*>/g, ''), ...attributes].map(decode)
}

const footerOf = (html: string) => html.match(/<footer>([\s\S]*?)<\/footer>/)?.[1] ?? ''

const translations = [
  { name: 'accueil', fr: '/', en: '/en/' },
  { name: 'politique de confidentialité', fr: '/confidentialite/', en: '/en/privacy/' },
  { name: 'suppression de compte', fr: '/suppression-compte/', en: '/en/delete-account/' },
]

const policies = { fr: '/confidentialite/', en: '/en/privacy/' }
const deletions = { fr: '/suppression-compte/', en: '/en/delete-account/' }
const homes = { fr: '/', en: '/en/' }
const deletionSubjects = {
  fr: 'Suppression de compte MémoPatte',
  en: 'MémoPatte account deletion',
}
const legalNoticeLabels = { fr: 'Mentions légales', en: 'Legal notice' }
const languages = ['fr', 'en'] as const
const languageOf = (page: string) => (page.startsWith('en') ? 'en' : 'fr')

describe('site public memopatte.gaelle-briet.fr', () => {
  it.each(translations.flatMap(({ fr, en }) => [fr, en]))('la page %s existe', (url) => {
    expect(existsSync(join(SITE, fileOf(url)))).toBe(true)
  })

  it('la page 404 ramène aux deux accueils sans être indexée', () => {
    const html = read('404.html')
    expect(html).toContain('<meta name="robots" content="noindex" />')
    expect(html).toContain('href="/"')
    expect(html).toContain('href="/en/"')
  })

  it.each(pages)('%s déclare sa langue', (page) => {
    expect(read(page)).toContain(`<html lang="${languageOf(page)}">`)
  })

  it.each(pages)('%s ne charge rien depuis un autre site', (page) => {
    const html = read(page)
    expect(html).not.toMatch(/<script/i)
    const loadingTags = [...html.matchAll(/<(?:link|img|source|iframe)\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => !/\brel="alternate"/.test(tag))
    for (const tag of loadingTags) expect(tag).not.toMatch(/\b(href|src)="(https?:)?\/\//i)
  })

  it('le style ne charge rien depuis un autre site', () => {
    const css = read('style.css')
    expect(css).not.toMatch(/@import/i)
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//i)
  })

  it.each(pages)('%s ne pointe que vers des fichiers du site qui existent', (page) => {
    const targets = [...read(page).matchAll(/\b(?:href|src)="(\/(?!\/)[^"]*)"/g)].map((match) =>
      match[1]!.replace(/[?#].*$/, ''),
    )
    for (const target of targets) {
      const file = target.endsWith('/') ? `${target}index.html` : target
      expect(existsSync(join(SITE, file)), `${target} introuvable`).toBe(true)
    }
  })

  it.each(pages)('%s renvoie aux mentions légales en pied de page', (page) => {
    expect(footerOf(read(page))).toContain(
      `<a href="${LEGAL_NOTICE}">${legalNoticeLabels[languageOf(page)]}</a>`,
    )
  })

  it.each(pages)('%s ne donne que l’adresse e-mail de contact', (page) => {
    const html = read(page)
    const shown = readableTexts(html).flatMap(
      (text) => text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [],
    )
    const linked = [...html.matchAll(/href="mailto:([^"?]*)/g)].map((match) => match[1])
    for (const address of [...shown, ...linked]) expect(address).toBe(CONTACT_EMAIL)
  })

  describe.each(translations)('$name', ({ fr, en }) => {
    it.each([fr, en])('%s déclare les deux langues et la version par défaut', (url) => {
      const html = read(fileOf(url)).replace(/\s+/g, ' ')
      expect(html).toContain(`<link rel="alternate" hreflang="fr" href="${SITE_URL}${fr}" />`)
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${SITE_URL}${en}" />`)
      expect(html).toContain(
        `<link rel="alternate" hreflang="x-default" href="${SITE_URL}${fr}" />`,
      )
    })

    it('la page française mène à sa traduction', () => {
      expect(read(fileOf(fr))).toContain(`<a href="${en}" hreflang="en" lang="en">English</a>`)
    })

    it('la page anglaise mène à sa traduction', () => {
      expect(read(fileOf(en))).toContain(`<a href="${fr}" hreflang="fr" lang="fr">Français</a>`)
    })
  })

  describe.each(languages)('pages en %s', (lang) => {
    it('l’accueil mène à la politique et à la suppression de compte', () => {
      const html = read(fileOf(homes[lang]))
      expect(html).toContain(`href="${policies[lang]}"`)
      expect(html).toContain(`href="${deletions[lang]}"`)
    })

    it.each([policies[lang], deletions[lang]])('%s ramène à l’accueil', (url) => {
      expect(read(fileOf(url))).toContain(`href="${homes[lang]}"`)
    })

    it.each([policies[lang], deletions[lang]])('%s donne l’e-mail de contact', (url) => {
      expect(read(fileOf(url))).toContain(`href="${CONTACT}`)
    })

    it('la politique mène à la page de suppression, et inversement', () => {
      expect(read(fileOf(policies[lang]))).toContain(`href="${deletions[lang]}"`)
      expect(read(fileOf(deletions[lang]))).toContain(`href="${policies[lang]}"`)
    })

    it('la page de suppression pré-remplit l’objet de l’e-mail', () => {
      const subject = encodeURIComponent(deletionSubjects[lang])
      expect(read(fileOf(deletions[lang]))).toContain(`href="${CONTACT}?subject=${subject}"`)
    })

    it('la politique renvoie aux mentions légales', () => {
      expect(read(fileOf(policies[lang]))).toContain(`href="${LEGAL_NOTICE}"`)
    })
  })

  describe.each(frenchPages)('typographie française de %s', (page) => {
    const texts = readableTexts(read(page))

    it('met une espace insécable avant : ; ! ? et »', () => {
      for (const text of texts) expect(text).not.toMatch(/(^|[^  ])[:;!?»]/m)
    })

    it('met une espace insécable après «', () => {
      for (const text of texts) expect(text).not.toMatch(/«(?![  ])/)
    })

    it('écrit « e‑mail » avec un trait d’union insécable', () => {
      for (const text of texts) expect(text).not.toMatch(/e-mail/i)
    })
  })

  describe.each(englishPages)('typographie anglaise de %s', (page) => {
    const texts = readableTexts(read(page))

    it('n’a ni apostrophe ni guillemet droits', () => {
      for (const text of texts) expect(text).not.toMatch(/['"]/)
    })

    it('ne met pas d’espace avant : ; ! ?', () => {
      for (const text of texts) expect(text).not.toMatch(/\s[:;!?]/)
    })
  })
})
