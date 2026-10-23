import { afterEach, describe, expect, it } from 'vitest'

import type { CloudBackupStatus } from '../logic/backup-status'
import { cloudBackupText } from '../logic/backup-status-text'
import i18n from '@/core/i18n'
import type { Translate } from '@/core/i18n/translate'
import { plain } from '@/shared/__tests__/plain'

const t: Translate = (key, named = {}, plural) =>
  plural === undefined ? i18n.global.t(key, named) : i18n.global.t(key, named, plural)

const NOW = new Date(2026, 9, 23, 8, 30)

function local(day: number, hours: number, minutes: number, seconds = 0): string {
  return new Date(2026, 9, day, hours, minutes, seconds).toISOString()
}

function text(status: CloudBackupStatus) {
  const { title, hint } = cloudBackupText(t, status, NOW)
  return { title: plain(title), hint: hint === null ? null : plain(hint) }
}

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

describe('texte de la sauvegarde cloud', () => {
  it('dernière sauvegarde il y a 5 min, sauvegarde et restauration garanties', () => {
    expect(text({ kind: 'saved', at: local(23, 8, 25) })).toEqual({
      title: 'Dernière sauvegarde : il y a 5 min',
      hint: 'Sauvegarde et restauration garanties.',
    })
  })

  it('compte en minutes jusqu’à 59, et au moins une minute', () => {
    expect(text({ kind: 'saved', at: local(23, 7, 31) }).title).toBe(
      'Dernière sauvegarde : il y a 59 min',
    )
    expect(text({ kind: 'saved', at: local(23, 8, 29, 50) }).title).toBe(
      'Dernière sauvegarde : il y a 1 min',
    )
  })

  it('au-delà d’une heure, le moment comme dans « Sauvegarde trouvée »', () => {
    expect(text({ kind: 'saved', at: local(23, 7, 30) }).title).toBe(
      'Dernière sauvegarde : aujourd’hui à 7 h 30',
    )
    expect(text({ kind: 'saved', at: local(22, 18, 20) }).title).toBe(
      'Dernière sauvegarde : hier à 18 h 20',
    )
    expect(text({ kind: 'saved', at: local(12, 21, 4) }).title).toBe(
      'Dernière sauvegarde : le 12 octobre à 21 h 04',
    )
  })

  it('première sauvegarde en cours, 120 éléments sur 348', () => {
    expect(text({ kind: 'first-backup', done: 120, total: 348 })).toEqual({
      title: 'Première sauvegarde en cours',
      hint: '120 éléments sur 348',
    })
    expect(text({ kind: 'first-backup', done: 1, total: 348 }).hint).toBe('1 élément sur 348')
  })

  it('en attente de réseau, la sauvegarde reprend dès que le téléphone est connecté', () => {
    expect(text({ kind: 'waiting-network' })).toEqual({
      title: 'En attente de réseau',
      hint: 'La sauvegarde reprend dès que ce téléphone est connecté à Internet.',
    })
  })

  it('reconnecte-toi, interrompue depuis hier à 18 h 20, rien n’est perdu', () => {
    expect(text({ kind: 'interrupted', since: local(22, 18, 20) })).toEqual({
      title: 'Reconnecte-toi pour reprendre la sauvegarde',
      hint: 'Interrompue depuis hier à 18 h 20. Rien n’est perdu.',
    })
  })

  it('sans sauvegarde réussie, pas de date d’interruption', () => {
    expect(text({ kind: 'interrupted', since: null }).hint).toBeNull()
  })

  it('en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(text({ kind: 'saved', at: local(23, 8, 25) })).toEqual({
      title: 'Last backup: 5 min ago',
      hint: 'Backup and restore guaranteed.',
    })
    expect(text({ kind: 'first-backup', done: 120, total: 348 })).toEqual({
      title: 'First backup in progress',
      hint: '120 of 348 items',
    })
    expect(text({ kind: 'waiting-network' })).toEqual({
      title: 'Waiting for network',
      hint: 'Backup resumes as soon as this phone is online.',
    })
    expect(text({ kind: 'interrupted', since: local(22, 18, 20) })).toEqual({
      title: 'Sign back in to resume backup',
      hint: 'Interrupted since yesterday at 6:20 pm. Nothing is lost.',
    })
  })
})
