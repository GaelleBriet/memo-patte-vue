import { afterEach, describe, expect, it } from 'vitest'

import { backupSummaryText, restoreProgressText } from '../logic/backup-summary-text'
import i18n from '@/core/i18n'
import type { Translate } from '@/core/i18n/translate'
import { plain } from '@/shared/__tests__/plain'

const t: Translate = (key, named = {}, plural) =>
  plural === undefined ? i18n.global.t(key, named) : i18n.global.t(key, named, plural)

const TODAY = '2026-10-21'

function localInstant(year: number, month: number, day: number, hours: number, minutes: number) {
  return new Date(year, month - 1, day, hours, minutes).toISOString()
}

function summary(animalCount: number, lastBackupAt: string): string {
  return plain(backupSummaryText(t, { animalCount, lastBackupAt }, TODAY))
}

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('résumé de la sauvegarde trouvée', () => {
  it('compte les animaux et date la dernière sauvegarde du jour à l’heure près', () => {
    expect(summary(3, localInstant(2026, 10, 21, 9, 12))).toBe(
      '3 animaux · dernière sauvegarde aujourd’hui à 9 h 12',
    )
  })

  it('dit « hier » la veille', () => {
    expect(summary(3, localInstant(2026, 10, 20, 21, 4))).toBe(
      '3 animaux · dernière sauvegarde hier à 21 h 04',
    )
  })

  it('donne le jour et l’heure dans l’année, avec « 1er »', () => {
    expect(summary(2, localInstant(2026, 10, 12, 21, 4))).toBe(
      '2 animaux · dernière sauvegarde le 12 octobre à 21 h 04',
    )
    expect(summary(2, localInstant(2026, 10, 1, 8, 0))).toBe(
      '2 animaux · dernière sauvegarde le 1er octobre à 8 h',
    )
  })

  it('donne la date avec l’année, sans l’heure, avant cette année', () => {
    expect(summary(2, localInstant(2025, 10, 12, 21, 4))).toBe(
      '2 animaux · dernière sauvegarde le 12 octobre 2025',
    )
  })

  it('met « animal » au singulier', () => {
    expect(summary(1, localInstant(2026, 10, 20, 21, 4))).toBe(
      '1 animal · dernière sauvegarde hier à 21 h 04',
    )
  })

  it('compte une heure du serveur en avance sur le téléphone comme aujourd’hui', () => {
    expect(summary(1, localInstant(2026, 10, 22, 0, 5))).toBe(
      '1 animal · dernière sauvegarde aujourd’hui à 0 h 05',
    )
  })

  it('en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(summary(3, localInstant(2026, 10, 20, 21, 4))).toBe(
      '3 pets · last backup yesterday at 9:04 pm',
    )
    expect(summary(1, localInstant(2026, 10, 21, 9, 12))).toBe(
      '1 pet · last backup today at 9:12 am',
    )
    expect(summary(2, localInstant(2026, 10, 12, 21, 4))).toBe(
      '2 pets · last backup on October 12 at 9:04 pm',
    )
    expect(summary(2, localInstant(2025, 10, 12, 21, 4))).toBe(
      '2 pets · last backup on October 12, 2025',
    )
  })
})

describe('progression de la restauration', () => {
  it('compte les éléments déjà restaurés sur le total', () => {
    expect(restoreProgressText(t, { done: 120, total: 348 })).toBe('120 éléments sur 348')
    expect(restoreProgressText(t, { done: 1, total: 348 })).toBe('1 élément sur 348')
    expect(restoreProgressText(t, { done: 0, total: 348 })).toBe('0 élément sur 348')
  })

  it('ne compte rien tant que le total n’est pas connu', () => {
    expect(restoreProgressText(t, { done: 0, total: 0 })).toBeNull()
  })

  it('en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(restoreProgressText(t, { done: 120, total: 348 })).toBe('120 of 348 items')
  })
})
