import { nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mustWarnBeforeSignIn } from '../logic/existing-data-warning'
import { useExistingDataWarning } from '../composables/use-existing-data-warning'
import { provideAuthRepository } from '../store/auth.store'
import { authRepository, type AuthRepository } from '../repository/auth.repository'
import { writePlusAccount } from '../logic/plus-account-storage'
import { USER_ID } from './auth-fixture'
import { provideAnimalsRepository } from '@/features/animals/store/animals.store'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'

vi.mock('../repository/auth.repository', () => ({
  authRepository: {
    onSessionChange: vi.fn<AuthRepository['onSessionChange']>(),
    onSessionUnreadable: vi.fn<AuthRepository['onSessionUnreadable']>(),
  },
}))

describe('mustWarnBeforeSignIn', () => {
  it('prévient quand le téléphone a un animal et aucun compte', () => {
    expect(mustWarnBeforeSignIn({ animalCount: 1, hasAccount: false })).toBe(true)
  })

  it('ne prévient pas sans animal', () => {
    expect(mustWarnBeforeSignIn({ animalCount: 0, hasAccount: false })).toBe(false)
  })

  it('prévient quand le nombre d’animaux est inconnu', () => {
    expect(mustWarnBeforeSignIn({ animalCount: null, hasAccount: false })).toBe(true)
  })

  it('ne prévient pas quand un compte est déjà connecté', () => {
    expect(mustWarnBeforeSignIn({ animalCount: 3, hasAccount: true })).toBe(false)
  })
})

describe('useExistingDataWarning', () => {
  let list: ReturnType<typeof vi.fn<AnimalsRepository['list']>>

  function animals(count: number): void {
    list.mockResolvedValue(Array.from({ length: count }, (_, i) => ({ id: `a${i}` }) as never))
  }

  beforeEach(() => {
    setActivePinia(createPinia())
    provideAuthRepository(() => authRepository)
    localStorage.clear()
    list = vi.fn<AnimalsRepository['list']>()
    provideAnimalsRepository(() => ({ list }) as unknown as AnimalsRepository)
  })

  it('laisse passer tout de suite un téléphone sans animal', async () => {
    animals(0)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()

    await warning.guard(proceed)

    expect(proceed).toHaveBeenCalledOnce()
    expect(warning.isOpen.value).toBe(false)
  })

  it('ouvre le dialogue sans poursuivre quand le téléphone a un carnet', async () => {
    animals(2)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()

    await warning.guard(proceed)

    expect(proceed).not.toHaveBeenCalled()
    expect(warning.isOpen.value).toBe(true)
  })

  it('« Continuer » poursuit la connexion une seule fois', async () => {
    animals(1)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()
    await warning.guard(proceed)

    warning.continueSignIn()
    warning.continueSignIn()

    expect(proceed).toHaveBeenCalledOnce()
    expect(warning.isOpen.value).toBe(false)
  })

  it('« Annuler » ne poursuit pas', async () => {
    animals(1)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()
    await warning.guard(proceed)

    warning.cancel()
    warning.continueSignIn()

    expect(proceed).not.toHaveBeenCalled()
    expect(warning.isOpen.value).toBe(false)
  })

  it('oublie l’action quand le dialogue se ferme sans « Continuer »', async () => {
    animals(1)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()
    await warning.guard(proceed)

    warning.isOpen.value = false
    await nextTick()
    warning.continueSignIn()

    expect(proceed).not.toHaveBeenCalled()
  })

  it('laisse passer un téléphone déjà relié à un compte', async () => {
    writePlusAccount({ userId: USER_ID })
    setActivePinia(createPinia())
    animals(2)
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()

    await warning.guard(proceed)

    expect(proceed).toHaveBeenCalledOnce()
  })

  it('prévient quand la liste des animaux ne se lit pas', async () => {
    list.mockRejectedValue(new Error('base fermée'))
    const warning = useExistingDataWarning()
    const proceed = vi.fn<() => void>()

    await warning.guard(proceed)

    expect(proceed).not.toHaveBeenCalled()
    expect(warning.isOpen.value).toBe(true)
  })
})
