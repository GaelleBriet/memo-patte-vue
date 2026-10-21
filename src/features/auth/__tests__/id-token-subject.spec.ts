// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { idTokenSubject } from '../logic/id-token-subject'

function base64Url(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url')
}

function idToken(claims: object): string {
  return `${base64Url('{"alg":"RS256"}')}.${base64Url(JSON.stringify(claims))}.signature`
}

describe('idTokenSubject', () => {
  it('lit le compte Google désigné par le jeton', () => {
    expect(idTokenSubject(idToken({ sub: '108234567890', email: 'sophie@gmail.com' }))).toBe(
      '108234567890',
    )
  })

  it('lit un contenu encodé en base64url, accents compris', () => {
    expect(idTokenSubject(idToken({ sub: '42', name: 'Gaëlle ~?>' }))).toBe('42')
  })

  it.each([
    ['sans contenu', 'entete-seul'],
    ['au contenu illisible', 'a.%%%.c'],
    ['au contenu qui n’est pas du JSON', `a.${base64Url('pas du json')}.c`],
    ['sans compte désigné', idToken({ email: 'sophie@gmail.com' })],
  ])('ne désigne aucun compte pour un jeton %s', (_, token) => {
    expect(idTokenSubject(token)).toBeNull()
  })
})
