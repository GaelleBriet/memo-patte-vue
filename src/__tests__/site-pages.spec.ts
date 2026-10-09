// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { helpPageUrl } from '@/shared/domain/help-page'

import { decode } from './site-text'

const SITE = 'site'
const SITE_URL = 'https://memopatte.app'
const CONTACT_EMAIL = 'contact@memopatte.app'
const CONTACT = `mailto:${CONTACT_EMAIL}`
const PUBLISHER_PHONE = '+33 7 69 46 49 63'
const SITE_LEGAL_NOTICES = { fr: '/mentions-legales/', en: '/en/legal-notice/' }
const OUTBOUND_HOSTS = ['memopatte.app', 'play.google.com', 'github.com', 'www.cnil.fr']
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
  { name: 'mentions légales', ...SITE_LEGAL_NOTICES },
  { name: 'rappel de vermifuge', fr: '/rappel-vermifuge/', en: '/en/dewormer-reminder/' },
  {
    name: 'rappel d’antiparasitaire',
    fr: '/rappel-antiparasitaire/',
    en: '/en/parasite-control-reminder/',
  },
  { name: 'carnet de vaccination', fr: '/carnet-vaccination/', en: '/en/vaccine-record/' },
  { name: 'plusieurs animaux', fr: '/plusieurs-animaux/', en: '/en/multiple-pets/' },
]
const STYLESHEETS = ['style.css', 'vitrine.css']

function withoutReducedMotionBlocks(css: string): string {
  const opening = '@media (prefers-reduced-motion: no-preference)'
  let rest = css
  let start = rest.indexOf(opening)
  while (start !== -1) {
    let depth = 0
    let end = rest.indexOf('{', start)
    for (; end < rest.length; end++) {
      if (rest[end] === '{') depth++
      if (rest[end] === '}' && --depth === 0) break
    }
    rest = rest.slice(0, start) + rest.slice(end + 1)
    start = rest.indexOf(opening)
  }
  return rest
}

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

  it.each(STYLESHEETS)('%s ne pointe que vers des fichiers du site qui existent', (sheet) => {
    const targets = [...read(sheet).matchAll(/url\(\s*["']?([^"')]+)/g)].map((m) => m[1]!)
    expect(targets.length).toBeGreaterThan(0)
    for (const target of targets) {
      expect(existsSync(join(SITE, target)), `${target} introuvable`).toBe(true)
    }
  })

  it('le style commun n’anime rien de lui-même et respecte la réduction des animations', () => {
    const css = read('style.css')
    expect(css).not.toMatch(/@keyframes|\banimation\s*:/)
    expect(css).toContain('@media (prefers-reduced-motion: no-preference)')
  })

  it('le style de la vitrine n’anime rien quand la réduction des animations est demandée', () => {
    const css = read('vitrine.css')
    expect(css).toMatch(/\banimation\s*:/)
    expect(withoutReducedMotionBlocks(css)).not.toMatch(/\b(animation|transition)\s*:/)
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

  it.each(pages)(
    '%s ne charge rien depuis un autre site, et ses scripts sont des fichiers du site',
    (page) => {
      const html = read(page)
      const scripts = html.match(/<script\b[^>]*>/gi) ?? []
      for (const script of scripts) {
        expect(script).toMatch(
          /^<script (?:type="module" src="\/(?!\/)[^"]+"|type="application\/ld\+json")>$/,
        )
      }
      const loadingTags = [...html.matchAll(/<(?:link|img|source|iframe)\b[^>]*>/gi)]
        .map((match) => match[0])
        .filter((tag) => !/\brel="(?:alternate|canonical)"/.test(tag))
      for (const tag of loadingTags) expect(tag).not.toMatch(/\b(href|src)="(https?:)?\/\//i)
    },
  )

  it.each(STYLESHEETS)('%s ne charge rien depuis un autre site', (sheet) => {
    const css = read(sheet)
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
      expect(read(fileOf(policies[lang]))).toContain(`href="${SITE_LEGAL_NOTICES[lang]}"`)
    })
  })

  describe.each(languages)('mentions légales en %s', (lang) => {
    const html = read(fileOf(SITE_LEGAL_NOTICES[lang]))
    const text = readableTexts(html)[0]!.replace(/\s+/g, ' ')

    it.each([
      'Gaëlle Briet',
      'entrepreneure individuelle',
      '47 rue Vivienne, 75002 Paris',
      '931 812 978 00027',
      CONTACT_EMAIL,
    ])('donne l’éditeur : %s', (detail) => {
      expect(text).toContain(detail)
    })

    it('donne l’hébergeur, son adresse et son téléphone', () => {
      expect(text).toContain('Cloudflare, Inc., 101 Townsend St, San Francisco, CA 94107')
      expect(text).toContain('+1 (650) 319-8930')
    })

    it('donne le téléphone de l’éditrice, qu’on peut toucher pour appeler', () => {
      expect(text).toContain(PUBLISHER_PHONE)
      expect(html).toContain('href="tel:+33769464963"')
    })

    it('ne donne aucun autre numéro de téléphone que ceux de l’éditrice et de l’hébergeur', () => {
      const phones = text.match(/\+\d[\d ()-]{7,}\d|\b0\d(?:[ .]?\d{2}){4}\b/g) ?? []
      expect(phones).toEqual([PUBLISHER_PHONE, '+1 (650) 319-8930'])
    })

    it('donne l’e-mail de contact', () => {
      expect(html).toContain(`href="${CONTACT}"`)
    })

    it('renvoie à la politique de confidentialité', () => {
      expect(html).toContain(`href="${policies[lang]}"`)
    })

    it('décrit la mesure d’audience avec les mots de la politique', () => {
      const policy = readableTexts(read(fileOf(policies[lang])))[0]!.replace(/\s+/g, ' ')
      const audience = policy.match(/(?:Ce site mesure|This website measures)[^.]*\./)?.[0]
      expect(audience).toBeDefined()
      expect(text).toContain(audience)
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
