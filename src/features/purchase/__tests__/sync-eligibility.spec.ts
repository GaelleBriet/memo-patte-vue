// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { NO_PLUS, type PlusStatus } from '../logic/plus-status'
import { isSyncEligible } from '../logic/sync-eligibility'

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-10-29T09:00:00.000Z' }
const LIFETIME: PlusStatus = { plan: 'lifetime', expiresAt: null }

describe('isSyncEligible', () => {
  it('ouvre la synchro à un compte Plus sur l’appareil quand Plus est actif', () => {
    expect(isSyncEligible(true, ANNUAL)).toBe(true)
    expect(isSyncEligible(true, LIFETIME)).toBe(true)
  })

  it('la ferme à un compte sans Plus actif, et à Plus actif sans compte', () => {
    expect(isSyncEligible(true, NO_PLUS)).toBe(false)
    expect(isSyncEligible(false, ANNUAL)).toBe(false)
    expect(isSyncEligible(false, NO_PLUS)).toBe(false)
  })
})
