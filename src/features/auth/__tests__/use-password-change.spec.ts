import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { usePasswordChange } from '../composables/use-password-change'
import { AccountError } from '../logic/account-error'
import { useAuthStore } from '../store/auth.store'

vi.mock('../store/auth.store', () => ({ useAuthStore: vi.fn<typeof useAuthStore>() }))

const changePasswordWithCurrent = vi.fn<(current: string, next: string) => Promise<void>>()

function remplir(current: string, next: string) {
  const change = usePasswordChange()
  change.values.value = { current, next }
  return change
}

beforeEach(() => {
  setActivePinia(createPinia())
  changePasswordWithCurrent.mockReset().mockResolvedValue()
  vi.mocked(useAuthStore).mockReturnValue({ changePasswordWithCurrent } as never)
})

describe('usePasswordChange', () => {
  it('enregistre le nouveau mot de passe après l’actuel', async () => {
    const change = remplir('ancien-secret', 'nouveau-secret')

    expect(await change.save()).toBe(true)
    expect(changePasswordWithCurrent).toHaveBeenCalledWith('ancien-secret', 'nouveau-secret')
  })

  it('n’envoie rien tant qu’un champ est invalide', async () => {
    const change = remplir('', 'court')

    expect(await change.save()).toBe(false)
    expect(change.fieldError('current')).toBe('auth.form.errors.passwordRequired')
    expect(change.fieldError('next')).toBe('auth.form.errors.passwordTooShort')
    expect(changePasswordWithCurrent).not.toHaveBeenCalled()
  })

  it('dit « Mot de passe incorrect. Réessaie. » sous l’actuel, jusqu’à ce qu’il change', async () => {
    changePasswordWithCurrent.mockRejectedValue(new AccountError('invalid-credentials'))
    const change = remplir('faux', 'nouveau-secret')

    expect(await change.save()).toBe(false)
    expect(change.fieldError('current')).toBe('settings.account.delete.identity.wrongPassword')

    change.values.value.current = 'autre'
    expect(change.fieldError('current')).toBeNull()
  })

  it('refuse sous le nouveau un mot de passe identique ou trop faible', async () => {
    changePasswordWithCurrent.mockRejectedValueOnce(new AccountError('same-password'))
    const change = remplir('ancien-secret', 'ancien-secret')

    await change.save()
    expect(change.fieldError('next')).toBe('auth.errors.samePassword')

    changePasswordWithCurrent.mockRejectedValueOnce(new AccountError('weak-password'))
    change.values.value.next = 'password'
    await change.save()
    expect(change.fieldError('next')).toBe('auth.errors.weakPassword')
  })

  it('signale l’absence de réseau dans le bandeau', async () => {
    changePasswordWithCurrent.mockRejectedValue(new AccountError('offline'))
    const change = remplir('ancien-secret', 'nouveau-secret')

    await change.save()

    expect(change.failureKey.value).toBe('auth.errors.offline')
    expect(change.fieldError('current')).toBeNull()
  })
})
