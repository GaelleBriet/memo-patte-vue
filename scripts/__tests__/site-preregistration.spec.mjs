import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { openPreregistration } from '../site-preregistration.mjs'

const PLAY_URL = 'https://play.google.com/store/apps/details?id=com.gaellebriet.memopatte'
const pages = {
  fr: {
    home: 'site/index.html',
    other: 'site/confidentialite/index.html',
    soon: /Bientôt\s+sur\s+Google\s+Play/,
    label: 'Me préinscrire sur Google Play',
    note: 'Google Play t’envoie une notification le jour de la sortie.',
    answer: 'La date n’est pas encore fixée. La préinscription est ouverte',
  },
  en: {
    home: 'site/en/index.html',
    other: 'site/en/privacy/index.html',
    soon: /Coming\s+soon\s+to\s+Google\s+Play/,
    label: 'Pre-register on Google Play',
    note: 'Google Play will notify you on launch day.',
    answer: 'The date isn’t set yet. Pre-registration is open',
  },
}

describe.each(Object.entries(pages))('ouverture de la préinscription en %s', (lang, page) => {
  const home = openPreregistration(readFileSync(page.home, 'utf8'), lang, PLAY_URL)

  it('remplace chaque « bientôt » de l’accueil par le lien de préinscription', () => {
    expect(home).not.toMatch(page.soon)
    const links = home.match(new RegExp(`href="${PLAY_URL.replace(/[.?]/g, '\\$&')}"`, 'g'))
    expect(links).toHaveLength(3)
    expect(home.split(page.label)).toHaveLength(4)
  })

  it('explique la préinscription sous l’accroche et l’appel final', () => {
    expect(home.split(page.note)).toHaveLength(3)
  })

  it('met à jour la réponse « Quand sort MémoPatte ? » et l’image de partage', () => {
    expect(home).toContain(page.answer)
    expect(home).toContain(`/img/og-preinscription-${lang}.png`)
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
