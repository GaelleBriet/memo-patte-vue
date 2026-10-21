// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import {
  GoogleCredentialError,
  type GoogleCredential,
  type GoogleCredentials,
} from '@/core/google-sign-in/google-credentials'

import { AccountError } from '../logic/account-error'
import type { AuthRepository } from '../repository/auth.repository'
import { signInWithGoogle } from '../service/google-sign-in.service'
import { USER_ID } from './auth-fixture'

const NONCE = { raw: 'nonce-en-clair', hashed: 'empreinte-du-nonce' }

function setup(credential: () => Promise<GoogleCredential>) {
  const credentials = { request: vi.fn<GoogleCredentials['request']>(credential) }
  const repository = {
    signInWithGoogleIdToken: vi.fn<AuthRepository['signInWithGoogleIdToken']>(async () => ({
      userId: USER_ID,
    })),
  }
  const run = () => signInWithGoogle(repository, { credentials, createNonce: async () => NONCE })
  return { credentials, repository, run }
}

describe('signInWithGoogle', () => {
  it('demande le compte Google avec l’empreinte du nonce, puis ouvre la session avec le nonce en clair', async () => {
    const { credentials, repository, run } = setup(async () => ({
      kind: 'granted',
      idToken: 'jeton-google',
    }))

    await expect(run()).resolves.toEqual({ kind: 'signed-in', session: { userId: USER_ID } })
    expect(credentials.request).toHaveBeenCalledWith(NONCE.hashed)
    expect(repository.signInWithGoogleIdToken).toHaveBeenCalledWith('jeton-google', NONCE.raw)
  })

  it('ne contacte pas Supabase quand la personne ferme le choix du compte', async () => {
    const { repository, run } = setup(async () => ({ kind: 'cancelled' }))

    await expect(run()).resolves.toEqual({ kind: 'cancelled' })
    expect(repository.signInWithGoogleIdToken).not.toHaveBeenCalled()
  })

  it('laisse passer l’échec du téléphone sans contacter Supabase', async () => {
    const failure = new GoogleCredentialError('no-google-account')
    const { repository, run } = setup(async () => {
      throw failure
    })

    await expect(run()).rejects.toBe(failure)
    expect(repository.signInWithGoogleIdToken).not.toHaveBeenCalled()
  })

  it('laisse passer l’échec de Supabase', async () => {
    const failure = new AccountError('offline')
    const { repository, run } = setup(async () => ({ kind: 'granted', idToken: 'jeton-google' }))
    repository.signInWithGoogleIdToken.mockRejectedValueOnce(failure)

    await expect(run()).rejects.toBe(failure)
  })
})
