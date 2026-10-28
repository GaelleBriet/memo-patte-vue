// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { isSharedSecret, longEnoughSecret, MIN_SHARED_SECRET_LENGTH } from '../shared-secret'

afterEach(() => {
  vi.restoreAllMocks()
})

describe('isSharedSecret', () => {
  it('reconnaît le secret configuré', async () => {
    expect(await isSharedSecret('le-bon-secret', 'le-bon-secret')).toBe(true)
  })

  it.each([
    ['différent de même longueur', 'le-bon-secreT'],
    ['plus court', 'le-bon'],
    ['plus long', 'le-bon-secret-et-plus'],
    ['vide', ''],
  ])('refuse un secret %s', async (_, given) => {
    expect(await isSharedSecret(given, 'le-bon-secret')).toBe(false)
  })

  it.each([undefined, ''])(
    'refuse tout quand aucun secret n’est configuré (%j)',
    async (expected) => {
      expect(await isSharedSecret('', expected)).toBe(false)
    },
  )
})

describe('longEnoughSecret', () => {
  const SECRET_32 = 's'.repeat(MIN_SHARED_SECRET_LENGTH)
  const SECRET_31 = 't'.repeat(MIN_SHARED_SECRET_LENGTH - 1)

  it('exige au moins 32 caractères', () => {
    expect(MIN_SHARED_SECRET_LENGTH).toBe(32)
  })

  it('garde un secret assez long tel quel, sans rien journaliser', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(longEnoughSecret(SECRET_32, 'UN_SECRET', 'Service désactivé')).toBe(SECRET_32)
    expect(error).not.toHaveBeenCalled()
  })

  it('écarte un secret trop court, et le dit en nommant la variable sans recopier la valeur', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(longEnoughSecret(SECRET_31, 'UN_SECRET', 'Service désactivé')).toBeUndefined()

    expect(error).toHaveBeenCalledExactlyOnceWith(
      'Service désactivé : UN_SECRET doit faire au moins 32 caractères',
    )
    expect(JSON.stringify(error.mock.calls)).not.toContain(SECRET_31)
  })

  it.each([undefined, ''])('rend « absent » sans rien journaliser (%j)', (value) => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(longEnoughSecret(value, 'UN_SECRET', 'Service désactivé')).toBeUndefined()
    expect(error).not.toHaveBeenCalled()
  })
})
