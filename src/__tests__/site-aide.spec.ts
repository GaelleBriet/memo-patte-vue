// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { OLD_ANCHORS, redirectTarget } from '../../site/aide/ancres.js'
import { matches, normalize } from '../../site/aide/recherche.js'
import { helpPageUrl, remindersHelpUrl } from '@/shared/domain/help-page'

const SITE = 'site'
const SITE_URL = 'https://memopatte.app'
const CONTACT = 'mailto:contact@memopatte.app'

const read = (url: string) => readFileSync(join(SITE, url.slice(1), 'index.html'), 'utf8')
const idsOf = (html: string) => new Set([...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]))
const textOf = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')

const languages = ['fr', 'en'] as const
function sitePages(dir = ''): string[] {
  return readdirSync(join(SITE, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return sitePages(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const ENTITIES: Record<string, string> = { nbsp: '\u00a0', amp: '&', quot: '"', lt: '<', gt: '>' }
const plain = (html: string) =>
  html
    .replace(/<span class="visually-hidden">[\s\S]*?<\/span>/g, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#\d+|[a-z]+);/g, (entity, code: string) =>
      code.startsWith('#')
        ? String.fromCodePoint(Number(code.slice(1)))
        : (ENTITIES[code] ?? entity),
    )
    .replace(/[ \t\r\n]+/g, ' ')
    .trim()

function answerOf(html: string, section?: string): string {
  const body = html
    .split('</h1>')[1]!
    .split(/<p class="help-contact">|<p>\s*<a class="back-link"/)[0]!
    .replace(/<figure\b[\s\S]*?<\/figure>/g, '')
    .replace(/<p class="updated">[\s\S]*?<\/p>/g, '')
  const parts = body.split(/(?=<h2 id=")/)
  if (!section) return parts[0]!
  return parts.find((part) => part.startsWith(`<h2 id="${section}"`)) ?? ''
}
const hubs = { fr: '/aide/', en: '/en/help/' } as const

const questions = [
  { fr: 'exporter', en: 'export', zones: 3, textOrder: [1, 2, 3] },
  { fr: 'sauvegarde-android', en: 'android-backup', zones: 0, textOrder: [] },
  { fr: 'plus', en: 'plus', zones: 0, textOrder: [] },
  { fr: 'nouveau-telephone', en: 'new-phone', zones: 0, textOrder: [] },
  { fr: 'effacer', en: 'erase', zones: 2, textOrder: [2, 1] },
  { fr: 'ne-plus-suivre', en: 'stop-following', zones: 3, textOrder: [1, 2, 3] },
  { fr: 'rappels-en-retard', en: 'late-reminders', zones: 0, textOrder: [] },
  { fr: 'rappels', en: 'reminders', zones: 0, textOrder: [] },
]
const pageOf = (lang: 'fr' | 'en', slug: string) => `${hubs[lang]}${slug}/`

const anchorsKeptOnHub = { fr: ['questions', 'nous-ecrire'], en: ['faq', 'email-us'] }
const oldAnchors = {
  fr: [
    'exporter',
    'sauvegarde-android',
    'plus',
    'nouveau-telephone',
    'effacer',
    'ne-plus-suivre',
    'rappels-en-retard',
    'rappels',
    'rappels-notifications',
    'rappels-batterie',
    'rappels-precis',
    'rappels-limites',
  ],
  en: [
    'export',
    'android-backup',
    'plus',
    'new-phone',
    'erase',
    'stop-following',
    'late-reminders',
    'reminders',
    'reminders-notifications',
    'reminders-battery',
    'reminders-exact',
    'reminders-limits',
  ],
}

const keyContents = {
  fr: {
    exporter: [
      'Documents › MémoPatte',
      '« Fusionner »',
      '« Remplacer »',
      'Les photos ne sont pas exportées.',
      'MémoPatte reprogramme ensuite tes rappels.',
    ],
    rappels: [
      'Autoriser à définir des alarmes et des rappels',
      'Suspendre l’activité si inutilisée',
    ],
  },
  en: {
    export: [
      'Documents › MémoPatte',
      '“Merge”',
      '“Replace”',
      'Photos aren’t exported.',
      'MémoPatte then schedules your reminders again.',
    ],
    reminders: ['Allow setting alarms and reminders', 'Pause app activity if unused'],
  },
}

describe('aide du site en pages', () => {
  describe.each(languages)('accueil de l’aide en %s', (lang) => {
    const html = read(hubs[lang])

    it.each(questions.map((q) => q[lang]))('mène à la question %s', (slug) => {
      expect(html).toContain(`href="${pageOf(lang, slug)}"`)
    })

    it('a un champ de recherche avec son libellé', () => {
      const input = html.match(/<input\b[^>]*type="search"[^>]*>/)?.[0] ?? ''
      const id = input.match(/\bid="([^"]+)"/)?.[1]
      expect(id).toBeTruthy()
      expect(html).toMatch(new RegExp(`<label\\b[^>]*for="${id}"`))
    })

    it('cache la recherche tant que le script ne l’a pas branchée', () => {
      expect(html).toMatch(/<form\b[^>]*class="help-search"[^>]*\bhidden\b/)
      expect(html).toContain('<script type="module" src="/aide/recherche.js"></script>')
    })

    it('prévoit un message « aucun résultat » qui mène au contact', () => {
      const message = html.match(/<p\b[^>]*class="help-no-result"[^>]*>([\s\S]*?)<\/p>/)
      expect(message?.[0]).toMatch(/\bhidden\b/)
      expect(message?.[1]).toContain(`href="${CONTACT}"`)
    })

    it('renvoie les anciens liens à ancre vers les nouvelles pages', () => {
      expect(html).toContain('<script type="module" src="/aide/ancres.js"></script>')
    })

    it.each(anchorsKeptOnHub[lang])('garde la section %s', (id) => {
      expect(idsOf(html)).toContain(id)
    })

    it('donne l’e-mail de contact', () => {
      expect(html).toContain(`href="${CONTACT}"`)
    })
  })

  describe.each(questions)('question $fr / $en', (question) => {
    it.each(languages)('existe en %s', (lang) => {
      expect(existsSync(join(SITE, pageOf(lang, question[lang]).slice(1), 'index.html'))).toBe(true)
    })

    it.each(languages)('déclare sa traduction et son adresse canonique en %s', (lang) => {
      const html = read(pageOf(lang, question[lang])).replace(/\s+/g, ' ')
      const fr = `${SITE_URL}${pageOf('fr', question.fr)}`
      const en = `${SITE_URL}${pageOf('en', question.en)}`
      expect(html).toContain(`<link rel="canonical" href="${lang === 'fr' ? fr : en}" />`)
      expect(html).toContain(`<link rel="alternate" hreflang="fr" href="${fr}" />`)
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${en}" />`)
      expect(html).toContain(`<link rel="alternate" hreflang="x-default" href="${fr}" />`)
    })

    it('mène à sa traduction depuis l’en-tête et le pied de page', () => {
      const fr = read(pageOf('fr', question.fr))
      const en = read(pageOf('en', question.en))
      expect(
        fr.match(new RegExp(`href="${pageOf('en', question.en)}" hreflang="en"`, 'g')),
      ).toHaveLength(2)
      expect(
        en.match(new RegExp(`href="${pageOf('fr', question.fr)}" hreflang="fr"`, 'g')),
      ).toHaveLength(2)
    })

    it.each(languages)('a un fil d’Ariane et un retour vers l’accueil de l’aide en %s', (lang) => {
      const html = read(pageOf(lang, question[lang]))
      const breadcrumb = html.match(/<nav class="breadcrumb"[\s\S]*?<\/nav>/)?.[0] ?? ''
      expect(breadcrumb).toContain(`href="${hubs[lang]}"`)
      expect(html).toMatch(new RegExp(`<a class="back-link" href="${hubs[lang]}"`))
    })

    it.each(languages)('liste les autres questions et marque la page en cours en %s', (lang) => {
      const html = read(pageOf(lang, question[lang]))
      const aside = html.match(/<aside class="other-questions"[\s\S]*?<\/aside>/)?.[0] ?? ''
      for (const other of questions) expect(aside).toContain(`href="${pageOf(lang, other[lang])}"`)
      expect(aside).toContain(`href="${pageOf(lang, question[lang])}" aria-current="page"`)
      expect(aside.match(/aria-current/g)).toHaveLength(1)
    })

    it.each(languages)('porte une pastille par zone de sa capture, dans l’ordre, en %s', (lang) => {
      const html = read(pageOf(lang, question[lang]))
      const [text = '', caption = ''] = html.split('<figcaption')
      const numbers = (part: string) =>
        [...part.matchAll(/<span class="step-badge">[\s\S]*?(\d+)<\/span\s*>/g)].map((m) =>
          Number(m[1]),
        )
      const expected = Array.from({ length: question.zones }, (_, i) => i + 1)
      expect(numbers(text)).toEqual(question.textOrder)
      expect(numbers(caption)).toEqual(expected)
    })

    it.each(languages)(
      'donne la taille et le texte de remplacement de ses images en %s',
      (lang) => {
        const images = read(pageOf(lang, question[lang])).match(/<img\b[^>]*>/g) ?? []
        for (const image of images) {
          expect(image).toMatch(/\bwidth="\d+"/)
          expect(image).toMatch(/\bheight="\d+"/)
          expect(image).toMatch(/\balt="/)
        }
      },
    )
  })

  describe.each(languages)('contenu repris en %s', (lang) => {
    it.each(Object.entries(keyContents[lang]))('%s garde tout son contenu', (slug, phrases) => {
      const text = textOf(read(pageOf(lang, slug)))
      for (const phrase of phrases) expect(text).toContain(phrase)
    })

    it('titre l’export « exporter, et réimporter »', () => {
      const title = {
        fr: 'Comment exporter mon carnet, et le réimporter ?',
        en: 'How do I export my health record, and import it again?',
      }
      expect(textOf(read(pageOf(lang, questions[0]![lang])))).toContain(title[lang])
    })
  })

  describe.each(languages)('anciens liens à ancre en %s', (lang) => {
    it.each(oldAnchors[lang])('#%s mène à une page qui existe', (anchor) => {
      const target = redirectTarget(hubs[lang], `#${anchor}`)
      expect(target).toBeTruthy()
      const [path = '', fragment] = target!.split('#')
      expect(path).not.toBe(hubs[lang])
      expect(existsSync(join(SITE, path.slice(1), 'index.html'))).toBe(true)
      expect(fragment === undefined || idsOf(read(path)).has(fragment)).toBe(true)
    })

    it.each(anchorsKeptOnHub[lang])('#%s reste sur l’accueil de l’aide', (anchor) => {
      expect(redirectTarget(hubs[lang], `#${anchor}`)).toBeNull()
    })

    it('ne connaît pas d’autre ancienne ancre', () => {
      expect(Object.keys(OLD_ANCHORS[hubs[lang]]).sort()).toEqual([...oldAnchors[lang]].sort())
    })
  })

  it('ne redirige ni une autre page, ni une ancre inconnue, ni l’absence d’ancre', () => {
    expect(redirectTarget('/', '#rappels')).toBeNull()
    expect(redirectTarget('/aide/', '#inconnue')).toBeNull()
    expect(redirectTarget('/aide/', '')).toBeNull()
  })

  it('ignore une ancre mal encodée', () => {
    expect(redirectTarget('/aide/', '#%E0%A4%A')).toBeNull()
  })

  describe('recherche', () => {
    it('ignore les accents, la casse et les apostrophes', () => {
      expect(normalize('  Économie de BATTERIE, l’app ')).toBe('economie de batterie, l app')
    })

    it('trouve une question qui contient tous les mots cherchés, dans n’importe quel ordre', () => {
      expect(matches('Rappels précis : à l’heure prévue', 'prevue RAPPELS')).toBe(true)
      expect(matches('Rappels précis', 'rappels batterie')).toBe(false)
      expect(matches('Rappels précis', '   ')).toBe(true)
    })

    it('ne tient pas compte des mots d’une seule lettre', () => {
      expect(matches('Que faire du carnet', 'l’export du carnet')).toBe(false)
      expect(matches('Que faire du carnet', 'l’ carnet a')).toBe(true)
    })
  })

  describe.each(languages)('texte cherché de l’accueil de l’aide en %s', (lang) => {
    const entries = [
      ...read(hubs[lang]).matchAll(/<li\b[^>]*data-search="([^"]*)"[^>]*>\s*<a href="([^"]+)"/g),
    ].map((m) => ({ search: m[1]!, href: m[2]! }))

    it('a une entrée par question et par sous-partie des rappels', () => {
      expect(entries).toHaveLength(questions.length + 4)
    })

    it.each(entries.map((entry) => [entry.href, entry.search]))(
      '%s cherche dans le texte de sa page',
      (href, search) => {
        const [path = '', fragment] = href.split('#')
        expect(plain(search)).toBe(plain(answerOf(read(path), fragment)))
      },
    )
  })

  it.each(sitePages())('les liens à ancre de %s visent une section qui existe', (page) => {
    const html = readFileSync(join(SITE, page), 'utf8')
    const here = `/${page.replace(/index\.html$/, '')}`
    for (const [, path, fragment] of html.matchAll(/href="([^"#:]*)#([^"]+)"/g)) {
      const target = path || here
      expect(idsOf(read(target)), `${page} → ${target}#${fragment}`).toContain(fragment)
    }
  })

  describe('liens de l’app', () => {
    it.each(languages)('la page d’aide de l’app en %s est l’accueil de l’aide', (lang) => {
      expect(new URL(helpPageUrl(lang)).pathname).toBe(hubs[lang])
    })

    it.each(languages)('le lien des rappels en %s ouvre la page Rappels', (lang) => {
      const url = new URL(remindersHelpUrl(lang))
      expect(url.hash).toBe('')
      expect(existsSync(join(SITE, url.pathname.slice(1), 'index.html'))).toBe(true)
      expect(url.pathname).toBe(pageOf(lang, questions.at(-1)![lang]))
    })
  })
})
