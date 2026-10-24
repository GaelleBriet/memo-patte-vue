import { describe, expect, it } from 'vitest'

import {
  backupStatusOf,
  photosBackedUpOf,
  refusedItemsOf,
  showsPhotosBackedUp,
} from '../logic/backup-status'
import type { BackupFacts } from '@/core/sync/service/backup-facts'

const YESTERDAY_6_20_PM = '2026-10-22T16:20:00.000Z'

const SAVED: BackupFacts = {
  eligible: true,
  signInNeeded: false,
  online: true,
  syncEnabled: true,
  lastSyncedAt: YESTERDAY_6_20_PM,
  remaining: 0,
  carnetSize: 348,
  refused: 0,
  refusedPhotos: 0,
}

const FIRST_BACKUP: BackupFacts = { ...SAVED, lastSyncedAt: null, remaining: 228 }

describe('backupStatusOf', () => {
  it('sur ce téléphone tant que la synchro n’est pas branchée', () => {
    expect(backupStatusOf(null)).toEqual({ kind: 'local' })
  })

  it('sur ce téléphone sans abonnement Plus en cours, même synchro activée', () => {
    expect(backupStatusOf({ ...SAVED, eligible: false })).toEqual({ kind: 'local' })
  })

  it('sur ce téléphone tant que la synchro du compte n’est pas activée', () => {
    expect(backupStatusOf({ ...SAVED, syncEnabled: false })).toEqual({ kind: 'local' })
  })

  it('dernière sauvegarde : l’heure du dernier cycle réussi', () => {
    expect(backupStatusOf(SAVED)).toEqual({ kind: 'saved', at: YESTERDAY_6_20_PM })
  })

  it('première sauvegarde : 348 éléments mis en file, 228 encore à envoyer, 120 envoyés', () => {
    expect(backupStatusOf(FIRST_BACKUP)).toEqual({ kind: 'first-backup', done: 120, total: 348 })
  })

  it('première sauvegarde : jamais moins de zéro envoyé, même avec des retraits de photos en file', () => {
    expect(backupStatusOf({ ...FIRST_BACKUP, remaining: 350 })).toEqual({
      kind: 'first-backup',
      done: 0,
      total: 348,
    })
  })

  it('première sauvegarde : un élément refusé ne compte ni dans les envoyés ni dans le total', () => {
    expect(backupStatusOf({ ...FIRST_BACKUP, remaining: 227, refused: 1 })).toEqual({
      kind: 'first-backup',
      done: 120,
      total: 347,
    })
  })

  it('en attente de réseau hors ligne, pendant la première sauvegarde aussi', () => {
    expect(backupStatusOf({ ...SAVED, online: false })).toEqual({
      kind: 'waiting-network',
      firstBackup: false,
    })
    expect(backupStatusOf({ ...FIRST_BACKUP, online: false })).toEqual({
      kind: 'waiting-network',
      firstBackup: true,
    })
  })

  it('interrompue depuis le dernier cycle réussi quand la session est refusée, même hors ligne', () => {
    expect(backupStatusOf({ ...SAVED, signInNeeded: true, online: false })).toEqual({
      kind: 'interrupted',
      since: YESTERDAY_6_20_PM,
    })
    expect(backupStatusOf({ ...FIRST_BACKUP, signInNeeded: true })).toEqual({
      kind: 'interrupted',
      since: null,
    })
  })
})

describe('showsPhotosBackedUp', () => {
  it('« Photos sauvegardées » une fois la première sauvegarde faite, réseau ou pas', () => {
    expect(showsPhotosBackedUp({ kind: 'saved', at: YESTERDAY_6_20_PM })).toBe(true)
    expect(showsPhotosBackedUp({ kind: 'waiting-network', firstBackup: false })).toBe(true)
  })

  it('pas hors ligne avant que la première sauvegarde ait abouti', () => {
    expect(showsPhotosBackedUp({ kind: 'waiting-network', firstBackup: true })).toBe(false)
  })

  it('pas pendant la première sauvegarde, ni quand elle est interrompue', () => {
    expect(showsPhotosBackedUp({ kind: 'first-backup', done: 120, total: 348 })).toBe(false)
    expect(showsPhotosBackedUp({ kind: 'interrupted', since: YESTERDAY_6_20_PM })).toBe(false)
  })
})

describe('refusedItemsOf', () => {
  it('sous « Dernière sauvegarde » et « Première sauvegarde » : le nombre d’éléments refusés', () => {
    expect(refusedItemsOf({ ...SAVED, refused: 2 })).toBe(2)
    expect(refusedItemsOf({ ...FIRST_BACKUP, refused: 1 })).toBe(1)
  })

  it('rien quand aucun élément n’est refusé', () => {
    expect(refusedItemsOf(SAVED)).toBe(0)
  })

  it('aussi sous « En attente de réseau » et « Reconnecte-toi »', () => {
    expect(refusedItemsOf({ ...SAVED, refused: 2, online: false })).toBe(2)
    expect(refusedItemsOf({ ...SAVED, refused: 2, signInNeeded: true })).toBe(2)
  })

  it('jamais sur ce téléphone, sans état de la sauvegarde cloud', () => {
    expect(refusedItemsOf(null)).toBe(0)
    expect(refusedItemsOf({ ...SAVED, refused: 2, eligible: false })).toBe(0)
    expect(refusedItemsOf({ ...SAVED, refused: 2, syncEnabled: false })).toBe(0)
  })
})

describe('photosBackedUpOf', () => {
  it('« Photos sauvegardées » une fois la première sauvegarde faite, réseau ou pas', () => {
    expect(photosBackedUpOf(SAVED)).toBe(true)
    expect(photosBackedUpOf({ ...SAVED, online: false })).toBe(true)
  })

  it('masqué dès qu’une photo est refusée, une ligne refusée seule ne le masque pas', () => {
    expect(photosBackedUpOf({ ...SAVED, refused: 1, refusedPhotos: 1 })).toBe(false)
    expect(photosBackedUpOf({ ...SAVED, refused: 1, refusedPhotos: 0 })).toBe(true)
  })

  it('jamais sur ce téléphone, ni pendant la première sauvegarde, ni interrompue', () => {
    expect(photosBackedUpOf(null)).toBe(false)
    expect(photosBackedUpOf({ ...SAVED, eligible: false })).toBe(false)
    expect(photosBackedUpOf(FIRST_BACKUP)).toBe(false)
    expect(photosBackedUpOf({ ...SAVED, signInNeeded: true })).toBe(false)
  })
})
