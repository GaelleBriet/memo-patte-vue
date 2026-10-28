// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { NO_PLUS } from '../logic/plus-status'
import { backupKeptUntil, pausedBackupOf } from '../logic/plus-pause'
import {
  clearPlusEndedAt,
  PLUS_ENDED_AT_STORAGE_KEY,
  readPlusEndedAt,
  writePlusEndedAt,
} from '../logic/plus-pause-storage'
import { memoryStorage } from './billing-fixture'

function local(year: number, month: number, day: number, hours = 10): string {
  return new Date(year, month - 1, day, hours).toISOString()
}

const ENDED_AT = local(2026, 9, 14)
const AT = (iso: string) => Date.parse(iso)

describe('backupKeptUntil', () => {
  it('ajoute 12 mois au jour local de la fin de Plus', () => {
    expect(backupKeptUntil(ENDED_AT)).toBe('2027-09-14')
  })

  it('ramène le 29 février au dernier jour de février', () => {
    expect(backupKeptUntil(local(2028, 2, 29))).toBe('2029-02-28')
  })
})

describe('pausedBackupOf', () => {
  const base = {
    status: NO_PLUS,
    expiredPlan: null,
    endedAt: ENDED_AT,
    now: AT(local(2026, 10, 28)),
  }

  it('annonce la date de conservation d’un Plus arrêté', () => {
    expect(pausedBackupOf(base)).toEqual({ keptUntil: '2027-09-14' })
  })

  it('reste en pause le jour même de la date de conservation', () => {
    expect(pausedBackupOf({ ...base, now: AT(local(2027, 9, 14, 8)) })).toEqual({
      keptUntil: '2027-09-14',
    })
  })

  it('redevient un gratuit le lendemain de la date de conservation', () => {
    expect(pausedBackupOf({ ...base, now: AT(local(2027, 9, 15)) })).toBeNull()
  })

  it('n’est jamais en pause tant que Plus est actif', () => {
    const active = { plan: 'annual', expiresAt: local(2027, 1, 1) } as const
    expect(pausedBackupOf({ ...base, status: active })).toBeNull()
  })

  it('n’est pas en pause pour qui n’a jamais payé', () => {
    expect(pausedBackupOf({ ...base, endedAt: null })).toBeNull()
  })

  it('reste en pause sans date quand un plan échu est connu mais pas sa fin', () => {
    expect(pausedBackupOf({ ...base, endedAt: null, expiredPlan: 'monthly' })).toEqual({
      keptUntil: null,
    })
  })
})

describe('fin de Plus enregistrée', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('relit la date écrite', () => {
    writePlusEndedAt(ENDED_AT)

    expect(readPlusEndedAt()).toBe(ENDED_AT)
  })

  it('ne renvoie rien quand la valeur est absente, illisible ou effacée', () => {
    expect(readPlusEndedAt()).toBeNull()

    localStorage.setItem(PLUS_ENDED_AT_STORAGE_KEY, 'hier')
    expect(readPlusEndedAt()).toBeNull()

    writePlusEndedAt(ENDED_AT)
    clearPlusEndedAt()
    expect(readPlusEndedAt()).toBeNull()
  })
})
