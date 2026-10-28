import { afterEach, describe, expect, it } from 'vitest'

import type { BackupStatus, CloudBackupStatus } from '../logic/backup-status'
import {
  backupSubtitle,
  cloudBackupText,
  pausedBackupText,
  refusedItemsHelpText,
} from '../logic/backup-status-text'
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
    expect(text({ kind: 'waiting-network', firstBackup: false })).toEqual({
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
    expect(text({ kind: 'waiting-network', firstBackup: false })).toEqual({
      title: 'Waiting for network',
      hint: 'Backup resumes as soon as this phone is online.',
    })
    expect(text({ kind: 'interrupted', since: local(22, 18, 20) })).toEqual({
      title: 'Sign back in to resume backup',
      hint: 'Interrupted since yesterday at 6:20 pm. Nothing is lost.',
    })
  })
})

describe('texte des éléments refusés', () => {
  it('un élément, puis plusieurs, avec le lien vers l’aide', () => {
    expect(plain(refusedItemsHelpText(t, 1))).toBe(
      'Un élément n’a pas pu être sauvegardé · Contacter l’aide',
    )
    expect(plain(refusedItemsHelpText(t, 3))).toBe(
      '3 éléments n’ont pas pu être sauvegardés · Contacter l’aide',
    )
  })

  it('en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(plain(refusedItemsHelpText(t, 1))).toBe(
      'One item couldn’t be backed up · Contact support',
    )
    expect(plain(refusedItemsHelpText(t, 3))).toBe(
      '3 items couldn’t be backed up · Contact support',
    )
  })
})

describe('sous-titre de la rubrique Sauvegarde', () => {
  const sub = (status: BackupStatus | null, refused = 0) => {
    const text = backupSubtitle(t, status, refused, NOW)
    return text === null ? null : plain(text)
  }

  it('reprend la première ligne de la carte, sans le compte « sur M »', () => {
    expect(sub({ kind: 'first-backup', done: 3, total: 9 })).toBe('Première sauvegarde en cours')
    expect(sub({ kind: 'waiting-network', firstBackup: false })).toBe('En attente de réseau')
    expect(sub({ kind: 'interrupted', since: local(22, 18, 20) })).toBe(
      'Reconnecte-toi pour reprendre la sauvegarde',
    )
    expect(sub({ kind: 'saved', at: local(23, 8, 25) })).toBe('Dernière sauvegarde : il y a 5 min')
  })

  it('les éléments refusés priment sur la dernière sauvegarde, sans lien vers l’aide', () => {
    expect(sub({ kind: 'saved', at: local(23, 8, 25) }, 1)).toBe(
      'Un élément n’a pas pu être sauvegardé',
    )
    expect(sub({ kind: 'saved', at: local(23, 8, 25) }, 3)).toBe(
      '3 éléments n’ont pas pu être sauvegardés',
    )
  })

  it('les éléments refusés ne priment pas sur les trois autres états', () => {
    expect(sub({ kind: 'first-backup', done: 3, total: 9 }, 2)).toBe('Première sauvegarde en cours')
    expect(sub({ kind: 'waiting-network', firstBackup: false }, 2)).toBe('En attente de réseau')
    expect(sub({ kind: 'interrupted', since: null }, 2)).toBe(
      'Reconnecte-toi pour reprendre la sauvegarde',
    )
  })

  it('rien pour un gratuit, une lecture ratée ou avant la lecture : le sous-titre actuel reste', () => {
    expect(sub(null, 2)).toBeNull()
    expect(sub({ kind: 'local' })).toBeNull()
    expect(sub({ kind: 'unread' })).toBeNull()
  })

  it('en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(sub({ kind: 'first-backup', done: 3, total: 9 })).toBe('First backup in progress')
    expect(sub({ kind: 'waiting-network', firstBackup: false })).toBe('Waiting for network')
    expect(sub({ kind: 'interrupted', since: null })).toBe('Sign back in to resume backup')
    expect(sub({ kind: 'saved', at: local(23, 8, 25) })).toBe('Last backup: 5 min ago')
    expect(sub({ kind: 'saved', at: local(23, 8, 25) }, 1)).toBe('One item couldn’t be backed up')
    expect(sub({ kind: 'saved', at: local(23, 8, 25) }, 3)).toBe('3 items couldn’t be backed up')
  })
})

describe('texte de la sauvegarde en pause', () => {
  function paused(keptUntil: string | null) {
    const { title, hint, risk, kept } = pausedBackupText(t, { keptUntil })
    return { title, hint, risk, kept: kept === null ? null : plain(kept) }
  }

  it('dit la pause, ce qui reste sur le téléphone et jusqu’à quand la sauvegarde est conservée', () => {
    expect(paused('2027-09-14')).toEqual({
      title: 'Ta sauvegarde cloud est en pause',
      hint: 'Tes carnets restent sur ton téléphone.',
      risk: 'Depuis la pause, tes changements ne sont plus sauvegardés : si ce téléphone est perdu, ils peuvent l’être aussi.',
      kept: 'Ta dernière sauvegarde est conservée jusqu’au 14 sept. 2027. Réactive Plus pour reprendre là où elle s’était arrêtée.',
    })
  })

  it('se lit en anglais', () => {
    i18n.global.locale.value = 'en'

    expect(paused('2027-09-14')).toEqual({
      title: 'Your cloud backup is paused',
      hint: 'Your health records stay on your phone.',
      risk: 'Since the pause, your changes are no longer backed up: if this phone is lost, they may be too.',
      kept: 'Your last backup is kept until Sep 14, 2027. Reactivate Plus to pick up where it left off.',
    })
  })

  it('ne dit pas jusqu’à quand quand la fin de Plus est inconnue', () => {
    expect(paused(null).kept).toBeNull()
  })
})
