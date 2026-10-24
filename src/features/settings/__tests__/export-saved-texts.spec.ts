import { afterEach, describe, expect, it } from 'vitest'

import i18n, { applyLocale } from '@/core/i18n'

const textes = {
  fr: {
    'settings.export.saved.json':
      'Export JSON enregistré. Retrouve-le dans l’app Fichiers, dossier Documents › MémoPatte.',
    'settings.export.saved.csv':
      'Export CSV (ZIP) enregistré. Retrouve-le dans l’app Fichiers, dossier Documents › MémoPatte.',
    'settings.pdf.saved':
      'PDF enregistré. Retrouve-le dans l’app Fichiers, dossier Documents › MémoPatte.',
    'settings.export.openLabel.csv': 'Ouvrir l’export CSV (ZIP)',
    'settings.erase.exports':
      'Les exports restent sur le téléphone, dans l’app Fichiers, dossier Documents › MémoPatte.',
  },
  en: {
    'settings.export.saved.json':
      'JSON export saved. Find it in the Files app, in Documents › MémoPatte.',
    'settings.export.saved.csv':
      'CSV export (ZIP) saved. Find it in the Files app, in Documents › MémoPatte.',
    'settings.pdf.saved': 'PDF saved. Find it in the Files app, in Documents › MémoPatte.',
    'settings.export.openLabel.csv': 'Open the CSV export (ZIP)',
    'settings.erase.exports':
      'Exports stay on the phone, in the Files app, in Documents › MémoPatte.',
  },
} as const

afterEach(() => applyLocale('fr'))

describe('textes des exports enregistrés', () => {
  it.each(Object.entries(textes))('dit où retrouver le fichier (%s)', (langue, cles) => {
    applyLocale(langue as 'fr' | 'en')

    for (const [cle, attendu] of Object.entries(cles)) {
      expect(i18n.global.t(cle)).toBe(attendu)
    }
  })
})
