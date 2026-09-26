// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const SITE = 'site'

function htmlPages(dir: string): string[] {
  return readdirSync(join(SITE, dir), { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === '__tests__' ? [] : htmlPages(path)
    return entry.name.endsWith('.html') ? [path] : []
  })
}

const pages = htmlPages('')
const read = (path: string) => readFileSync(join(SITE, path), 'utf8')

describe('site public memopatte.gaelle-briet.fr', () => {
  it('a une page d’accueil en français et en anglais', () => {
    expect(pages).toEqual(expect.arrayContaining(['index.html', join('en', 'index.html')]))
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

  it('les deux accueils se renvoient l’un à l’autre', () => {
    expect(read('index.html')).toContain('hreflang="en" href="/en/"')
    expect(read(join('en', 'index.html'))).toContain('hreflang="fr" href="/"')
  })

  it.each(pages.filter((page) => !page.startsWith('en')))(
    '%s met une espace insécable avant : ; ! ?',
    (page) => {
      const text = read(page).replace(/<[^>]*>/g, '')
      expect(text).not.toMatch(/ [:;!?]/)
    },
  )
})
