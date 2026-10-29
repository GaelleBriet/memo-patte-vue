// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { readableError } from '../readable-error'

describe('readableError', () => {
  it('rend les champs d’une erreur Postgrest, pas « [object Object] »', () => {
    const postgrest = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "plus_access_pkey"',
      details: 'Key (user_id)=(6f1c2a3b) already exists.',
      hint: null,
    }

    expect(readableError(postgrest)).toBe(
      'message: duplicate key value violates unique constraint "plus_access_pkey", code: 23505, details: Key (user_id)=(6f1c2a3b) already exists.',
    )
  })

  it('rend le statut d’une erreur Auth sous forme d’objet', () => {
    expect(readableError({ message: 'User not found', status: 404 })).toBe(
      'message: User not found, status: 404',
    )
  })

  it('ne garde que les champs connus : ni en-tête, ni clé, ni corps de requête', () => {
    const cause = {
      message: 'refusé',
      headers: { Authorization: 'Bearer sb_secret_abc' },
      apikey: 'sb_secret_abc',
      body: '{"event":{}}',
      details: { nested: 'sb_secret_abc' },
    }

    const readable = readableError(cause)

    expect(readable).toBe('message: refusé')
    expect(readable).not.toContain('sb_secret_abc')
  })

  it('rend le message d’une Error', () => {
    expect(readableError(new Error('base injoignable'))).toBe('base injoignable')
  })

  it('rend une chaîne telle quelle', () => {
    expect(readableError('délai dépassé')).toBe('délai dépassé')
  })

  it.each([
    [null, 'null'],
    [undefined, 'undefined'],
    [42, '42'],
  ])('rend %j par String', (cause, expected) => {
    expect(readableError(cause)).toBe(expected)
  })

  it('rend un objet sans champ connu par String, sans le détailler', () => {
    expect(readableError({ secret: 'sb_secret_abc' })).toBe('[object Object]')
  })
})
