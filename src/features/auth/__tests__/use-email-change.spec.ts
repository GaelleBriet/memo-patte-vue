import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { useEmailChange } from '../composables/use-email-change'
import { AccountError } from '../logic/account-error'
import { useAuthStore } from '../store/auth.store'

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn<typeof useAuthStore>() }))

const NOUVELLE = 'sophie2@exemple.fr'
const ENVOI = new Date(2026, 9, 22, 18, 0).getTime()

const requestEmailChange = vi.fn<(password: string, email: string) => Promise<void>>()
const verifyEmailChangeCode = vi.fn<(email: string, code: string) => Promise<void>>()
const resendEmailChangeCode = vi.fn<() => Promise<void>>()
let maintenant = ENVOI

function remplir(current: string, email: string, accountEmail: string | null = null) {
  const change = useEmailChange({ now: () => maintenant, accountEmail: () => accountEmail })
  change.values.value = { current, email }
  return change
}

beforeEach(() => {
  setActivePinia(createPinia())
  for (const mock of [requestEmailChange, verifyEmailChangeCode, resendEmailChangeCode]) {
    mock.mockReset().mockResolvedValue()
  }
  maintenant = ENVOI
  vi.mocked(useAuthStore).mockReturnValue({
    requestEmailChange,
    verifyEmailChangeCode,
    resendEmailChangeCode,
  } as never)
})

describe('useEmailChange', () => {
  it('reconnecte, envoie le code à la nouvelle adresse, puis passe au code', async () => {
    const change = remplir('ancien-secret', ` ${NOUVELLE} `)

    expect(await change.sendCode()).toBe(true)
    expect(requestEmailChange).toHaveBeenCalledWith('ancien-secret', NOUVELLE)
    expect(change.step.value).toBe('code')
    expect(change.emailCode.email.value).toBe(NOUVELLE)
  })

  it('refuse l’adresse du compte retapée, sans rien envoyer', async () => {
    const change = remplir('secret', 'Sophie@Exemple.fr', 'sophie@exemple.fr')

    expect(await change.sendCode()).toBe(false)
    expect(change.fieldError('email')).toBe('settings.account.email.sameAddress')
    expect(change.step.value).toBe('address')
    expect(requestEmailChange).not.toHaveBeenCalled()
  })

  it('n’envoie rien tant qu’un champ est invalide', async () => {
    const change = remplir('', 'sophie2')

    expect(await change.sendCode()).toBe(false)
    expect(change.fieldError('current')).toBe('auth.form.errors.passwordRequired')
    expect(change.fieldError('email')).toBe('auth.form.errors.emailInvalid')
    expect(requestEmailChange).not.toHaveBeenCalled()
  })

  it('dit « Mot de passe incorrect. Réessaie. » sous le mot de passe', async () => {
    requestEmailChange.mockRejectedValue(new AccountError('invalid-credentials'))
    const change = remplir('faux', NOUVELLE)

    await change.sendCode()

    expect(change.fieldError('current')).toBe('settings.account.delete.identity.wrongPassword')
    expect(change.step.value).toBe('address')
  })

  it('refuse une adresse déjà prise sous la nouvelle adresse, avec le message de l’inscription', async () => {
    requestEmailChange.mockRejectedValue(new AccountError('email-taken'))
    const change = remplir('ancien-secret', 'milo@exemple.fr')

    await change.sendCode()

    expect(change.fieldError('email')).toBe('auth.errors.emailTaken')
    change.values.value.email = 'autre@exemple.fr'
    expect(change.fieldError('email')).toBeNull()
  })

  it('dit d’attendre une minute quand le serveur refuse un envoi rapproché', async () => {
    requestEmailChange.mockRejectedValue(new AccountError('email-rate-limited'))
    const change = remplir('ancien-secret', NOUVELLE)

    await change.sendCode()

    expect(change.fieldError('email')).toBe('auth.code.wait')
  })

  it('signale l’absence de réseau dans le bandeau', async () => {
    requestEmailChange.mockRejectedValue(new AccountError('offline'))
    const change = remplir('ancien-secret', NOUVELLE)

    await change.sendCode()

    expect(change.failureKey.value).toBe('auth.errors.offline')
  })

  it('confirme le code de la nouvelle adresse, puis ferme l’étape', async () => {
    const change = remplir('ancien-secret', NOUVELLE)
    await change.sendCode()
    change.emailCode.setCode('123456')

    expect(await change.emailCode.confirm()).toBe(true)
    expect(verifyEmailChangeCode).toHaveBeenCalledWith(NOUVELLE, '123456')
  })

  it('renvoie le code de changement d’adresse une minute après', async () => {
    const change = remplir('ancien-secret', NOUVELLE)
    await change.sendCode()
    maintenant = ENVOI + 60_000

    expect(await change.emailCode.resend()).toBe('sent')
    expect(resendEmailChangeCode).toHaveBeenCalledWith()
  })

  it('revient à l’adresse, remplie, mot de passe vidé', async () => {
    const change = remplir('ancien-secret', NOUVELLE)
    await change.sendCode()

    change.backToAddress()

    expect(change.step.value).toBe('address')
    expect(change.values.value).toEqual({ current: '', email: NOUVELLE })
  })
})
