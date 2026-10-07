import { describe, expect, it } from 'vitest'

import { helpPageUrl, remindersHelpUrl } from '../domain/help-page'

describe('helpPageUrl', () => {
  it.each([
    ['fr', 'https://memopatte.gaelle-briet.fr/aide/'],
    ['en', 'https://memopatte.gaelle-briet.fr/en/help/'],
  ] as const)('mène à la page Aide entière en %s', (locale, url) => {
    expect(helpPageUrl(locale)).toBe(url)
  })
})

describe('remindersHelpUrl', () => {
  it('mène à la section « Rappels » de la page Aide en français', () => {
    expect(remindersHelpUrl('fr')).toBe('https://memopatte.gaelle-briet.fr/aide/#rappels')
  })

  it('mène à la section « Reminders » de la page Help en anglais', () => {
    expect(remindersHelpUrl('en')).toBe('https://memopatte.gaelle-briet.fr/en/help/#reminders')
  })
})
