// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { XMLParser, XMLValidator } from 'fast-xml-parser'
import { describe, expect, it } from 'vitest'

import { decode } from './site-text'

const SITE = 'site'
const SITE_URL = 'https://memopatte.app'
const read = (path: string) => readFileSync(join(SITE, path), 'utf8')
const plain = (html: string) =>
  decode(html.replace(/<[^>]*>/g, ''))
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')

const homes = {
  fr: {
    file: 'index.html',
    url: `${SITE_URL}/`,
    locale: 'fr_FR',
    sections: ['comment-ca-marche', 'tarifs', 'questions'],
    prices: ['1,49 € par mois', '9,99 € par an', '29,99 € à vie'],
    pricesNote: 'Prix indicatifs ; Google Play affiche le sien.',
    plusLater: 'MémoPatte Plus arrive après la sortie de l’app',
    bestValue: 'Meilleure offre',
    helpLinks: ['/aide/rappels/', '/aide/exporter/', '/aide/'],
  },
  en: {
    file: 'en/index.html',
    url: `${SITE_URL}/en/`,
    locale: 'en_US',
    sections: ['how-it-works', 'pricing', 'questions'],
    prices: ['€1.49/month', '€9.99/year', '€29.99 lifetime'],
    pricesNote: 'Indicative prices; Google Play shows its own.',
    plusLater: 'MémoPatte Plus arrives after the app launches',
    bestValue: 'Best value',
    helpLinks: ['/en/help/reminders/', '/en/help/export/', '/en/help/'],
  },
}
const languages = ['fr', 'en'] as const

const metaContent = (html: string, key: string) =>
  html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`))?.[1]

function pngSize(path: string) {
  const bytes = readFileSync(join(SITE, path))
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

function jsonLdOf(html: string): Record<string, unknown> {
  return jsonLdBlocks(html)[0]!
}

function jsonLdBlocks(html: string): Record<string, unknown>[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => JSON.parse(match[1]!) as Record<string, unknown>,
  )
}

type Faq = { mainEntity: { name: string; acceptedAnswer: { text: string } }[] }
const faqOf = (html: string) =>
  jsonLdBlocks(html).find((block) => block['@type'] === 'FAQPage') as Faq | undefined
const squash = (text: string) =>
  text
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const needs = [
  { fr: '/rappel-vermifuge/', en: '/en/dewormer-reminder/' },
  { fr: '/rappel-antiparasitaire/', en: '/en/parasite-control-reminder/' },
  { fr: '/carnet-vaccination/', en: '/en/vaccine-record/' },
  { fr: '/plusieurs-animaux/', en: '/en/multiple-pets/' },
]
const fileOf = (url: string) => join(url.slice(1), 'index.html')

describe.each(languages)('page vitrine en %s', (lang) => {
  const home = homes[lang]
  const html = read(home.file)
  const text = plain(html)

  it('a les sections visées par les liens de l’en-tête', () => {
    for (const id of home.sections) {
      expect(html).toContain(`id="${id}"`)
      expect(html).toContain(`href="${lang === 'fr' ? '' : '/en'}/#${id}"`)
    }
  })

  it('montre les captures de l’app avec leurs dimensions et une description', () => {
    const images = [...html.matchAll(/<img\b[^>]*class="screen"[^>]*>/g)].map((m) => m[0])
    expect(images).toHaveLength(9)
    for (const image of images) {
      const src = image.match(/src="\/([^"]+)"/)?.[1] ?? ''
      expect(existsSync(join(SITE, src))).toBe(true)
      expect(src).toMatch(new RegExp(`^img/${lang}-[a-z-]+\\.webp$`))
      expect(image).toMatch(/width="\d+"/)
      expect(image).toMatch(/height="\d+"/)
      expect(image.match(/alt="([^"]*)"/)?.[1]?.length ?? 0).toBeGreaterThan(30)
    }
    expect(images[0]).not.toContain('loading="lazy"')
    for (const image of images.slice(1)) expect(image).toContain('loading="lazy"')
  })

  it('affiche les trois offres de Plus, leur mention et leur arrivée après la sortie', () => {
    for (const price of home.prices) expect(text).toContain(price)
    expect(text).toContain(home.pricesNote)
    expect(text).toContain(home.plusLater)
    expect(text).toContain(home.bestValue)
  })

  it('donne une version légère de chaque capture pour les petits écrans', () => {
    const images = [...html.matchAll(/<img\b[^>]*class="screen"[^>]*>/g)].map((m) => m[0])
    for (const image of images) {
      const sources = image.match(/srcset="([^"]*)"/)?.[1]?.split(',') ?? []
      expect(sources).toHaveLength(2)
      for (const source of sources) {
        expect(existsSync(join(SITE, source.trim().split(' ')[0]!))).toBe(true)
      }
    }
  })

  it('montre l’accueil filtré sur chaque animal dont le prénom se touche', () => {
    const spots = [...html.matchAll(/<button\b[^>]*class="pet-spot"[^>]*>/g)].map((m) => m[0])
    expect(spots).toHaveLength(2)
    for (const spot of spots) {
      const image = spot.match(/data-src="\/([^"]+)"/)?.[1] ?? ''
      const small = spot.match(/data-small="\/([^"]+)"/)?.[1] ?? ''
      expect(image).toMatch(new RegExp(`^img/${lang}-accueil-[a-z]+\\.webp$`))
      expect(small).toBe(image.replace('.webp', '-400.webp'))
      for (const file of [image, small]) expect(existsSync(join(SITE, file))).toBe(true)
      expect(spot.match(/data-alt="([^"]*)"/)?.[1]?.length ?? 0).toBeGreaterThan(30)
    }
  })

  it('reprend ses questions fréquentes en données structurées, mot pour mot', () => {
    const questions = [...html.matchAll(/<summary>([\s\S]*?)<\/summary>/g)].map((m) =>
      squash(plain(m[1]!)),
    )
    expect(faqOf(html)?.mainEntity.map((entry) => squash(entry.name))).toEqual(questions)
  })

  it('mène aux quatre pages par soin', () => {
    for (const need of needs) expect(html).toContain(`href="${need[lang]}"`)
  })

  it('renvoie aux pages d’aide', () => {
    for (const link of home.helpLinks) expect(html).toContain(`href="${link}"`)
  })

  it('ne montre ni note, ni avis, ni nombre de taps', () => {
    expect(html).not.toMatch(/aggregateRating|ratingValue|reviewCount|★/)
    expect(text).not.toMatch(/\b\d+\s*(taps?|touchers?)\b/i)
  })

  it('déclare son adresse canonique', () => {
    expect(html).toContain(`<link rel="canonical" href="${home.url}" />`)
  })

  it('décrit l’app en données structurées, gratuite et sans note', () => {
    const app = jsonLdOf(html)
    expect(app).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'MobileApplication',
      name: 'MémoPatte',
      operatingSystem: 'Android',
      applicationCategory: 'LifestyleApplication',
      inLanguage: lang,
      url: home.url,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    })
    expect(app).not.toHaveProperty('aggregateRating')
    expect(app).not.toHaveProperty('review')
  })

  it('a une image de partage de 1200 × 630 et ses balises', () => {
    const image = metaContent(html, 'og:image') ?? ''
    expect(image).toMatch(new RegExp(`^${SITE_URL}/img/og-(preinscription-)?${lang}\\.png$`))
    expect(pngSize(image.replace(`${SITE_URL}/`, ''))).toEqual({ width: 1200, height: 630 })
    expect(metaContent(html, 'og:image:width')).toBe('1200')
    expect(metaContent(html, 'og:image:height')).toBe('630')
    expect(metaContent(html, 'og:image:alt')?.length ?? 0).toBeGreaterThan(20)
    expect(metaContent(html, 'og:title')).toBeTruthy()
    expect(metaContent(html, 'og:description')).toBeTruthy()
    expect(metaContent(html, 'og:url')).toBe(home.url)
    expect(metaContent(html, 'og:type')).toBe('website')
    expect(metaContent(html, 'og:locale')).toBe(home.locale)
    expect(metaContent(html, 'twitter:card')).toBe('summary_large_image')
  })
})

describe.each(needs.flatMap((need) => languages.map((lang) => ({ ...need, lang }))))(
  'page par soin $fr / $en en $lang',
  (need) => {
    const url = need[need.lang]
    const html = read(fileOf(url))

    it('déclare son adresse canonique et sa langue', () => {
      expect(html).toContain(`<link rel="canonical" href="${SITE_URL}${url}" />`)
      expect(html).toContain(`<html lang="${need.lang}">`)
    })

    it('a un titre, une description et un seul titre principal', () => {
      expect(html.match(/<title>([^<]+)<\/title>/)?.[1]?.length ?? 0).toBeGreaterThan(20)
      expect(metaContent(html, 'description')?.length ?? 0).toBeGreaterThan(80)
      expect(html.match(/<h1\b/g)).toHaveLength(1)
    })

    it('reprend ses questions en données structurées, mot pour mot', () => {
      const shown = [...html.matchAll(/<h3>([\s\S]*?)<\/h3>/g)].map((m) => squash(plain(m[1]!)))
      const faq = faqOf(html)?.mainEntity ?? []
      expect(faq.length).toBeGreaterThan(0)
      for (const entry of faq) {
        expect(shown).toContain(squash(entry.name))
        expect(squash(plain(html))).toContain(squash(entry.acceptedAnswer.text))
      }
    })

    it('donne son fil d’Ariane en données structurées', () => {
      const crumbs = jsonLdBlocks(html).find((block) => block['@type'] === 'BreadcrumbList')
      expect(crumbs).toMatchObject({
        itemListElement: [
          { position: 1, item: `${SITE_URL}${need.lang === 'fr' ? '/' : '/en/'}` },
          { position: 2, item: `${SITE_URL}${url}` },
        ],
      })
    })

    it('mène aux trois autres pages par soin', () => {
      const others = needs.map((other) => other[need.lang]).filter((other) => other !== url)
      for (const other of others) expect(html).toContain(`href="${other}"`)
    })

    it('ne montre ni note, ni avis', () => {
      expect(html).not.toMatch(/aggregateRating|ratingValue|reviewCount|★/)
    })
  },
)

describe('plan du site', () => {
  const xml = read('sitemap.xml')
  const parsed = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => name === 'url' || name === 'xhtml:link',
  }).parse(xml) as {
    urlset: { url: { loc: string; 'xhtml:link': { '@_hreflang': string; '@_href': string }[] }[] }
  }
  const urls = parsed.urlset.url
  const locs = urls.map((url) => url.loc)
  const helpPages = [
    ['exporter', 'export'],
    ['sauvegarde-android', 'android-backup'],
    ['plus', 'plus'],
    ['nouveau-telephone', 'new-phone'],
    ['effacer', 'erase'],
    ['ne-plus-suivre', 'stop-following'],
    ['rappels-en-retard', 'late-reminders'],
    ['rappels', 'reminders'],
  ].flatMap(([fr, en]) => [`/aide/${fr}/`, `/en/help/${en}/`])

  it('est un XML valide', () => {
    expect(XMLValidator.validate(xml)).toBe(true)
  })

  it('liste les pages du site, les mentions légales et les pages d’aide', () => {
    expect(locs).toEqual(
      expect.arrayContaining(
        [
          '/',
          '/en/',
          '/confidentialite/',
          '/en/privacy/',
          '/suppression-compte/',
          '/en/delete-account/',
          '/aide/',
          '/en/help/',
          '/mentions-legales/',
          '/en/legal-notice/',
          ...helpPages,
          ...needs.flatMap((need) => [need.fr, need.en]),
        ].map((path) => `${SITE_URL}${path}`),
      ),
    )
  })

  it('ne liste que des pages qui existent', () => {
    for (const loc of locs) {
      const path = loc.replace(SITE_URL, '')
      expect(existsSync(join(SITE, path, 'index.html'))).toBe(true)
    }
  })

  it('donne pour chaque page ses deux langues et la version par défaut', () => {
    for (const url of urls) {
      const links = url['xhtml:link']
      expect(links.map((link) => link['@_hreflang']).sort()).toEqual(['en', 'fr', 'x-default'])
      expect(links.map((link) => link['@_href'])).toContain(url.loc)
    }
  })
})

describe('robots.txt', () => {
  const robots = read('robots.txt')

  it('autorise tout et pointe le plan du site', () => {
    expect(robots).toMatch(/^User-agent: \*$/m)
    expect(robots).toMatch(/^Allow: \/$/m)
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`)
  })
})
