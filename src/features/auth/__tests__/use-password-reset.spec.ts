import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { effectScope } from 'vue'

import { usePasswordReset } from '../composables/use-password-reset'
import { AccountError } from '../logic/account-error'
import { useAuthStore } from '../store/auth.store'

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn<typeof useAuthStore>() }))

const ADRESSE = 'sophie@exemple.fr'
const ENVOI = new Date(2026, 9, 22, 18, 0).getTime()
const MINUTE = 60_000

const sendPasswordResetCode = vi.fn<(email: string) => Promise<void>>()
const verifyPasswordResetCode = vi.fn<(email: string, code: string) => Promise<void>>()
const changePassword = vi.fn<(password: string) => Promise<void>>()
const abandonPasswordReset = vi.fn<() => Promise<void>>()
const resendSignUpCode = vi.fn<(email: string) => Promise<void>>()
const verifySignUpCode = vi.fn<(email: string, code: string) => Promise<void>>()
let maintenant = ENVOI

function parcours(adresse = '') {
  return usePasswordReset({ email: adresse, now: () => maintenant })
}

async function codeEnvoye() {
  const reset = parcours(ADRESSE)
  await reset.sendCode()
  return reset
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const mock of [
    abandonPasswordReset,
    sendPasswordResetCode,
    verifyPasswordResetCode,
    changePassword,
    resendSignUpCode,
    verifySignUpCode,
  ]) {
    mock.mockReset().mockResolvedValue()
  }
  maintenant = ENVOI
  vi.mocked(useAuthStore).mockReturnValue({
    sendPasswordResetCode,
    verifyPasswordResetCode,
    changePassword,
    abandonPasswordReset,
    resendSignUpCode,
    verifySignUpCode,
  } as never)
})

describe('usePasswordReset', () => {
  describe('adresse (V24 septies)', () => {
    it('s’ouvre sur l’adresse donnée, sans rien envoyer', () => {
      const reset = parcours(ADRESSE)

      expect(reset.step.value).toBe('address')
      expect(reset.address.value.email).toBe(ADRESSE)
      expect(sendPasswordResetCode).not.toHaveBeenCalled()
    })

    it('envoie le code à l’adresse nettoyée puis passe au code', async () => {
      const reset = parcours(`  ${ADRESSE} `)

      expect(await reset.sendCode()).toBe(true)
      expect(sendPasswordResetCode).toHaveBeenCalledWith(ADRESSE)
      expect(reset.step.value).toBe('code')
      expect(reset.emailCode.email.value).toBe(ADRESSE)
    })

    it('n’envoie rien pour une adresse mal formée', async () => {
      const reset = parcours('sophie')

      expect(await reset.sendCode()).toBe(false)
      expect(reset.addressErrors.value.email).toBe('auth.form.errors.emailInvalid')
      expect(sendPasswordResetCode).not.toHaveBeenCalled()
    })

    it('fait attendre une minute avant de renvoyer à la même adresse', async () => {
      const reset = await codeEnvoye()
      reset.backToAddress()
      maintenant = ENVOI + 20_000

      expect(await reset.sendCode()).toBe(false)
      expect(reset.addressFailureKey.value).toBe('auth.code.wait')
      expect(sendPasswordResetCode).toHaveBeenCalledOnce()

      maintenant = ENVOI + MINUTE
      expect(await reset.sendCode()).toBe(true)
      expect(sendPasswordResetCode).toHaveBeenCalledTimes(2)
    })

    it('dit d’attendre quand le serveur refuse un envoi trop rapproché', async () => {
      sendPasswordResetCode.mockRejectedValue(new AccountError('email-rate-limited'))
      const reset = parcours(ADRESSE)

      expect(await reset.sendCode()).toBe(false)
      expect(reset.addressFailureKey.value).toBe('auth.code.wait')
      expect(reset.step.value).toBe('address')
    })

    it('signale l’absence de réseau', async () => {
      sendPasswordResetCode.mockRejectedValue(new AccountError('offline'))
      const reset = parcours(ADRESSE)

      expect(await reset.sendCode()).toBe(false)
      expect(reset.addressFailureKey.value).toBe('auth.errors.offline')
    })
  })

  describe('code et nouveau mot de passe (V24 octies, nonies)', () => {
    it('vérifie le code puis enregistre le nouveau mot de passe', async () => {
      const reset = await codeEnvoye()
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'nouveau-secret'

      expect(await reset.reset()).toBe(true)
      expect(verifyPasswordResetCode).toHaveBeenCalledWith(ADRESSE, '123456')
      expect(changePassword).toHaveBeenCalledWith('nouveau-secret')
      expect(verifySignUpCode).not.toHaveBeenCalled()
    })

    it('ne vérifie rien tant que le nouveau mot de passe est trop court', async () => {
      const reset = await codeEnvoye()
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'court'

      expect(await reset.reset()).toBe(false)
      expect(reset.passwordError.value).toBe('auth.form.errors.passwordTooShort')
      expect(verifyPasswordResetCode).not.toHaveBeenCalled()
    })

    it('dit « pas le bon » pour un code refusé, sans toucher au mot de passe', async () => {
      verifyPasswordResetCode.mockRejectedValue(new AccountError('invalid-code'))
      const reset = await codeEnvoye()
      reset.emailCode.setCode('000000')
      reset.newPassword.value.password = 'nouveau-secret'

      expect(await reset.reset()).toBe(false)
      expect(reset.emailCode.errorKey.value).toBe('auth.code.errors.incorrect')
      expect(changePassword).not.toHaveBeenCalled()
    })

    it('dit « a expiré » une heure après l’envoi', async () => {
      verifyPasswordResetCode.mockRejectedValue(new AccountError('invalid-code'))
      const reset = await codeEnvoye()
      maintenant = ENVOI + 60 * MINUTE
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'nouveau-secret'

      await reset.reset()

      expect(reset.emailCode.errorKey.value).toBe('auth.code.errors.expired')
    })

    it('refuse le même mot de passe sous son champ, puis ne redemande que le mot de passe', async () => {
      changePassword.mockRejectedValueOnce(new AccountError('same-password'))
      const reset = await codeEnvoye()
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'ancien-secret'

      expect(await reset.reset()).toBe(false)
      expect(reset.passwordError.value).toBe('auth.errors.samePassword')
      expect(reset.emailCode.errorKey.value).toBeNull()

      reset.newPassword.value.password = 'nouveau-secret'
      expect(reset.passwordError.value).toBeNull()
      expect(await reset.reset()).toBe(true)
      expect(verifyPasswordResetCode).toHaveBeenCalledOnce()
    })

    it('refuse un mot de passe trop faible pour le serveur sous son champ', async () => {
      changePassword.mockRejectedValue(new AccountError('weak-password'))
      const reset = await codeEnvoye()
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'password'

      await reset.reset()

      expect(reset.passwordError.value).toBe('auth.errors.weakPassword')
    })

    it('renvoie le code du mot de passe oublié, jamais celui de l’inscription', async () => {
      const reset = await codeEnvoye()
      maintenant = ENVOI + MINUTE

      expect(await reset.emailCode.resend()).toBe('sent')
      expect(sendPasswordResetCode).toHaveBeenCalledTimes(2)
      expect(resendSignUpCode).not.toHaveBeenCalled()
    })

    it('revient à l’adresse, remplie, et oublie le mot de passe saisi', async () => {
      const reset = await codeEnvoye()
      reset.newPassword.value.password = 'nouveau-secret'

      reset.backToAddress()

      expect(reset.step.value).toBe('address')
      expect(reset.address.value.email).toBe(ADRESSE)
      expect(reset.newPassword.value.password).toBe('')
    })
  })

  describe('abandon après un code accepté', () => {
    async function codeAccepte() {
      changePassword.mockRejectedValueOnce(new AccountError('same-password'))
      const scope = effectScope()
      const reset = scope.run(() => parcours(ADRESSE))!
      await reset.sendCode()
      reset.emailCode.setCode('123456')
      reset.newPassword.value.password = 'ancien-secret'
      await reset.reset()
      return { reset, scope }
    }

    it('ferme la session du code en revenant à l’adresse', async () => {
      const { reset } = await codeAccepte()

      reset.backToAddress()

      expect(abandonPasswordReset).toHaveBeenCalledOnce()
    })

    it('la ferme aussi en quittant l’écran', async () => {
      const { scope } = await codeAccepte()

      scope.stop()

      expect(abandonPasswordReset).toHaveBeenCalledOnce()
    })

    it('ne ferme rien en quittant l’écran une fois le mot de passe changé', async () => {
      const { reset, scope } = await codeAccepte()
      reset.newPassword.value.password = 'nouveau-secret'
      expect(await reset.reset()).toBe(true)

      scope.stop()

      expect(abandonPasswordReset).not.toHaveBeenCalled()
    })
  })

  describe('adresse verrouillée (depuis « Changer mon mot de passe »)', () => {
    it('envoie toujours à l’adresse du compte', async () => {
      const reset = usePasswordReset({ email: ADRESSE, isEmailLocked: true })
      reset.address.value.email = 'autre@exemple.fr'

      await reset.sendCode()

      expect(sendPasswordResetCode).toHaveBeenCalledWith(ADRESSE)
      expect(reset.isEmailLocked).toBe(true)
    })
  })
})
