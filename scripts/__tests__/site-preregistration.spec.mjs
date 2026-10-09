import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { openPreregistration } from '../site-preregistration.mjs'

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.gaellebriet.memopatte'
const SITE_URL = 'https://memopatte.app'
const pages = {
  fr: {
    home: 'site/index.html',
    other: 'site/confidentialite/index.html',
    soon: /Bientôt\s+sur\s+Google\s+Play/i,
    label: 'Me préinscrire sur Google Play',
    note: 'Google Play t’envoie une notification le jour de la sortie.',
    answer: 'La date n’est pas encore fixée. La préinscription est ouverte',
  },
  en: {
    home: 'site/en/index.html',
    other: 'site/en/privacy/index.html',
    soon: /Coming\s+soon\s+to\s+Google\s+Play/i,
    label: 'Pre-register on Google Play',
    note: 'Google Play will notify you on launch day.',
    answer: 'The date isn’t set yet. Pre-registration is open',
  },
}

const count = (text, part) => text.split(part).length - 1
const metaContent = (html, key) =>
  html.match(new RegExp(`<meta\\s+(?:property|name)="${key}"\\s+content="([^"]*)"`))?.[1]

function pngSize(path) {
  const bytes = readFileSync(path)
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
}

describe.each(Object.entries(pages))('ouverture de la préinscription en %s', (lang, page) => {
  const home = openPreregistration(readFileSync(page.home, 'utf8'), lang, PLAY_URL)

  it('remplace chaque « bientôt » de l’accueil par le lien de préinscription', () => {
    expect(home).not.toMatch(page.soon)
    expect(count(home, `href="${PLAY_URL}"`)).toBe(3)
    expect(count(home, page.label)).toBe(3)
  })

  it('explique la préinscription une fois sous l’accroche et une fois sous l’appel final', () => {
    const ctas = home.match(/<div class="play-cta">[\s\S]*?<\/div>/g) ?? []
    expect(ctas).toHaveLength(2)
    for (const cta of ctas) expect(count(cta, page.note)).toBe(1)
  })

  it('met à jour la réponse « Quand sort MémoPatte ? »', () => {
    expect(home).toContain(page.answer)
  })

  it('met à jour la même réponse dans les données structurées', () => {
    const blocks = [...home.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    const faq = blocks.map((m) => JSON.parse(m[1])).find((block) => block['@type'] === 'FAQPage')
    const answer = faq.mainEntity[0].acceptedAnswer.text.replace(/\u00a0/g, ' ')
    expect(answer).toContain(page.answer)
    expect(answer).not.toMatch(/annoncée ici|announced here/)
  })

  it('passe à une image de partage qui existe, de 1200 × 630, et à sa description', () => {
    const image = metaContent(home, 'og:image') ?? ''
    expect(image).toBe(`${SITE_URL}/img/og-preinscription-${lang}.png`)
    const file = join('site', image.replace(SITE_URL, ''))
    expect(existsSync(file)).toBe(true)
    expect(pngSize(file)).toEqual({ width: 1200, height: 630 })
    expect(metaContent(home, 'og:image:alt')).not.toMatch(page.soon)
    expect(metaContent(home, 'og:description')).not.toMatch(page.soon)
  })

  it('ne change rien de plus au second passage', () => {
    expect(openPreregistration(home, lang, PLAY_URL)).toBe(home)
  })

  it('change aussi l’en-tête des autres pages', () => {
    const other = openPreregistration(readFileSync(page.other, 'utf8'), lang, PLAY_URL)
    expect(other).not.toMatch(page.soon)
    expect(other).toContain(page.label)
  })

  it('refuse une adresse qui n’est pas celle de Google Play', () => {
    expect(() => openPreregistration('', lang, 'https://example.com/')).toThrow(
      'Adresse Google Play invalide',
    )
  })
})
