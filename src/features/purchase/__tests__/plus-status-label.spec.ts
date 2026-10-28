// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { plusMemberLabel, plusStatusLabel } from '../logic/plus-status-label'
import { NO_PLUS } from '../logic/plus-status'

describe('plusStatusLabel', () => {
  it('ne dit rien à qui n’a jamais eu Plus', () => {
    expect(plusStatusLabel(NO_PLUS, null)).toBeNull()
  })

  it.each([
    ['monthly', 'plus.settings.status.expiredMonthly'],
    ['annual', 'plus.settings.status.expiredAnnual'],
  ] as const)('dit l’abonnement %s expiré', (plan, key) => {
    expect(plusStatusLabel(NO_PLUS, plan)).toEqual({ key, expiresAt: null })
  })

  it('dit « à vie » sans date', () => {
    expect(plusStatusLabel({ plan: 'lifetime', expiresAt: null }, null)).toEqual({
      key: 'plus.settings.status.lifetime',
      expiresAt: null,
    })
  })

  it.each([
    ['monthly', 'plus.settings.status.monthly'],
    ['annual', 'plus.settings.status.annual'],
  ] as const)('donne l’échéance d’un abonnement %s', (plan, key) => {
    expect(plusStatusLabel({ plan, expiresAt: '2027-09-14T10:00:00Z' }, null)).toEqual({
      key,
      expiresAt: '2027-09-14T10:00:00Z',
    })
  })

  it.each([
    ['monthly', 'plus.member.monthly'],
    ['annual', 'plus.member.annual'],
  ] as const)('nomme un abonnement %s dont l’échéance est inconnue', (plan, key) => {
    expect(plusStatusLabel({ plan, expiresAt: null }, null)).toEqual({ key, expiresAt: null })
  })
})

const NOW = new Date(2026, 9, 29, 9)

describe('plusStatusLabel, droit offert', () => {
  it('donne la fin d’un mois offert', () => {
    const fin = new Date(2026, 10, 29, 9).toISOString()

    expect(
      plusStatusLabel({ plan: 'monthly', expiresAt: fin, offered: true }, null, { now: NOW }),
    ).toEqual({
      key: 'plus.settings.status.offered',
      expiresAt: fin,
    })
  })

  it('tait une fin à plus de 50 ans', () => {
    const fin = new Date(2226, 9, 29, 9).toISOString()

    expect(
      plusStatusLabel({ plan: 'annual', expiresAt: fin, offered: true }, null, { now: NOW }),
    ).toEqual({
      key: 'plus.settings.status.offeredNoEnd',
      expiresAt: null,
    })
  })

  it('donne encore la fin à 50 ans tout juste', () => {
    const fin = new Date(2076, 9, 29, 9).toISOString()

    expect(
      plusStatusLabel({ plan: 'annual', expiresAt: fin, offered: true }, null, { now: NOW })?.key,
    ).toBe('plus.settings.status.offered')
  })

  it('dit sans date de fin un droit offert que RevenueCat ne date pas', () => {
    expect(
      plusStatusLabel({ plan: 'lifetime', expiresAt: null, offered: true }, null, { now: NOW }),
    ).toEqual({ key: 'plus.settings.status.offeredNoEnd', expiresAt: null })
  })
})

describe('plusStatusLabel, droit offert terminé', () => {
  it('dit le droit offert terminé', () => {
    expect(plusStatusLabel(NO_PLUS, 'monthly', { expiredOffered: true, now: NOW })).toEqual({
      key: 'plus.settings.status.offeredEnded',
      expiresAt: null,
    })
  })
})

describe('plusMemberLabel', () => {
  it('nomme l’abonnement payé', () => {
    expect(plusMemberLabel({ plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' }, NOW)).toEqual({
      key: 'plus.member.annual',
      expiresAt: null,
    })
  })

  it('dit offert un droit offert, avec sa fin', () => {
    const fin = new Date(2026, 10, 29, 9).toISOString()

    expect(plusMemberLabel({ plan: 'monthly', expiresAt: fin, offered: true }, NOW)).toEqual({
      key: 'plus.settings.status.offered',
      expiresAt: fin,
    })
  })
})
