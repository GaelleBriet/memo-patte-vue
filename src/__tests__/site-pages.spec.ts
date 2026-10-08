// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { helpPageUrl, remindersHelpUrl } from '@/shared/domain/help-page'

import { decode } from './site-text'

const SITE = 'site'
const SITE_URL = 'https://memopatte.app'
const CONTACT_EMAIL = 'contact@memopatte.app'
const CONTACT = `mailto:${CONTACT_EMAIL}`
const LEGAL_NOTICE = 'https://www.gaelle-briet.fr/mentions-legales/'
const SITE_LEGAL_NOTICES = { fr: '/mentions-legales/', en: '/en/legal-notice/' }
const HELP_PAGES_TO_COME = [
  '/aide/exporter/',
  '/aide/rappels/',
  '/en/help/export/',
  '/en/help/reminders/',
]
const PAGES_TO_COME = [...Object.values(SITE_LEGAL_NOTICES), ...HELP_PAGES_TO_COME]
const OUTBOUND_HOSTS = [
  'memopatte.app',
  'play.google.com',
  'github.com',
  'www.cnil.fr',
  'www.gaelle-briet.fr',
]
const FONTS = ['inter-latin-wght-normal.woff2', 'space-grotesk-latin-wght-normal.woff2']
const FONT_LICENSES = ['inter-OFL.txt', 'space-grotesk-OFL.txt']

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

function readableTexts(html: string): string[] {
  const attributes = [...html.matchAll(/\b(?:content|alt)="([^"]*)"/g)]
    .map((match) => match[1]!)
    .filter((value) => !/^https?:\/\//.test(value))
  const body = html.replace(/<script\b[\s\S]*?<\/script>/gi, '').replace(/<[^>]*>/g, '')
  return [body, ...attributes].map(decode)
}

const footerOf = (html: string) => html.match(/<footer\b[^>]*>([\s\S]*?)<\/footer>/)?.[1] ?? ''
const headerOf = (html: string) => html.match(/<header\b[^>]*>([\s\S]*?)<\/header>/)?.[1] ?? ''
const withoutLanguageTarget = (html: string) =>
  html.replace(/href="[^"]*"(?= hreflang=)/g, 'href="…"')

const translations = [
  { name: 'accueil', fr: '/', en: '/en/' },
  { name: 'politique de confidentialité', fr: '/confidentialite/', en: '/en/privacy/' },
  { name: 'suppression de compte', fr: '/suppression-compte/', en: '/en/delete-account/' },
  { name: 'aide', fr: '/aide/', en: '/en/help/' },
]

const helpPages = {
  fr: { url: helpPageUrl('fr'), faq: 'questions' },
  en: { url: helpPageUrl('en'), faq: 'faq' },
}

const idsOf = (html: string) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))

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

describe('site public memopatte.app', () => {
  it.each(translations.flatMap(({ fr, en }) => [fr, en]))('la page %s existe', (url) => {
    expect(existsSync(join(SITE, fileOf(url)))).toBe(true)
  })

  it.each(['404.html', 'en/404.html'])(
    'la page %s ramène aux deux accueils et à l’aide sans être indexée',
    (page) => {
      const html = read(page)
      const lang = languageOf(page)
      expect(html).toContain('<meta name="robots" content="noindex" />')
      expect(html).toContain('href="/"')
      expect(html).toContain('href="/en/"')
      expect(html).toContain(`href="${new URL(helpPageUrl(lang)).pathname}"`)
    },
  )

  it('les boutons tiennent sur une ligne', () => {
    const button = read('style.css').match(/\.button \{[^}]*\}/)?.[0] ?? ''
    expect(button).toContain('white-space: nowrap')
  })

  it.each(FONTS)('la police %s est servie par le site', (font) => {
    expect(existsSync(join(SITE, 'fonts', font))).toBe(true)
    expect(read('style.css')).toContain(`url('/fonts/${font}')`)
  })

  it.each(FONT_LICENSES)('la licence %s accompagne les polices', (license) => {
    expect(read(join('fonts', license))).toContain('SIL Open Font License, Version 1.1')
  })

  it('les polices s’affichent sans attendre leur chargement', () => {
    const faces = read('style.css').match(/@font-face \{[^}]*\}/g) ?? []
    expect(faces).toHaveLength(FONTS.length)
    for (const face of faces) expect(face).toContain('font-display: swap')
  })

  it('le style ne pointe que vers des fichiers du site qui existent', () => {
    const targets = [...read('style.css').matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(existsSync(join(SITE, target)), `${target} introuvable`).toBe(true)
    }
  })

  it('le style n’anime rien de lui-même et respecte la réduction des animations', () => {
    const css = read('style.css')
    expect(css).not.toMatch(/@keyframes|\banimation\s*:/)
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
  })

  it.each(pages)('%s ne renvoie ailleurs que vers des sites connus', (page) => {
    const hosts = [...read(page).matchAll(/\b(?:href|src)="https?:\/\/([^/"]+)/g)].map(
      (match) => match[1],
    )
    for (const host of hosts) expect(OUTBOUND_HOSTS).toContain(host)
  })

  describe.each(languages)('en-tête et pied de page en %s', (lang) => {
    const pagesOfLanguage = lang === 'fr' ? frenchPages : englishPages
    const [model, ...others] = pagesOfLanguage

    it.each(others)('%s a le même en-tête que les autres pages', (page) => {
      expect(withoutLanguageTarget(headerOf(read(page)))).toBe(
        withoutLanguageTarget(headerOf(read(model!))),
      )
    })

    it.each(others)('%s a le même pied de page que les autres pages', (page) => {
      expect(withoutLanguageTarget(footerOf(read(page)))).toBe(
        withoutLanguageTarget(footerOf(read(model!))),
      )
    })

    it('le pied de page mène à l’aide, aux pages légales et au contact', () => {
      const footer = footerOf(read(model!))
      for (const url of [
        new URL(helpPageUrl(lang)).pathname,
        policies[lang],
        deletions[lang],
        SITE_LEGAL_NOTICES[lang],
        CONTACT,
      ]) {
        expect(footer).toContain(`href="${url}"`)
      }
    })
  })

  it.each(pages)('%s déclare sa langue', (page) => {
    expect(read(page)).toContain(`<html lang="${languageOf(page)}">`)
  })

  it.each(pages)('%s ne charge rien depuis un autre site', (page) => {
    const html = read(page)
    for (const script of html.match(/<script\b[^>]*>/gi) ?? []) {
      expect(script).toBe('<script type="application/ld+json">')
    }
    const loadingTags = [...html.matchAll(/<(?:link|img|source|iframe)\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => !/\brel="(?:alternate|canonical)"/.test(tag))
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
      if (PAGES_TO_COME.includes(target)) continue
      const file = target.endsWith('/') ? `${target}index.html` : target
      expect(existsSync(join(SITE, file)), `${target} introuvable`).toBe(true)
    }
  })

  it.each(pages)('%s renvoie aux mentions légales en pied de page', (page) => {
    const lang = languageOf(page)
    expect(footerOf(read(page))).toContain(
      `<a href="${SITE_LEGAL_NOTICES[lang]}">${legalNoticeLabels[lang]}</a>`,
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

  describe.each(languages)('page d’aide en %s', (lang) => {
    const { url, faq } = helpPages[lang]
    const html = read(fileOf(url.replace(SITE_URL, '')))

    it('commence par les questions fréquentes, avant les rappels', () => {
      const ids = [...idsOf(html)]
      const reminders = new URL(remindersHelpUrl(lang)).hash.slice(1)
      expect(ids.indexOf(faq)).toBeGreaterThanOrEqual(0)
      expect(ids.indexOf(faq)).toBeLessThan(ids.indexOf(reminders))
    })

    it('a la section que l’app ouvre pour les rappels', () => {
      expect(idsOf(html)).toContain(new URL(remindersHelpUrl(lang)).hash.slice(1))
    })

    it('ne renvoie qu’à des sections qui existent', () => {
      const anchors = [...html.matchAll(/href="#([^"]+)"/g)].map((m) => m[1])
      expect(anchors.length).toBeGreaterThan(0)
      for (const anchor of anchors) expect(idsOf(html), `#${anchor}`).toContain(anchor)
    })

    it('donne l’e-mail de contact', () => {
      expect(html).toContain(`href="${CONTACT}"`)
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
