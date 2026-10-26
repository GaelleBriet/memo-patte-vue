import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { createApp, defineComponent } from 'vue'

import i18n from '@/core/i18n'
import { dismissToast, toastMessage, toastTone } from '@/shared/utils/toast'
import { GoogleCredentialError } from '@/core/google-sign-in/google-credentials'

import { AccountError } from '../logic/account-error'
import { useGoogleSignIn } from '../composables/use-google-sign-in'
import { useAuthStore } from '../store/auth.store'

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn<typeof useAuthStore>() }))

const signInWithGoogle = vi.fn<() => Promise<'signed-in' | 'cancelled'>>()

function inSetup(): ReturnType<typeof useGoogleSignIn> {
  let result: ReturnType<typeof useGoogleSignIn> | undefined
  const app = createApp(
    defineComponent({
      setup() {
        result = useGoogleSignIn()
        return () => null
      },
    }),
  )
  app.use(i18n)
  app.mount(document.createElement('div'))
  return result!
}

beforeEach(() => {
  dismissToast()
  setActivePinia(createPinia())
  signInWithGoogle.mockReset()
  vi.mocked(useAuthStore).mockReturnValue({ signInWithGoogle } as never)
})

describe('useGoogleSignIn', () => {
  it('rend la connexion réussie', async () => {
    signInWithGoogle.mockResolvedValue('signed-in')

    expect(await inSetup().continueWithGoogle()).toEqual({ kind: 'signed-in' })
  })

  it('ne dit rien quand le sélecteur est fermé sans choisir', async () => {
    signInWithGoogle.mockResolvedValue('cancelled')

    expect(await inSetup().continueWithGoogle()).toEqual({ kind: 'cancelled' })
  })

  it.each([
    [new GoogleCredentialError('no-google-account'), 'auth.errors.noGoogleAccount'],
    [new GoogleCredentialError('unavailable'), 'auth.errors.googleUnavailable'],
    [new GoogleCredentialError('failed'), 'auth.errors.unknown'],
    [new AccountError('offline'), 'auth.errors.offline'],
    [new AccountError('unknown'), 'auth.errors.unknown'],
  ])('rend le message de l’échec %#', async (cause, messageKey) => {
    signInWithGoogle.mockRejectedValue(cause)

    expect(await inSetup().continueWithGoogle()).toEqual({ kind: 'failed', messageKey })
  })

  describe('announce', () => {
    it('confirme la connexion par un toast de réussite', () => {
      inSetup().announce({ kind: 'signed-in' })

      expect(toastMessage.value).toBe('Connecté avec Google.')
      expect(toastTone.value).toBe('success')
    })

    it('dit l’annulation par un toast d’information', () => {
      inSetup().announce({ kind: 'cancelled' })

      expect(toastMessage.value).toBe('Connexion annulée.')
      expect(toastTone.value).toBe('info')
    })

    it('ne touche pas au message d’un échec', () => {
      inSetup().announce({ kind: 'failed', messageKey: 'auth.errors.unknown' })

      expect(toastMessage.value).toBeNull()
    })
  })
})
