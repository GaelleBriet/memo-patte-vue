import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { AccountDeletionError } from '../logic/account-deletion-error'
import { AccountError } from '../logic/account-error'
import { writePlusAccount } from '../logic/plus-account-storage'
import { authRepository } from '../repository/auth.repository'
import {
  createAccountDeletionService,
  type AccountDeletionService,
} from '../service/account-deletion.service'
import { provideAuthRepository } from '../store/auth.store'
import AccountDeletionView from '../views/AccountDeletionView.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { MANAGE_SUBSCRIPTIONS_URL } from '@/shared/utils/google-play'

const service = vi.hoisted(() => ({
  confirmationMethod: vi.fn<AccountDeletionService['confirmationMethod']>(),
  confirmWithPassword: vi.fn<AccountDeletionService['confirmWithPassword']>(),
  confirmWithGoogle: vi.fn<AccountDeletionService['confirmWithGoogle']>(),
  deleteAccount: vi.fn<AccountDeletionService['deleteAccount']>(),
}))

vi.mock('../service/account-deletion.service', () => ({
  createAccountDeletionService: vi.fn<typeof createAccountDeletionService>(() => service),
}))

const fake = service
const SOPHIE_GOOGLE = { kind: 'google' as const, email: 'sophie@gmail.com', subject: '1082' }

provideAuthRepository(() => authRepository)

let replace: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.clearAllMocks()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  writePlusAccount({ userId: USER_ID })
  fake.confirmationMethod.mockResolvedValue({ kind: 'password' })
  fake.confirmWithPassword.mockResolvedValue()
  fake.deleteAccount.mockResolvedValue()
  await router.push({ name: 'settings-account-delete' })
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(AccountDeletionView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

async function toucher(selecteur: string) {
  await wrapper!.get(selecteur).trigger('click')
  await flushPromises()
}

async function jusquaLIdentite() {
  const wrapper = await monter()
  await toucher('.account-deletion__continue')
  return wrapper
}

describe('AccountDeletionView — ce qui change (D1)', () => {
  it('dit ce qui est supprimé, ce qui reste, et que l’abonnement Google Play continue', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Supprimer mon compte')
    expect(wrapper.get('.account-deletion__panel--removed').text()).toContain('Ce qui est supprimé')
    expect(
      wrapper.findAll('.account-deletion__panel--removed li').map((item) => item.text()),
    ).toEqual([
      'Ton compte et ton adresse e-mail',
      'Ta sauvegarde cloud (tes animaux et leur carnet)',
      'Tes photos sauvegardées',
      'Tes données d’usage associées au compte',
    ])
    expect(wrapper.findAll('.account-deletion__panel--kept li').map((item) => item.text())).toEqual(
      ['Le carnet sur ce téléphone', 'L’historique d’achat chez Google Play'],
    )
    expect(wrapper.get('.account-deletion__subscription').text()).toContain(
      'Supprimer ton compte ne résilie pas ton abonnement Google Play.',
    )
    const link = wrapper.get('.account-deletion__manage')
    expect(link.text()).toBe('Gérer mon abonnement · Google Play')
    expect(link.attributes('href')).toBe(MANAGE_SUBSCRIPTIONS_URL)
  })

  it('Annuler revient à l’écran Compte', async () => {
    await monter()

    await toucher('.account-deletion__cancel')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })

  it('la flèche de retour revient à l’écran Compte', async () => {
    await monter()

    await toucher('.pushed-screen__back')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })
})

describe('AccountDeletionView — confirmer son identité (D2)', () => {
  it('demande le mot de passe, sans « Mot de passe oublié ? »', async () => {
    const wrapper = await jusquaLIdentite()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Confirme que c’est toi')
    expect(wrapper.text()).toContain('Pour ta sécurité, confirme ton identité avant de continuer.')
    expect(wrapper.get('label[for="account-deletion-password"]').text()).toContain('Mot de passe')
    expect(wrapper.text()).not.toContain('Mot de passe oublié')
    expect(wrapper.get('.account-deletion__confirm').attributes('disabled')).toBeDefined()
  })

  it('envoie le mot de passe saisi', async () => {
    const wrapper = await jusquaLIdentite()

    await wrapper.get('#account-deletion-password').setValue('secret-123')
    await toucher('.account-deletion__confirm')

    expect(fake.confirmWithPassword).toHaveBeenCalledWith('secret-123')
  })

  it('dit « Mot de passe incorrect. Réessaie. » sous le champ', async () => {
    fake.confirmWithPassword.mockRejectedValueOnce(new AccountError('invalid-credentials'))
    const wrapper = await jusquaLIdentite()

    await wrapper.get('#account-deletion-password').setValue('faux')
    await toucher('.account-deletion__confirm')

    expect(wrapper.get('.form-field__error').text()).toBe('Mot de passe incorrect. Réessaie.')
  })

  it('la flèche revient à D1, Annuler quitte le parcours', async () => {
    const wrapper = await jusquaLIdentite()

    await toucher('.pushed-screen__back')
    expect(wrapper.find('.account-deletion__panel--removed').exists()).toBe(true)
    expect(replace).not.toHaveBeenCalled()

    await toucher('.account-deletion__continue')
    await toucher('.account-deletion__cancel')
    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })
})

describe('AccountDeletionView — confirmer avec Google (D2 bis)', () => {
  beforeEach(() => {
    fake.confirmationMethod.mockResolvedValue(SOPHIE_GOOGLE)
  })

  it('propose « Se reconnecter avec Google » et Annuler, sans mot de passe', async () => {
    const wrapper = await jusquaLIdentite()

    expect(wrapper.get('.account-deletion__google').text()).toBe('Se reconnecter avec Google')
    expect(wrapper.find('#account-deletion-password').exists()).toBe(false)
    expect(wrapper.get('.account-deletion__cancel').text()).toBe('Annuler')
  })

  it('refuse un autre compte Google en nommant celui du carnet', async () => {
    fake.confirmWithGoogle.mockResolvedValueOnce({
      kind: 'other-google-account',
      expectedEmail: 'sophie@gmail.com',
    })
    const wrapper = await jusquaLIdentite()

    await toucher('.account-deletion__google')

    expect(wrapper.get('.account-deletion__error').text()).toBe(
      'Ce n’est pas le compte Google de ce carnet. Choisis sophie@gmail.com.',
    )
  })
})

describe('AccountDeletionView — échec (D6)', () => {
  it('dit que la suppression n’a pas abouti et propose de réessayer', async () => {
    fake.confirmationMethod.mockRejectedValueOnce(new AccountDeletionError('failed'))
    const wrapper = await monter()

    await toucher('.account-deletion__continue')

    expect(wrapper.get('.account-deletion__status-title').text()).toBe('La suppression a échoué')
    expect(wrapper.get('.account-deletion__status-body').text()).toBe(
      'La suppression n’a pas abouti. Tes données restent sur ce téléphone ; réessaie.',
    )

    await toucher('.account-deletion__retry')

    expect(fake.confirmationMethod).toHaveBeenCalledTimes(2)
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Confirme que c’est toi')
  })

  it('Annuler quitte le parcours', async () => {
    fake.confirmationMethod.mockRejectedValueOnce(new AccountDeletionError('failed'))
    await monter()
    await toucher('.account-deletion__continue')

    await toucher('.account-deletion__cancel')

    expect(replace).toHaveBeenCalledWith({ name: 'settings-account' })
  })
})

it('construit le service avec l’oubli du compte par le store', async () => {
  await monter()

  expect(vi.mocked(createAccountDeletionService)).toHaveBeenCalledWith({
    forgetAccountOnDevice: expect.any(Function),
  })
})
