// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import { errorSummary, localErrorMessage } from '../utils/error-summary'

describe('errorSummary', () => {
  it('garde le nom, le code et le statut', () => {
    const error = Object.assign(new Error('échec'), {
      name: 'AuthApiError',
      code: 'user_not_found',
      status: 400,
    })

    expect(errorSummary(error)).toBe('AuthApiError user_not_found 400')
  })

  it('laisse le corps de la réponse Supabase hors de la trace', () => {
    const error = Object.assign(new Error('Email sophie.martin@example.com not confirmed'), {
      name: 'AuthApiError',
      code: 'email_not_confirmed',
      status: 400,
      body: { msg: 'sophie.martin@example.com' },
    })

    expect(errorSummary(error)).not.toContain('sophie.martin@example.com')
  })

  it('garde la raison de nos propres erreurs de compte', () => {
    const error = Object.assign(new Error('Échec du compte'), {
      name: 'AccountError',
      reason: 'offline',
    })

    expect(errorSummary(error)).toBe('AccountError offline')
  })

  it('ne descend pas dans la cause, où le corps de la réponse se cache aussi', () => {
    const error = Object.assign(new Error('Échec du compte'), {
      name: 'AccountError',
      reason: 'unknown',
      cause: Object.assign(new Error('Email sophie.martin@example.com not confirmed'), {
        name: 'AuthApiError',
        body: { msg: 'sophie.martin@example.com' },
      }),
    })

    expect(errorSummary(error)).toBe('AccountError unknown')
  })

  it('ignore un champ vide plutôt que de rendre une trace vide', () => {
    expect(errorSummary({ name: '', code: '', status: 0 })).toBe('0')
    expect(errorSummary({ name: '' })).toBe('erreur sans nom')
  })

  it('nomme le type de ce qui n’est pas un objet', () => {
    expect(errorSummary('sophie.martin@example.com')).toBe('string')
    expect(errorSummary(undefined)).toBe('undefined')
  })

  it('reste lisible quand l’erreur n’a aucun de ces champs', () => {
    expect(errorSummary({})).toBe('erreur sans nom')
  })
})

describe('localErrorMessage', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rend le message d’une erreur locale sans code, en développement', () => {
    vi.stubEnv('DEV', true)

    expect(localErrorMessage(new Error('sync_state introuvable'))).toBe('sync_state introuvable')
  })

  it('ne rend rien en production', () => {
    vi.stubEnv('DEV', false)

    expect(localErrorMessage(new Error('sync_state introuvable'))).toBe('')
  })

  it('ne rend jamais le message d’une erreur qui porte un code ou un statut', () => {
    vi.stubEnv('DEV', true)
    const error = Object.assign(new Error('Email sophie.martin@example.com not confirmed'), {
      code: 'email_not_confirmed',
      status: 400,
    })

    expect(localErrorMessage(error)).toBe('')
  })

  it('ne rend rien pour une erreur nommée ou qui n’est pas une erreur', () => {
    vi.stubEnv('DEV', true)

    expect(localErrorMessage(Object.assign(new Error('x'), { name: 'AuthApiError' }))).toBe('')
    expect(localErrorMessage('sophie.martin@example.com')).toBe('')
  })

  it('coupe un message trop long', () => {
    vi.stubEnv('DEV', true)

    expect(localErrorMessage(new Error('a'.repeat(500)))).toHaveLength(200)
  })
})
