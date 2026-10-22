import { describe, expect, it } from 'vitest'

import {
  CODE_LIFETIME_MS,
  RESEND_DELAY_MS,
  codeDigits,
  isCompleteCode,
  mustWaitBeforeResend,
  refusedCodeKey,
} from '../logic/email-code'

const ENVOI = new Date(2026, 9, 22, 18, 0).getTime()
const MINUTE = 60_000

describe('codeDigits', () => {
  it('ne garde que six chiffres, collés ou tapés', () => {
    expect(codeDigits('12 34-56')).toBe('123456')
    expect(codeDigits('1234567')).toBe('123456')
    expect(codeDigits('a1b2')).toBe('12')
  })
})

describe('isCompleteCode', () => {
  it('attend exactement six chiffres', () => {
    expect(isCompleteCode('123456')).toBe(true)
    expect(isCompleteCode('12345')).toBe(false)
    expect(isCompleteCode('12345a')).toBe(false)
    expect(isCompleteCode('')).toBe(false)
  })
})

describe('refusedCodeKey', () => {
  it('dit « pas le bon » dans l’heure qui suit l’envoi', () => {
    expect(refusedCodeKey(ENVOI, ENVOI + 2 * MINUTE)).toBe('auth.code.errors.incorrect')
    expect(refusedCodeKey(ENVOI, ENVOI + CODE_LIFETIME_MS - 1)).toBe('auth.code.errors.incorrect')
  })

  it('dit « a expiré » une heure après l’envoi', () => {
    expect(refusedCodeKey(ENVOI, ENVOI + CODE_LIFETIME_MS)).toBe('auth.code.errors.expired')
    expect(refusedCodeKey(ENVOI, ENVOI + 15 * 60 * MINUTE)).toBe('auth.code.errors.expired')
  })

  it('dit « pas le bon » quand l’heure de l’envoi n’est pas connue', () => {
    expect(refusedCodeKey(null, ENVOI)).toBe('auth.code.errors.incorrect')
  })

  it('vaut une heure, la durée réglée dans Supabase', () => {
    expect(CODE_LIFETIME_MS).toBe(60 * MINUTE)
  })
})

describe('mustWaitBeforeResend', () => {
  it('fait attendre une minute après un envoi', () => {
    expect(mustWaitBeforeResend(ENVOI, ENVOI + 20_000)).toBe(true)
    expect(mustWaitBeforeResend(ENVOI, ENVOI + RESEND_DELAY_MS - 1)).toBe(true)
    expect(mustWaitBeforeResend(ENVOI, ENVOI + RESEND_DELAY_MS)).toBe(false)
  })

  it('laisse renvoyer quand l’heure de l’envoi n’est pas connue', () => {
    expect(mustWaitBeforeResend(null, ENVOI)).toBe(false)
  })
})
