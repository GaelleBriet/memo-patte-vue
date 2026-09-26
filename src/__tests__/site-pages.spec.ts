// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SITE = 'site'
const CONTACT = 'mailto:memopatte@gaelle-briet.fr'

function htmlPages(dir: string): string[] {
  return readdirSync(join(SITE, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : htmlPages(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const pages = htmlPages('')
const read = (path: string) => readFileSync(join(SITE, path), 'utf8')
const fileOf = (url: string) => join(url.slice(1), 'index.html')
const visibleText = (html: string) => html.replace(/<[^>]*>/g, '')

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
const languages = ['fr', 'en'] as const

describe('site public memopatte.gaelle-briet.fr', () => {
  it.each(translations.flatMap(({ fr, en }) => [fr, en]))('la page %s existe', (url) => {
    expect(existsSync(join(SITE, fileOf(url)))).toBe(true)
  })

  it.each(pages)('%s déclare sa langue', (page) => {
    const lang = page.startsWith('en') ? 'en' : 'fr'
    expect(read(page)).toContain(`<html lang="${lang}">`)
  })

  it.each(pages)('%s ne charge rien depuis un autre site', (page) => {
    const html = read(page)
    expect(html).not.toMatch(/<script/i)
    expect(html).not.toMatch(/<(link|img|source|iframe)\b[^>]*\b(href|src)="(https?:)?\/\//i)
  })

  it('le style ne charge rien depuis un autre site', () => {
    const css = read('style.css')
    expect(css).not.toMatch(/@import/i)
    expect(css).not.toMatch(/url\(\s*["']?(https?:)?\/\//i)
  })

  describe.each(translations)('$name', ({ fr, en }) => {
    it('la page française annonce sa traduction et y mène', () => {
      const html = read(fileOf(fr))
      expect(html).toContain(`<link rel="alternate" hreflang="en" href="${en}" />`)
      expect(html).toContain(`<a href="${en}" hreflang="en" lang="en">English</a>`)
    })

    it('la page anglaise annonce sa traduction et y mène', () => {
      const html = read(fileOf(en))
      expect(html).toContain(`<link rel="alternate" hreflang="fr" href="${fr}" />`)
      expect(html).toContain(`<a href="${fr}" hreflang="fr" lang="fr">Français</a>`)
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
      expect(read(fileOf(policies[lang]))).toContain(
        'href="https://www.gaelle-briet.fr/mentions-legales/"',
      )
    })
  })

  it.each(pages.filter((page) => !page.startsWith('en')))(
    '%s met une espace insécable avant : ; ! ? et dans « »',
    (page) => {
      const text = visibleText(read(page))
      expect(text).not.toMatch(/[ \t\n][:;!?»]/)
      expect(text).not.toMatch(/«[ \t\n]/)
    },
  )
})
