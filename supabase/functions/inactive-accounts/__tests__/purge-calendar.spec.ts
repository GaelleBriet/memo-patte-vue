// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import {
  inactiveSinceOf,
  purgeDateOf,
  purgeStepsOf,
  REVENUECAT_ERASURE_DAYS,
  UNCONFIRMED_ACCOUNT_DAYS,
  WARNING_MONTHS,
  type AccountDates,
} from '../purge-calendar'

const NO_NOTICE = { purgeOn: null, warnedAt: null, revenuecatErasedAt: null }

function account(overrides: Partial<AccountDates> = {}): AccountDates {
  return {
    createdAt: '2025-01-01T08:00:00.000Z',
    emailConfirmed: true,
    plus: null,
    notice: NO_NOTICE,
    ...overrides,
  }
}

const at = (iso: string) => Date.parse(iso)
const MS = 1

describe('purgeStepsOf : compte jamais acheté', () => {
  const neverBought = account({ createdAt: '2026-01-10T08:00:00.000Z' })

  it('rien avant 11 mois après la création', () => {
    expect(purgeStepsOf(neverBought, at('2026-12-10T08:00:00.000Z') - MS)).toEqual({
      account: null,
      eraseRevenuecat: false,
    })
  })

  it('averti 11 mois après la création, sans effacement RevenueCat', () => {
    expect(purgeStepsOf(neverBought, at('2026-12-10T08:00:00.000Z'))).toEqual({
      account: 'warn',
      eraseRevenuecat: false,
    })
  })

  it('jamais supprimé sans avertissement, même des années plus tard', () => {
    expect(purgeStepsOf(neverBought, at('2031-01-01T00:00:00.000Z')).account).toBe('warn')
  })
})

describe('purgeStepsOf : Plus fini le 15 novembre 2026 à 14 h', () => {
  const ended = account({ plus: { expiresAt: '2026-11-15T14:00:00.000Z' } })

  it('client RevenueCat effacé 60 jours après la fin, pas avant', () => {
    expect(purgeStepsOf(ended, at('2027-01-14T14:00:00.000Z') - MS).eraseRevenuecat).toBe(false)
    expect(purgeStepsOf(ended, at('2027-01-14T14:00:00.000Z'))).toEqual({
      account: null,
      eraseRevenuecat: true,
    })
  })

  it('averti 11 mois après la fin', () => {
    expect(purgeStepsOf(ended, at('2027-10-15T14:00:00.000Z') - MS).account).toBe(null)
    expect(purgeStepsOf(ended, at('2027-10-15T14:00:00.000Z')).account).toBe('warn')
  })

  it('un client RevenueCat déjà effacé ne l’est pas de nouveau', () => {
    const erased = {
      ...ended,
      notice: { ...NO_NOTICE, revenuecatErasedAt: '2027-01-15T03:00:00Z' },
    }
    expect(purgeStepsOf(erased, at('2027-10-15T14:00:00.000Z'))).toEqual({
      account: 'warn',
      eraseRevenuecat: false,
    })
  })

  it('averti : supprimé le jour J retenu, pas avant', () => {
    const warned = {
      ...ended,
      notice: {
        purgeOn: '2027-11-16',
        warnedAt: '2027-10-16T03:00:00.000Z',
        revenuecatErasedAt: null,
      },
    }
    expect(purgeStepsOf(warned, at('2027-11-16T00:00:00.000Z') - MS)).toEqual({
      account: null,
      eraseRevenuecat: true,
    })
    expect(purgeStepsOf(warned, at('2027-11-16T00:00:00.000Z'))).toEqual({
      account: 'delete',
      eraseRevenuecat: false,
    })
  })
})

describe('purgeStepsOf : jamais inactif', () => {
  it('abonnement en cours, période de grâce comprise', () => {
    const running = account({ plus: { expiresAt: '2027-12-01T00:00:00.000Z' } })
    expect(purgeStepsOf(running, at('2027-11-30T23:59:59.999Z'))).toEqual({
      account: null,
      eraseRevenuecat: false,
    })
    expect(inactiveSinceOf(running, at('2027-11-30T23:59:59.999Z'))).toBe(null)
  })

  it('achat à vie', () => {
    const lifetime = account({ plus: { expiresAt: null }, emailConfirmed: false })
    expect(purgeStepsOf(lifetime, at('2040-01-01T00:00:00.000Z'))).toEqual({
      account: null,
      eraseRevenuecat: false,
    })
  })

  it('un avis d’avant la reprise de Plus ne supprime pas un abonné', () => {
    const resumed = account({
      plus: { expiresAt: '2028-01-15T10:00:00.000Z' },
      notice: { purgeOn: '2027-01-16', warnedAt: '2026-12-01T03:00:00Z', revenuecatErasedAt: null },
    })
    expect(purgeStepsOf(resumed, at('2027-06-01T00:00:00.000Z')).account).toBe(null)
  })
})

describe('purgeStepsOf : adresse jamais confirmée', () => {
  const unconfirmed = account({ createdAt: '2026-11-02T10:00:00.000Z', emailConfirmed: false })

  it('supprimée au bout de 7 jours, sans avertissement', () => {
    expect(UNCONFIRMED_ACCOUNT_DAYS).toBe(7)
    expect(purgeStepsOf(unconfirmed, at('2026-11-09T10:00:00.000Z') - MS).account).toBe(null)
    expect(purgeStepsOf(unconfirmed, at('2026-11-09T10:00:00.000Z')).account).toBe(
      'delete-unconfirmed',
    )
  })

  it('jamais avertie', () => {
    expect(purgeStepsOf(unconfirmed, at('2027-10-09T10:00:00.000Z')).account).toBe(
      'delete-unconfirmed',
    )
  })
})

describe('purgeStepsOf : mois courts', () => {
  it('fin le 31 mars 2026 : averti le 28 février 2027', () => {
    const ended = account({ plus: { expiresAt: '2026-03-31T10:00:00.000Z' } })
    expect(purgeStepsOf(ended, at('2027-02-28T10:00:00.000Z') - MS).account).toBe(null)
    expect(purgeStepsOf(ended, at('2027-02-28T10:00:00.000Z')).account).toBe('warn')
  })

  it('fin le 29 février 2028 : averti le 29 janvier 2029', () => {
    const ended = account({ plus: { expiresAt: '2028-02-29T10:00:00.000Z' } })
    expect(purgeStepsOf(ended, at('2029-01-29T10:00:00.000Z') - MS).account).toBe(null)
    expect(purgeStepsOf(ended, at('2029-01-29T10:00:00.000Z')).account).toBe('warn')
  })

  it('fin le 31 janvier 2027 : RevenueCat le 1er avril, averti le 31 décembre', () => {
    const ended = account({ plus: { expiresAt: '2027-01-31T10:00:00.000Z' } })
    expect(purgeStepsOf(ended, at('2027-04-01T10:00:00.000Z') - MS).eraseRevenuecat).toBe(false)
    expect(purgeStepsOf(ended, at('2027-04-01T10:00:00.000Z')).eraseRevenuecat).toBe(true)
    expect(purgeStepsOf(ended, at('2027-12-31T10:00:00.000Z') - MS).account).toBe(null)
    expect(purgeStepsOf(ended, at('2027-12-31T10:00:00.000Z')).account).toBe('warn')
  })
})

describe('purgeDateOf', () => {
  it('Sophie, fin le 15 novembre 2026 à 14 h, avertie à temps : J le 16 novembre 2027', () => {
    expect(purgeDateOf('2026-11-15T14:00:00.000Z', at('2027-10-15T14:00:00.000Z'))).toBe(
      '2027-11-16',
    )
  })

  it('fin à minuit pile : J le jour même des 12 mois', () => {
    expect(purgeDateOf('2026-11-15T00:00:00.000Z', at('2027-10-15T03:00:00.000Z'))).toBe(
      '2027-11-15',
    )
  })

  it('avertissement en retard : le préavis de 30 jours n’est jamais raccourci', () => {
    expect(purgeDateOf('2026-11-15T14:00:00.000Z', at('2027-11-20T03:00:00.000Z'))).toBe(
      '2027-12-21',
    )
    expect(purgeDateOf('2026-11-15T14:00:00.000Z', at('2027-10-20T14:00:00.000Z'))).toBe(
      '2027-11-20',
    )
  })

  it('fin le 31 mars 2026, avertie le 28 février 2027 : J le 1er avril 2027', () => {
    expect(purgeDateOf('2026-03-31T10:00:00.000Z', at('2027-02-28T10:00:00.000Z'))).toBe(
      '2027-04-01',
    )
  })

  it('fin le 29 février 2028, avertie le 29 janvier 2029 : J le 1er mars 2029', () => {
    expect(purgeDateOf('2028-02-29T10:00:00.000Z', at('2029-01-29T10:00:00.000Z'))).toBe(
      '2029-03-01',
    )
  })

  it('fin le 31 janvier 2027, avertie le 31 décembre 2027 : J le 1er février 2028', () => {
    expect(purgeDateOf('2027-01-31T10:00:00.000Z', at('2027-12-31T10:00:00.000Z'))).toBe(
      '2028-02-01',
    )
  })
})

describe('liste SQL des comptes inactifs', () => {
  it('compte les mêmes durées que ce calendrier', () => {
    const sql = readFileSync(
      new URL('../../../migrations/20261024090000_account_purge_notice.sql', import.meta.url),
      'utf8',
    )

    expect(sql).toContain(`interval '${UNCONFIRMED_ACCOUNT_DAYS} days'`)
    expect(sql).toContain(`interval '${REVENUECAT_ERASURE_DAYS} days'`)
    expect(sql).toContain(`interval '${WARNING_MONTHS} months'`)
  })
})
