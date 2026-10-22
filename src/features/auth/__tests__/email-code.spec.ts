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
  it('ne garde que huit chiffres, collés ou tapés', () => {
    expect(codeDigits('1234 56-78')).toBe('12345678')
    expect(codeDigits('123456789')).toBe('12345678')
    expect(codeDigits('a1b2')).toBe('12')
  })
})

describe('isCompleteCode', () => {
  it('attend exactement huit chiffres', () => {
    expect(isCompleteCode('12345678')).toBe(true)
    expect(isCompleteCode('123456')).toBe(false)
    expect(isCompleteCode('1234567')).toBe(false)
    expect(isCompleteCode('1234567a')).toBe(false)
    expect(isCompleteCode('')).toBe(false)
  })
})

describe('refusedCodeKey', () => {
  it('dit « pas le bon » dans les 15 minutes qui suivent l’envoi', () => {
    expect(refusedCodeKey(ENVOI, ENVOI + 2 * MINUTE)).toBe('auth.code.errors.incorrect')
    expect(refusedCodeKey(ENVOI, ENVOI + CODE_LIFETIME_MS - 1)).toBe('auth.code.errors.incorrect')
  })

  it('dit « a expiré » 15 minutes après l’envoi', () => {
    expect(refusedCodeKey(ENVOI, ENVOI + 14 * MINUTE + 59_000)).toBe('auth.code.errors.incorrect')
    expect(refusedCodeKey(ENVOI, ENVOI + CODE_LIFETIME_MS)).toBe('auth.code.errors.expired')
    expect(refusedCodeKey(ENVOI, ENVOI + 15 * MINUTE + 1_000)).toBe('auth.code.errors.expired')
    expect(refusedCodeKey(ENVOI, ENVOI + 15 * 60 * MINUTE)).toBe('auth.code.errors.expired')
  })

  it('dit « pas le bon » quand l’heure de l’envoi n’est pas connue', () => {
    expect(refusedCodeKey(null, ENVOI)).toBe('auth.code.errors.incorrect')
  })

  it('vaut 15 minutes, la durée réglée dans Supabase', () => {
    expect(CODE_LIFETIME_MS).toBe(15 * MINUTE)
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
