import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BillingError, billingService, type BillingService } from '../service/billing.service'
import PlusSection from '../views/PlusSection.vue'
import { NO_PLUS, type PlusStatus } from '../logic/plus-status'
import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import { usePurchaseStore } from '../store/purchase.store'
import { memoryStorage } from './billing-fixture'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import router from '@/router'
import { dismissToast, toastMessage } from '@/shared/utils/toast'

vi.mock('../service/billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    listOffers: vi.fn<BillingService['listOffers']>(),
    purchase: vi.fn<BillingService['purchase']>(),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
    restore: vi.fn<BillingService['restore']>(),
    logIn: vi.fn<BillingService['logIn']>(),
  },
}))

const service = vi.mocked(billingService)

const ANNUAL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-14T10:00:00Z' }
const MONTHLY: PlusStatus = { plan: 'monthly', expiresAt: '2026-10-14T10:00:00Z' }
const LIFETIME: PlusStatus = { plan: 'lifetime', expiresAt: null }
const EXPIRED: PlusStatus = { plan: 'annual', expiresAt: '2026-09-01T10:00:00Z' }
const CONFIRMED_EXPIRED = {
  plan: 'none',
  expiresAt: null,
  lastSubscription: 'annual',
  subscriptionEndedAt: '2026-09-11T10:00:00Z',
} as const

let wrapper: VueWrapper | null = null

beforeEach(() => {
  vi.clearAllMocks()
  service.isAvailable.mockReturnValue(true)
  vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-16T10:00:00Z') })
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

async function monter() {
  await router.push('/')
  wrapper = mount(PlusSection, { global: { plugins: [vuetify, i18n, router] } })
  await flushPromises()
  return wrapper
}

function statut(wrapper: VueWrapper) {
  return wrapper.get('.settings-row--plus-status').text()
}

describe('PlusSection — utilisateur gratuit', () => {
  it('mène à l’écran Plus livré par le routeur, avec ce qu’il apporte', async () => {
    const wrapper = await monter()

    const ligne = wrapper.get('.settings-row--plus-discover')
    expect(wrapper.get('.section-card__title').text()).toBe('MémoPatte Plus')
    expect(ligne.text()).toContain('Découvrir MémoPatte Plus')
    expect(ligne.text()).toContain('Sauvegarde cloud, export PDF, plusieurs appareils')

    await ligne.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plus'))
    expect(router.currentRoute.value.query).toEqual({})
  })

  it('reste présentable sans achat possible sur cet appareil', async () => {
    service.isAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(true)
    expect(wrapper.find('.settings-row--plus-restore').exists()).toBe(false)
  })
})

describe('PlusSection — statut de l’abonnement', () => {
  it('annonce un abonnement annuel et son échéance', async () => {
    writeStoredPlusStatus(ANNUAL)
    const wrapper = await monter()

    expect(statut(wrapper)).toContain('MémoPatte Plus')
    expect(statut(wrapper)).toContain('Plus annuel jusqu’au 14/09/2027')
  })

  it('annonce un abonnement mensuel et son échéance', async () => {
    writeStoredPlusStatus(MONTHLY)

    expect(statut(await monter())).toContain('Plus mensuel jusqu’au 14/10/2026')
  })

  it('annonce un achat à vie, sans échéance', async () => {
    writeStoredPlusStatus(LIFETIME)

    expect(statut(await monter())).toContain('Plus à vie')
  })

  it('annonce un abonnement expiré plutôt que de proposer la découverte', async () => {
    writeStoredPlusStatus(EXPIRED)
    const wrapper = await monter()

    expect(statut(wrapper)).toContain('Plus annuel — expiré')
    expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(false)
  })

  it('mène à l’écran Plus depuis la ligne de statut, comme la maquette', async () => {
    writeStoredPlusStatus(ANNUAL)
    const wrapper = await monter()
    const ligne = wrapper.get('.settings-row--plus-status')

    expect(ligne.find('.settings-row__chevron').exists()).toBe(true)
    await ligne.trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plus'))
  })

  it('range « Gérer mon abonnement » dans la section Plus, sous le statut', async () => {
    writeStoredPlusStatus(ANNUAL)
    const wrapper = await monter()
    const lignes = wrapper.findAll('.settings-row')
    const rang = (modificateur: string) => lignes.findIndex((ligne) => ligne.classes(modificateur))

    expect(wrapper.get('.settings-row--manage-subscription').text()).toContain(
      'Gérer mon abonnement · Google Play',
    )
    expect(rang('settings-row--manage-subscription')).toBe(rang('settings-row--plus-status') + 1)
  })

  it('tient d’un abonnement payant sans échéance connue qu’il est actif', async () => {
    writeStoredPlusStatus({ plan: 'annual', expiresAt: null })

    expect(statut(await monter())).toContain('Abonnement annuel actif.')
  })

  it('ne propose ni découverte ni restauration à un abonné', async () => {
    writeStoredPlusStatus(ANNUAL)
    const wrapper = await monter()

    expect(wrapper.find('.settings-row--plus-discover').exists()).toBe(false)
    expect(wrapper.find('.settings-row--plus-restore').exists()).toBe(false)
  })
})

describe('PlusSection — sauvegarde en pause', () => {
  it('explique la pause et ramène à l’écran Plus, sans alarmer', async () => {
    writeStoredPlusStatus(EXPIRED)
    const wrapper = await monter()
    const bandeau = wrapper.get('.plus-paused')

    expect(bandeau.text()).toContain(
      'Ta sauvegarde cloud est en pause. Tes carnets restent sur ton téléphone.',
    )
    expect(bandeau.attributes('role')).toBe('status')

    await bandeau.get('.plus-paused__action').trigger('click')

    await vi.waitFor(() => expect(router.currentRoute.value.path).toBe('/plus'))
  })

  it('se pose au-dessus du titre de la section', async () => {
    writeStoredPlusStatus(EXPIRED)
    const wrapper = await monter()
    const bandeau = wrapper.get('.plus-paused').element
    const titre = wrapper.get('.section-card__title').element

    expect(bandeau.compareDocumentPosition(titre) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('reste affiché une fois l’expiration confirmée par Google Play', async () => {
    writeStoredPlusStatus(CONFIRMED_EXPIRED)
    const wrapper = await monter()

    expect(wrapper.find('.plus-paused').exists()).toBe(true)
    expect(statut(wrapper)).toContain('Plus annuel — expiré')
  })

  it('laisse place à la découverte de Plus 30 jours après la fin de l’abonnement', async () => {
    writeStoredPlusStatus({ ...CONFIRMED_EXPIRED, subscriptionEndedAt: '2026-08-17T10:00:00Z' })
    const wrapper = await monter()

    expect(wrapper.find('.plus-paused').exists()).toBe(false)
    expect(wrapper.get('.settings-row--plus-discover').text()).toContain('Découvrir MémoPatte Plus')
  })

  it('disparaît dès que Plus est réactivé', async () => {
    writeStoredPlusStatus(CONFIRMED_EXPIRED)
    service.restore.mockResolvedValue(ANNUAL)
    const wrapper = await monter()

    await usePurchaseStore().restore()
    await flushPromises()

    expect(wrapper.find('.plus-paused').exists()).toBe(false)
    expect(statut(wrapper)).toContain('Plus annuel jusqu’au 14/09/2027')
  })

  it('ne propose pas de restaurer un achat tant que Plus est en pause', async () => {
    writeStoredPlusStatus(EXPIRED)

    expect((await monter()).find('.settings-row--plus-restore').exists()).toBe(false)
  })

  it.each([
    ['un utilisateur gratuit', NO_PLUS],
    ['un abonnement en cours', ANNUAL],
    ['un achat à vie', LIFETIME],
  ])('ne met aucun bandeau devant %s', async (_, status) => {
    writeStoredPlusStatus(status)

    expect((await monter()).find('.plus-paused').exists()).toBe(false)
  })
})

describe('PlusSection — restaurer mon achat', () => {
  function ligneRestaurer(wrapper: VueWrapper) {
    return wrapper.get('.settings-row--plus-restore')
  }

  it('reste caché quand les achats ne sont pas disponibles sur cet appareil', async () => {
    service.isAvailable.mockReturnValue(false)
    const wrapper = await monter()

    expect(wrapper.find('.settings-row--plus-restore').exists()).toBe(false)
  })

  it('rend son Plus à qui a déjà payé', async () => {
    service.restore.mockResolvedValue(ANNUAL)
    const wrapper = await monter()

    expect(ligneRestaurer(wrapper).text()).toContain('Restaurer mes achats')
    await ligneRestaurer(wrapper).trigger('click')
    await flushPromises()

    expect(service.restore).toHaveBeenCalledOnce()
    expect(statut(wrapper)).toContain('Plus annuel jusqu’au 14/09/2027')
    expect(toastMessage.value).toBe('Te voilà de retour dans Plus.')
  })

  it('montre la restauration en cours et bloque un second tap', async () => {
    let finish!: (status: PlusStatus) => void
    service.restore.mockReturnValue(new Promise((resolve) => (finish = resolve)))
    const wrapper = await monter()

    await ligneRestaurer(wrapper).trigger('click')
    await ligneRestaurer(wrapper).trigger('click')

    expect(service.restore).toHaveBeenCalledOnce()
    expect(ligneRestaurer(wrapper).attributes('disabled')).toBeDefined()
    expect(ligneRestaurer(wrapper).attributes('aria-busy')).toBe('true')
    expect(ligneRestaurer(wrapper).get('[role="status"]').text()).toBe('Restauration…')

    finish(NO_PLUS)
    await flushPromises()

    expect(ligneRestaurer(wrapper).attributes('disabled')).toBeUndefined()
  })

  it('dit clairement qu’il n’y a rien à restaurer sur ce compte Google', async () => {
    service.restore.mockResolvedValue(NO_PLUS)
    const wrapper = await monter()

    await ligneRestaurer(wrapper).trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('Aucun achat à restaurer sur ce compte Google.')
    expect(wrapper.find('.settings-row--plus-status').exists()).toBe(false)
  })

  it('invite à réessayer quand Google Play ne répond pas', async () => {
    service.restore.mockRejectedValue(new BillingError('failed'))
    const wrapper = await monter()

    await ligneRestaurer(wrapper).trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('La restauration n’a pas abouti. Réessaie.')
    expect(ligneRestaurer(wrapper).attributes('disabled')).toBeUndefined()
  })
})
