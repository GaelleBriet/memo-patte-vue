// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { errorSummary } from '../error-summary'

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
