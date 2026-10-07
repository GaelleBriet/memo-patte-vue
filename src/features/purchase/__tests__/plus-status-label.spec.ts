// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { plusStatusLabel } from '../logic/plus-status-label'
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
