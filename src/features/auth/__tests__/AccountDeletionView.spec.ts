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
import PasswordField from '@/shared/form/PasswordField.vue'
import { memoryStorage, USER_ID } from './auth-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { MANAGE_SUBSCRIPTIONS_URL } from '@/shared/utils/google-play'
import { writeStoredPlusStatus } from '@/features/purchase/logic/plus-status-storage'

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

function champsDeMotDePasse(w: VueWrapper): (string | undefined)[] {
  return w.findAllComponents(PasswordField).map((champ) => champ.get('input').attributes('id'))
}

describe('AccountDeletionView — ce qui change (D1)', () => {
  it('dit ce qui est supprimé, ce qui reste, et que l’abonnement Google Play continue', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Supprimer mon compte')
    expect(wrapper.get('.account-deletion-summary__panel--removed').text()).toContain(
      'Ce qui est supprimé',
    )
    expect(
      wrapper.findAll('.account-deletion-summary__panel--removed li').map((item) => item.text()),
    ).toEqual([
      'Ton compte et ton adresse e-mail',
      'Ta sauvegarde cloud (tes animaux et leur carnet)',
      'Tes photos sauvegardées',
      'Tes données d’usage associées au compte',
    ])
    expect(
      wrapper.findAll('.account-deletion-summary__panel--kept li').map((item) => item.text()),
    ).toEqual(['Le carnet sur ce téléphone', 'L’historique d’achat chez Google Play'])
    expect(wrapper.get('.account-deletion-summary__subscription').text()).toContain(
      'Supprimer ton compte ne résilie pas ton abonnement Google Play.',
    )
    const link = wrapper.get('.account-deletion-summary__manage')
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

  it('porte le champ partagé avec l’icône œil, focalisé à l’ouverture', async () => {
    const wrapper = await jusquaLIdentite()

    expect(champsDeMotDePasse(wrapper)).toEqual(['account-deletion-password'])
    expect(wrapper.get('#account-deletion-password').attributes('autofocus')).toBeDefined()
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
    expect(wrapper.find('.account-deletion-summary__panel--removed').exists()).toBe(true)
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

async function jusquaLaConfirmationFinale() {
  const wrapper = await jusquaLIdentite()
  await wrapper.get('#account-deletion-password').setValue('secret-123')
  await toucher('.account-deletion__confirm')
  return wrapper
}

function dialogue(): HTMLElement | null {
  return document.body.querySelector<HTMLElement>('.confirm-dialog.v-overlay--active')
}

async function toucherDansLeDialogue(selecteur: string) {
  dialogue()!.querySelector<HTMLElement>(selecteur)!.click()
  await flushPromises()
}

describe('AccountDeletionView — confirmation finale (D3)', () => {
  it('nomme le bouton de D2 « Confirmer mon mot de passe »', async () => {
    const wrapper = await jusquaLIdentite()

    expect(wrapper.get('.account-deletion__confirm').attributes('aria-label')).toBe(
      'Confirmer mon mot de passe',
    )
  })

  it('demande une dernière fois, et prévient que l’abonnement Google Play continue', async () => {
    const wrapper = await jusquaLaConfirmationFinale()

    expect(wrapper.find('.account-deletion-summary__panel--removed').exists()).toBe(true)
    expect(dialogue()!.querySelector('.confirm-dialog__title')!.textContent).toBe(
      'Supprimer définitivement ton compte ?',
    )
    expect(dialogue()!.querySelector('.confirm-dialog__text')!.textContent).toBe(
      'Ton compte, ta sauvegarde cloud et tes photos sauvegardées seront supprimés. Impossible de revenir en arrière.',
    )
    expect(dialogue()!.querySelector('.confirm-dialog__note')!.textContent).toBe(
      'Ton abonnement Google Play continue tant que tu ne le résilies pas dans Google Play.',
    )
    const supprimer = dialogue()!.querySelector<HTMLElement>('.confirm-dialog__confirm')!
    expect(supprimer.textContent!.trim()).toBe('Supprimer')
    expect(supprimer.getAttribute('aria-label')).toBe('Supprimer définitivement mon compte')
  })

  it('Annuler revient à ce qui change (D1) sans rien supprimer', async () => {
    const wrapper = await jusquaLaConfirmationFinale()

    await toucherDansLeDialogue('.confirm-dialog__cancel')

    expect(fake.deleteAccount).not.toHaveBeenCalled()
    expect(dialogue()).toBeNull()
    expect(wrapper.find('.account-deletion__continue').exists()).toBe(true)
  })
})

describe('AccountDeletionView — suppression (D4, D5)', () => {
  it('montre « Suppression en cours… » sans flèche de retour, puis « Compte supprimé »', async () => {
    let terminer: () => void = () => {}
    fake.deleteAccount.mockImplementationOnce(() => new Promise<void>((done) => (terminer = done)))
    const wrapper = await jusquaLaConfirmationFinale()

    await toucherDansLeDialogue('.confirm-dialog__confirm')

    expect(wrapper.get('.account-deletion__status-title').text()).toBe('Suppression en cours…')
    expect(wrapper.get('.account-deletion__status-body').text()).toBe(
      'Garde l’app ouverte quelques secondes.',
    )
    expect(wrapper.get('.pushed-screen__back').attributes('disabled')).toBeDefined()

    terminer()
    await flushPromises()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Compte supprimé')
    expect(wrapper.get('.account-deletion__status-title').text()).toBe('Compte supprimé')
    expect(wrapper.get('.account-deletion__status-body').text()).toBe(
      'Ton carnet est toujours sur ce téléphone.',
    )
    expect(wrapper.get('.account-deletion__erase-note').text()).toBe(
      'Effacer aussi les données de ce téléphone ? Animaux, traitements, vaccins, poids et photos. Confirmation séparée.',
    )
    expect(wrapper.get('.pushed-screen__back').attributes('aria-label')).toBe('Fermer')
  })

  it('Terminé et la croix reviennent à la liste des Paramètres, en remplaçant l’écran', async () => {
    await jusquaLaConfirmationFinale()
    await toucherDansLeDialogue('.confirm-dialog__confirm')

    await toucher('.account-deletion__done')
    expect(replace).toHaveBeenLastCalledWith({ name: 'settings' })

    replace.mockClear()
    await toucher('.pushed-screen__back')
    expect(replace).toHaveBeenLastCalledWith({ name: 'settings' })
  })

  it('« Effacer aussi les données de ce téléphone » ouvre l’écran d’effacement', async () => {
    const push = vi.spyOn(router, 'push').mockResolvedValue()
    await jusquaLaConfirmationFinale()
    await toucherDansLeDialogue('.confirm-dialog__confirm')

    await toucher('.account-deletion__erase')

    expect(push).toHaveBeenCalledWith({ name: 'settings-erase' })
  })
})

describe('AccountDeletionView — ce que dit la suppression selon l’achat Plus', () => {
  it('rappelle qu’un achat à vie n’est pas remboursé, au résumé puis à la confirmation', async () => {
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    const wrapper = await monter()

    expect(wrapper.get('.account-deletion-summary__subscription').text()).toContain(
      'Supprimer ton compte ne rembourse pas ton achat à vie.',
    )
    expect(wrapper.text()).not.toContain('ne résilie pas ton abonnement')
    expect(wrapper.find('.account-deletion-summary__manage').exists()).toBe(false)

    await toucher('.account-deletion__continue')
    await wrapper.get('#account-deletion-password').setValue('secret-123')
    await toucher('.account-deletion__confirm')

    expect(dialogue()!.querySelector('.confirm-dialog__note')!.textContent).toBe(
      'Supprimer ton compte ne rembourse pas ton achat à vie.',
    )
  })

  it('le dit aussi en anglais', async () => {
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    i18n.global.locale.value = 'en'
    try {
      const wrapper = await monter()

      expect(wrapper.get('.account-deletion-summary__subscription').text()).toContain(
        'Deleting your account does not refund your lifetime purchase.',
      )
    } finally {
      i18n.global.locale.value = 'fr'
    }
  })

  it('ne parle ni d’abonnement ni de Google Play pour un droit offert', async () => {
    writeStoredPlusStatus({
      plan: 'annual',
      expiresAt: new Date(2226, 9, 29, 9).toISOString(),
      offered: true,
    })
    const wrapper = await monter()

    expect(wrapper.find('.account-deletion-summary__subscription').exists()).toBe(false)
    expect(wrapper.find('.account-deletion-summary__manage').exists()).toBe(false)
    expect(wrapper.get('.account-deletion-summary__panel--kept').text()).not.toContain(
      'Google Play',
    )

    await toucher('.account-deletion__continue')
    await wrapper.get('#account-deletion-password').setValue('secret-123')
    await toucher('.account-deletion__confirm')

    expect(dialogue()!.querySelector('.confirm-dialog__note')).toBeNull()
  })

  it('ne parle ni d’abonnement ni de Google Play après un droit offert terminé', async () => {
    writeStoredPlusStatus({
      plan: 'none',
      expiresAt: null,
      lastSubscription: 'monthly',
      lastSubscriptionOffered: true,
      subscriptionEndedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    const wrapper = await monter()

    expect(wrapper.find('.account-deletion-summary__subscription').exists()).toBe(false)
    expect(
      wrapper.findAll('.account-deletion-summary__panel--kept li').map((item) => item.text()),
    ).toEqual(['Le carnet sur ce téléphone'])
  })

  it('garde l’historique d’achat Google Play pour un achat à vie', async () => {
    writeStoredPlusStatus({ plan: 'lifetime', expiresAt: null })
    const wrapper = await monter()

    expect(
      wrapper.findAll('.account-deletion-summary__panel--kept li').map((item) => item.text()),
    ).toEqual(['Le carnet sur ce téléphone', 'L’historique d’achat chez Google Play'])
  })
})
