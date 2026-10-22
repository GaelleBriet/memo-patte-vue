import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEmailCode } from '../composables/use-email-code'
import { AccountError } from '../logic/account-error'
import { useAuthStore } from '../store/auth.store'

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn<typeof useAuthStore>() }))

const ADRESSE = 'sophie@exemple.fr'
const ENVOI = new Date(2026, 9, 22, 18, 0).getTime()
const MINUTE = 60_000

const verifySignUpCode = vi.fn<(email: string, code: string) => Promise<void>>()
const resendSignUpCode = vi.fn<(email: string) => Promise<void>>()
let maintenant = ENVOI

function codeOuvert() {
  const etape = useEmailCode({ now: () => maintenant })
  etape.afterSignUp(ADRESSE)
  return etape
}

beforeEach(() => {
  setActivePinia(createPinia())
  verifySignUpCode.mockReset().mockResolvedValue()
  resendSignUpCode.mockReset().mockResolvedValue()
  maintenant = ENVOI
  vi.mocked(useAuthStore).mockReturnValue({ verifySignUpCode, resendSignUpCode } as never)
})

describe('useEmailCode', () => {
  it('s’ouvre sur l’adresse après l’inscription, sans code saisi', () => {
    const etape = codeOuvert()

    expect(etape.email.value).toBe(ADRESSE)
    expect(etape.origin.value).toBe('sign-up')
    expect(etape.code.value).toBe('')
    expect(etape.isComplete.value).toBe(false)
  })

  it('ne garde que six chiffres et n’est complet qu’avec les six', () => {
    const etape = codeOuvert()

    etape.setCode('12 3')
    expect(etape.code.value).toBe('123')
    expect(etape.isComplete.value).toBe(false)

    etape.setCode('1234567')
    expect(etape.code.value).toBe('123456')
    expect(etape.isComplete.value).toBe(true)
  })

  describe('confirm', () => {
    it('confirme l’adresse avec le code saisi, puis ferme l’étape du code', async () => {
      const etape = codeOuvert()
      etape.setCode('123456')

      expect(await etape.confirm()).toBe(true)
      expect(verifySignUpCode).toHaveBeenCalledWith(ADRESSE, '123456')
      expect(etape.email.value).toBeNull()
      expect(etape.code.value).toBe('')
    })

    it('n’envoie rien tant que le code est incomplet', async () => {
      const etape = codeOuvert()
      etape.setCode('12345')

      expect(await etape.confirm()).toBe(false)
      expect(verifySignUpCode).not.toHaveBeenCalled()
    })

    it('dit « pas le bon » quand le code est refusé dans l’heure', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const etape = codeOuvert()
      etape.setCode('123450')
      maintenant = ENVOI + 2 * MINUTE

      expect(await etape.confirm()).toBe(false)
      expect(etape.errorKey.value).toBe('auth.code.errors.incorrect')
      expect(etape.isExpired.value).toBe(false)
    })

    it('dit « a expiré » quand le code est refusé le lendemain', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const etape = codeOuvert()
      etape.setCode('123456')
      maintenant = new Date(2026, 9, 23, 9, 0).getTime()

      await etape.confirm()

      expect(etape.errorKey.value).toBe('auth.code.errors.expired')
      expect(etape.isExpired.value).toBe(true)
    })

    it('dit pourquoi quand le réseau manque', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('offline'))
      const etape = codeOuvert()
      etape.setCode('123456')

      await etape.confirm()

      expect(etape.errorKey.value).toBe('auth.errors.offline')
    })

    it('efface l’erreur dès qu’un chiffre change', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const etape = codeOuvert()
      etape.setCode('123450')
      await etape.confirm()

      etape.setCode('12345')

      expect(etape.errorKey.value).toBeNull()
    })

    it('n’envoie qu’une fois pendant la vérification', async () => {
      let repondre: () => void = () => {}
      verifySignUpCode.mockReturnValue(new Promise((resolve) => (repondre = resolve)))
      const etape = codeOuvert()
      etape.setCode('123456')

      const premier = etape.confirm()
      expect(etape.isConfirming.value).toBe(true)
      expect(await etape.confirm()).toBe(false)
      repondre()

      expect(await premier).toBe(true)
      expect(verifySignUpCode).toHaveBeenCalledOnce()
    })
  })

  describe('resend', () => {
    it('fait attendre une minute après l’envoi, sans rien renvoyer', async () => {
      const etape = codeOuvert()
      maintenant = ENVOI + 20_000

      expect(await etape.resend()).toBe('wait')
      expect(resendSignUpCode).not.toHaveBeenCalled()
      expect(etape.noticeKey.value).toBe('auth.code.wait')
    })

    it('renvoie un code après une minute, efface la saisie et les messages', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const etape = codeOuvert()
      etape.setCode('123450')
      await etape.confirm()
      maintenant = ENVOI + 20_000
      await etape.resend()
      maintenant = ENVOI + 61_000

      expect(await etape.resend()).toBe('sent')
      expect(resendSignUpCode).toHaveBeenCalledWith(ADRESSE)
      expect(etape.code.value).toBe('')
      expect(etape.errorKey.value).toBeNull()
      expect(etape.noticeKey.value).toBeNull()
    })

    it('compte la minute et l’heure à partir du nouvel envoi', async () => {
      verifySignUpCode.mockRejectedValue(new AccountError('invalid-code'))
      const etape = codeOuvert()
      maintenant = ENVOI + 59 * MINUTE
      await etape.resend()
      maintenant = ENVOI + 59 * MINUTE + 30_000

      expect(await etape.resend()).toBe('wait')

      maintenant = ENVOI + 70 * MINUTE
      etape.setCode('123456')
      await etape.confirm()
      expect(etape.errorKey.value).toBe('auth.code.errors.incorrect')
    })

    it('dit d’attendre une minute quand Supabase refuse un envoi trop rapproché', async () => {
      resendSignUpCode.mockRejectedValue(new AccountError('email-rate-limited'))
      const etape = codeOuvert()
      maintenant = ENVOI + 2 * MINUTE

      expect(await etape.resend()).toBe('wait')
      expect(etape.noticeKey.value).toBe('auth.code.wait')
      expect(etape.errorKey.value).toBeNull()
    })

    it('dit pourquoi quand l’envoi échoue', async () => {
      resendSignUpCode.mockRejectedValue(new AccountError('unknown'))
      const etape = codeOuvert()
      maintenant = ENVOI + 2 * MINUTE

      expect(await etape.resend()).toBe('failed')
      expect(etape.errorKey.value).toBe('auth.errors.unknown')
    })
  })

  describe('afterUnconfirmedSignIn', () => {
    it('renvoie un code puis s’ouvre, depuis la connexion', async () => {
      const etape = useEmailCode({ now: () => maintenant })

      expect(await etape.afterUnconfirmedSignIn(ADRESSE)).toEqual({ kind: 'opened' })
      expect(resendSignUpCode).toHaveBeenCalledWith(ADRESSE)
      expect(etape.email.value).toBe(ADRESSE)
      expect(etape.origin.value).toBe('sign-in')

      maintenant = ENVOI + 20_000
      expect(await etape.resend()).toBe('wait')
    })

    it('reste sur la connexion quand le réseau manque', async () => {
      resendSignUpCode.mockRejectedValue(new AccountError('offline'))
      const etape = useEmailCode({ now: () => maintenant })

      expect(await etape.afterUnconfirmedSignIn(ADRESSE)).toEqual({
        kind: 'failed',
        messageKey: 'auth.errors.offline',
      })
      expect(etape.email.value).toBeNull()
    })

    it('s’ouvre quand même si Supabase refuse un nouvel envoi : un code récent peut servir', async () => {
      resendSignUpCode.mockRejectedValue(new AccountError('unknown'))
      const etape = useEmailCode({ now: () => maintenant })

      expect(await etape.afterUnconfirmedSignIn(ADRESSE)).toEqual({ kind: 'opened' })
      expect(etape.errorKey.value).toBeNull()
      expect(await etape.resend()).toBe('failed')
    })
  })

  it('se ferme en rendant l’adresse et le formulaire d’où l’on vient', async () => {
    const etape = useEmailCode({ now: () => maintenant })
    await etape.afterUnconfirmedSignIn(ADRESSE)

    expect(etape.close()).toEqual({ email: ADRESSE, origin: 'sign-in' })
    expect(etape.email.value).toBeNull()
  })
})
