import { describe, expect, it } from 'vitest'

import { remindersHelpUrl } from '../domain/help-page'

describe('remindersHelpUrl', () => {
  it('mène à la section « Rappels » de la page Aide en français', () => {
    expect(remindersHelpUrl('fr')).toBe('https://memopatte.gaelle-briet.fr/aide/#rappels')
  })

  it('mène à la section « Reminders » de la page Help en anglais', () => {
    expect(remindersHelpUrl('en')).toBe('https://memopatte.gaelle-briet.fr/en/help/#reminders')
  })
})
