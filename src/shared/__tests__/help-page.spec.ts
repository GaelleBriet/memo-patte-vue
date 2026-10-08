import { describe, expect, it } from 'vitest'

import { helpPageUrl, remindersHelpUrl } from '../domain/help-page'

describe('helpPageUrl', () => {
  it.each([
    ['fr', 'https://memopatte.app/aide/'],
    ['en', 'https://memopatte.app/en/help/'],
  ] as const)('mène à la page Aide entière en %s', (locale, url) => {
    expect(helpPageUrl(locale)).toBe(url)
  })
})

describe('remindersHelpUrl', () => {
  it('mène à la page « Rappels » de l’aide en français', () => {
    expect(remindersHelpUrl('fr')).toBe('https://memopatte.app/aide/rappels/')
  })

  it('mène à la page « Reminders » de l’aide en anglais', () => {
    expect(remindersHelpUrl('en')).toBe('https://memopatte.app/en/help/reminders/')
  })
})
