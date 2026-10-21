// @vitest-environment node
import type { GoogleSignInPlugin, SignInResult } from '@capawesome/capacitor-google-sign-in'
import { describe, expect, it, vi } from 'vitest'

import {
  createGoogleCredentials,
  GoogleCredentialError,
  type GoogleCredentialFailure,
} from '../google-credentials'

const CLIENT_ID = '123456789-web.apps.googleusercontent.com'
const HASHED_NONCE = 'a1'.repeat(32)

function signInResult(idToken = 'jeton-google'): SignInResult {
  return {
    idToken,
    userId: '1234',
    email: 'sophie@gmail.com',
    displayName: null,
    givenName: null,
    familyName: null,
    imageUrl: null,
    accessToken: null,
    serverAuthCode: null,
  }
}

function pluginError(code: string | undefined): Error {
  return Object.assign(new Error('échec du plugin'), { code })
}

function fakePlugin(signIn: GoogleSignInPlugin['signIn'] = async () => signInResult()) {
  return {
    initialize: vi.fn<GoogleSignInPlugin['initialize']>(async () => {}),
    signIn: vi.fn<GoogleSignInPlugin['signIn']>(signIn),
    signOut: vi.fn<GoogleSignInPlugin['signOut']>(async () => {}),
    handleRedirectCallback: vi.fn<GoogleSignInPlugin['handleRedirectCallback']>(),
  }
}

function credentials(
  plugin = fakePlugin(),
  options: { clientId?: string | undefined; native?: boolean } = {},
) {
  const { native = true } = options
  const clientId = 'clientId' in options ? options.clientId : CLIENT_ID
  const loadPlugin = vi.fn<() => Promise<GoogleSignInPlugin>>(async () => plugin)
  return {
    plugin,
    loadPlugin,
    google: createGoogleCredentials({ clientId, isNativePlatform: () => native, loadPlugin }),
  }
}

async function failure(request: Promise<unknown>): Promise<GoogleCredentialFailure> {
  const error = await request.then(
    () => null,
    (cause: unknown) => cause,
  )
  if (!(error instanceof GoogleCredentialError)) throw new Error(`attendu : GoogleCredentialError`)
  return error.reason
}

describe('createGoogleCredentials', () => {
  it('rend le jeton Google du compte choisi, demandé avec le nonce haché', async () => {
    const { google, plugin } = credentials()

    await expect(google.request(HASHED_NONCE)).resolves.toEqual({
      kind: 'granted',
      idToken: 'jeton-google',
    })
    expect(plugin.initialize).toHaveBeenCalledWith({ clientId: CLIENT_ID })
    expect(plugin.signIn).toHaveBeenCalledWith({ nonce: HASHED_NONCE })
  })

  it('n’initialise le plugin qu’une fois', async () => {
    const { google, plugin, loadPlugin } = credentials()

    await google.request(HASHED_NONCE)
    await google.request(HASHED_NONCE)

    expect(loadPlugin).toHaveBeenCalledTimes(1)
    expect(plugin.initialize).toHaveBeenCalledTimes(1)
  })

  it('réessaie l’initialisation après un échec', async () => {
    const plugin = fakePlugin()
    plugin.initialize.mockRejectedValueOnce(new Error('pas prêt'))
    const { google } = credentials(plugin)

    await expect(failure(google.request(HASHED_NONCE))).resolves.toBe('failed')
    await expect(google.request(HASHED_NONCE)).resolves.toEqual({
      kind: 'granted',
      idToken: 'jeton-google',
    })
    expect(plugin.initialize).toHaveBeenCalledTimes(2)
  })

  it('dit « annulé » quand la personne ferme le choix du compte', async () => {
    const { google } = credentials(
      fakePlugin(async () => {
        throw pluginError('SIGN_IN_CANCELED')
      }),
    )

    await expect(google.request(HASHED_NONCE)).resolves.toEqual({ kind: 'cancelled' })
  })

  it.each([
    ['NO_CREDENTIAL_AVAILABLE', 'no-google-account'],
    ['PROVIDER_CONFIGURATION_ERROR', 'unavailable'],
    [undefined, 'failed'],
  ] as const)('traduit l’erreur %s du plugin en %s', async (code, reason) => {
    const { google } = credentials(
      fakePlugin(async () => {
        throw pluginError(code)
      }),
    )

    await expect(failure(google.request(HASHED_NONCE))).resolves.toBe(reason)
  })

  it('garde l’erreur du plugin comme cause', async () => {
    const cause = pluginError(undefined)
    const { google } = credentials(
      fakePlugin(async () => {
        throw cause
      }),
    )

    const error = await google.request(HASHED_NONCE).catch((thrown: unknown) => thrown)

    expect((error as GoogleCredentialError).cause).toBe(cause)
  })

  it.each([
    ['hors du téléphone', { native: false }],
    ['sans identifiant client Web', { clientId: undefined }],
    ['avec un identifiant client Web vide', { clientId: '' }],
  ])('est indisponible %s, sans charger le plugin', async (_case, options) => {
    const { google, loadPlugin } = credentials(fakePlugin(), options)

    await expect(failure(google.request(HASHED_NONCE))).resolves.toBe('unavailable')
    expect(loadPlugin).not.toHaveBeenCalled()
  })
})
