import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import {
  BillingError,
  billingService,
  type BillingService,
  type PlusOffer,
} from '../service/billing.service'
import { NO_PLUS, type PlusStatus } from '../logic/plus-status'
import { writeStoredPlusStatus } from '../logic/plus-status-storage'
import PlusView from '../views/PlusView.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { dismissToast, toastMessage } from '@/shared/utils/toast'
import { memoryStorage } from './billing-fixture'

vi.mock('../service/billing.service', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  billingService: {
    isAvailable: vi.fn<BillingService['isAvailable']>(() => true),
    listOffers: vi.fn<BillingService['listOffers']>(async () => []),
    purchase: vi.fn<BillingService['purchase']>(),
    fetchStatus: vi.fn<BillingService['fetchStatus']>(),
    restore: vi.fn<BillingService['restore']>(),
    logIn: vi.fn<BillingService['logIn']>(),
  },
}))

const service = vi.mocked(billingService)

// Prix volontairement différents des tarifs français : seul l'offering peut les fournir.
const OFFRES: PlusOffer[] = [
  { plan: 'monthly', priceString: '$1.99' },
  { plan: 'annual', priceString: '$12.99' },
  { plan: 'lifetime', priceString: '$34.99' },
]

const ANNUEL: PlusStatus = { plan: 'annual', expiresAt: '2027-09-01T10:00:00Z' }

const Vide = { render: () => null }

let routeur: Router
let back: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.clearAllMocks()
  service.isAvailable.mockReturnValue(true)
  service.listOffers.mockResolvedValue([...OFFRES])
  vi.stubGlobal('localStorage', memoryStorage())
  setActivePinia(createPinia())
  routeur = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/plus', name: 'plus', component: Vide },
    ],
  })
  await routeur.push('/plus')
  back = vi.spyOn(routeur, 'back').mockImplementation(() => {})
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  dismissToast()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

async function monter() {
  wrapper = mount(PlusView, {
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function offres(wrapper: VueWrapper) {
  return wrapper.findAll('.plus-offer')
}

describe('PlusView — ouverture', () => {
  it('ne touche à RevenueCat qu’à l’ouverture de l’écran', async () => {
    expect(service.listOffers).not.toHaveBeenCalled()

    await monter()

    expect(service.listOffers).toHaveBeenCalledTimes(1)
  })

  it('est un écran poussé, refermable à tout moment', async () => {
    const wrapper = await monter()

    expect(wrapper.classes()).toEqual(expect.arrayContaining(['pushed-screen', 'plus']))
    expect(wrapper.get('.pushed-screen__title').text()).toBe('MémoPatte Plus')

    await wrapper.get('.pushed-screen__back').trigger('click')

    expect(back).toHaveBeenCalled()
  })
})

describe('PlusView — contenu', () => {
  it('annonce la promesse et les quatre bénéfices de la maquette', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__headline').text()).toBe('Garde tes carnets en sécurité, partout')
    expect(wrapper.get('.plus__subtitle').text()).toBe(
      'Le local reste gratuit et sans limite. Plus ajoute la sauvegarde cloud.',
    )
    expect(wrapper.findAll('.plus__benefit').map((item) => item.text())).toEqual([
      'Sauvegarde garantie dans le cloud',
      'Le même carnet sur tous tes appareils',
      'Tes photos sauvegardées aussi',
      'Export PDF complet',
    ])
  })

  it('rappelle ce qui est déjà gratuit et sans compte', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__free-title').text()).toBe('Déjà inclus gratuitement, sans compte')
    expect(wrapper.findAll('.plus__free-item').map((item) => item.text())).toEqual([
      'Animaux illimités',
      'Rappels illimités',
      'Suivi de poids illimité',
      'Export JSON et CSV',
    ])
  })

  it('compare ce qu’Android sauvegarde déjà et ce que Plus garantit', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__comparison-title').text()).toBe(
      'Ce qu’Android fait déjà, ce que Plus garantit',
    )
    const lignes = wrapper.findAll('.plus__comparison-row')
    expect(
      lignes.map((ligne) => [
        ligne.get('.plus__comparison-label').text(),
        ligne.get('.plus__comparison-android').text(),
        ligne.get('.plus__comparison-plus').text(),
      ]),
    ).toEqual([
      ['Sauvegarde automatique', 'Oui, au mieux (best effort)', 'Oui, garantie'],
      ['Photos sauvegardées', 'Non', 'Oui'],
      ['Restauration sur nouvel appareil', 'Pas garantie', 'Garantie'],
    ])
  })
})

describe('PlusView — offres', () => {
  it('affiche les prix localisés venant de l’offering, jamais des prix codés en dur', async () => {
    const wrapper = await monter()

    expect(offres(wrapper).map((offre) => offre.get('.plus-offer__price').text())).toEqual([
      '$12.99/an',
      '$1.99/mois',
      '$34.99',
    ])
    expect(wrapper.text()).not.toContain('1,49')
    expect(wrapper.text()).not.toContain('9,99')
    expect(wrapper.text()).not.toContain('29,99')
  })

  it('met l’annuel en tête quel que soit l’ordre de l’offering', async () => {
    service.listOffers.mockResolvedValue([...OFFRES].reverse())
    const wrapper = await monter()

    expect(offres(wrapper).map((offre) => offre.get('.plus-offer__label').text())).toEqual([
      'Plus annuel',
      'Mensuel',
      'À vie',
    ])
  })

  it('dit la périodicité, le renouvellement automatique et l’achat unique', async () => {
    const wrapper = await monter()
    const conditions = offres(wrapper).map((offre) => offre.get('.plus-offer__terms').text())

    expect(conditions).toEqual([
      'Renouvellement automatique chaque année. Annulable à tout moment dans Google Play — accès conservé jusqu’à la fin de la période payée.',
      'Renouvellement automatique chaque mois. Sans engagement, annulable à tout moment.',
      'Paiement unique, pour toujours.',
    ])
  })

  it('annonce l’économie de l’annuel en pourcentage, jamais en prix mensuel', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.plus-offer__saving').map((item) => item.text())).toEqual([
      '≈ 44 % d’économie vs mensuel',
    ])
  })

  it('nomme l’offre et son prix sur le bouton d’achat', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus annuel — $12.99/an')

    await offres(wrapper)[2]!.trigger('click')

    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus à vie — $34.99')
  })

  it('met l’offre annuelle en avant et la présélectionne', async () => {
    const wrapper = await monter()
    const [annuel, mensuel, aVie] = offres(wrapper)

    expect(annuel!.classes()).toEqual(
      expect.arrayContaining(['plus-offer--selected', 'plus-offer--best']),
    )
    expect(annuel!.get('.plus-offer__badge').text()).toBe('Meilleure offre')
    expect(annuel!.attributes('aria-checked')).toBe('true')
    expect(mensuel!.classes()).not.toContain('plus-offer--selected')
    expect(aVie!.classes()).not.toContain('plus-offer--selected')
  })
})

describe('PlusView — mentions obligatoires', () => {
  it('rappelle la gratuité, le carnet qui reste, et mène à Google Play', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__terms-free').text()).toBe(
      'MémoPatte est utilisable gratuitement sans abonnement.',
    )
    expect(wrapper.get('.plus__terms-prices').text()).toBe(
      'Prix affichés par Google Play, dans ta devise.',
    )
    expect(wrapper.get('.plus__terms-local').text()).toBe(
      'Si tu arrêtes Plus, tes carnets restent sur ton téléphone.',
    )
    const gerer = wrapper.get('.plus__manage')
    expect(gerer.text()).toBe('Gérer mon abonnement · Google Play')
    expect(gerer.attributes('href')).toBe('https://play.google.com/store/account/subscriptions')
  })

  it('ne pose aucun lien vers des pages qui n’existent pas encore', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('a').map((lien) => lien.attributes('href'))).toEqual([
      'https://play.google.com/store/account/subscriptions',
    ])
  })
})

describe('PlusView — déjà abonné', () => {
  it('montre son statut au lieu de l’argumentaire, sans rien redemander', async () => {
    writeStoredPlusStatus(ANNUEL)
    const wrapper = await monter()

    expect(wrapper.get('.plus-member__status').text()).toBe('Abonnement annuel actif.')
    expect(offres(wrapper)).toHaveLength(0)
    expect(wrapper.find('.plus__headline').exists()).toBe(false)
    expect(wrapper.get('.plus-member__manage').attributes('href')).toBe(
      'https://play.google.com/store/account/subscriptions',
    )
    expect(service.listOffers).not.toHaveBeenCalled()

    await wrapper.get('.plus-member__close').trigger('click')

    expect(back).toHaveBeenCalled()
  })
})

describe('PlusView — offres indisponibles', () => {
  it('reste présentable sans clé RevenueCat, sans proposer un réessai inutile', async () => {
    service.isAvailable.mockReturnValue(false)
    service.listOffers.mockResolvedValue([])
    const wrapper = await monter()

    expect(offres(wrapper)).toHaveLength(0)
    expect(wrapper.find('.plus__submit').exists()).toBe(false)
    expect(wrapper.find('.plus__retry-offers').exists()).toBe(false)
    expect(wrapper.get('.plus__unavailable').text()).toBe(
      'Les offres Google Play ne sont pas disponibles pour l’instant.',
    )
    expect(wrapper.get('.plus__headline').isVisible()).toBe(true)
    expect(wrapper.findAll('.plus__benefit')).toHaveLength(4)
    expect(wrapper.get('.plus__terms-free').isVisible()).toBe(true)
    expect(wrapper.find('.plus__restore').exists()).toBe(false)
  })

  it('n’annonce pas « trois façons de payer » quand il n’y en a aucune', async () => {
    service.isAvailable.mockReturnValue(false)
    service.listOffers.mockResolvedValue([])

    expect((await monter()).find('.plus__offers-title').exists()).toBe(false)
  })

  it('propose de réessayer quand le store a répondu par une erreur', async () => {
    service.listOffers.mockRejectedValueOnce(new BillingError('failed'))
    const wrapper = await monter()

    expect(wrapper.get('.plus__unavailable').text()).toBe(
      'Les offres Google Play ne sont pas disponibles pour l’instant.',
    )

    service.listOffers.mockResolvedValue([...OFFRES])
    await wrapper.get('.plus__retry-offers').trigger('click')
    await flushPromises()

    expect(service.listOffers).toHaveBeenCalledTimes(2)
    expect(offres(wrapper)).toHaveLength(3)
  })
})

describe('PlusView — achat', () => {
  it('achète l’offre sélectionnée', async () => {
    service.purchase.mockResolvedValue({ kind: 'purchased', status: ANNUEL })
    const wrapper = await monter()

    await offres(wrapper)[2]!.trigger('click')
    await wrapper.get('.plus__submit').trigger('click')
    await flushPromises()

    expect(service.purchase).toHaveBeenCalledWith('lifetime')
  })

  it('montre l’achat en cours sans jamais bloquer la sortie', async () => {
    let aboutir: (outcome: { kind: 'cancelled' }) => void = () => {}
    service.purchase.mockReturnValue(
      new Promise((resolve) => {
        aboutir = resolve
      }),
    )
    const wrapper = await monter()

    await wrapper.get('.plus__submit').trigger('click')

    expect(wrapper.get('.plus__submit').classes()).toContain('v-btn--loading')
    expect(wrapper.get('.plus__restore').attributes('disabled')).toBeDefined()
    expect(offres(wrapper)[0]!.attributes('disabled')).toBeDefined()
    expect(wrapper.get('.pushed-screen__back').attributes('disabled')).toBeUndefined()

    aboutir({ kind: 'cancelled' })
    await flushPromises()
  })

  it('confirme l’achat abouti', async () => {
    service.purchase.mockResolvedValue({ kind: 'purchased', status: ANNUEL })
    const wrapper = await monter()

    await wrapper.get('.plus__submit').trigger('click')
    await flushPromises()

    expect(wrapper.get('.plus-outcome__title').text()).toBe('Bienvenue dans Plus')
    // #83 : « Carnet sauvegardé. Tu es tranquille. » ne se dira qu'une fois l'envoi initial livré.
    expect(wrapper.get('.plus-outcome__body').text()).toBe(
      'La sauvegarde de ton carnet arrive très vite.',
    )

    await wrapper.get('.plus-outcome__primary').trigger('click')

    expect(back).toHaveBeenCalled()
  })

  it('accueille l’achat annulé sans culpabiliser, et laisse revenir aux offres', async () => {
    service.purchase.mockResolvedValue({ kind: 'cancelled' })
    const wrapper = await monter()

    await wrapper.get('.plus__submit').trigger('click')
    await flushPromises()

    expect(wrapper.get('.plus-outcome__title').text()).toBe('Achat non abouti')
    expect(wrapper.get('.plus-outcome__body').text()).toBe(
      'Aucun paiement n’a été effectué. Réessaie quand tu veux, rien n’a changé pour toi.',
    )

    await wrapper.get('.plus-outcome__primary').trigger('click')

    expect(offres(wrapper)).toHaveLength(3)
  })

  it('dit l’échec du store sans accuser personne, et referme sur « Plus tard »', async () => {
    service.purchase.mockRejectedValue(new BillingError('failed'))
    const wrapper = await monter()

    await wrapper.get('.plus__submit').trigger('click')
    await flushPromises()

    expect(wrapper.get('.plus-outcome__title').text()).toBe('L’achat n’a pas abouti')
    expect(wrapper.get('.plus-outcome__body').text()).toBe(
      'Aucun paiement n’a été effectué. Réessaie dans un instant, rien n’a changé pour toi.',
    )

    await wrapper.get('.plus-outcome__secondary').trigger('click')

    expect(back).toHaveBeenCalled()
  })
})

describe('PlusView — restauration', () => {
  it('rend son achat à qui en a un', async () => {
    service.restore.mockResolvedValue(ANNUEL)
    const wrapper = await monter()

    await wrapper.get('.plus__restore').trigger('click')
    await flushPromises()

    expect(service.restore).toHaveBeenCalledTimes(1)
    expect(wrapper.get('.plus-outcome__title').text()).toBe('Bienvenue dans Plus')
  })

  it('le dit quand il n’y a rien à restaurer', async () => {
    service.restore.mockResolvedValue(NO_PLUS)
    const wrapper = await monter()

    await wrapper.get('.plus__restore').trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('Aucun achat à restaurer sur ce compte Google.')
    expect(offres(wrapper)).toHaveLength(3)
  })

  it('ne se laisse pas relancer tant qu’elle est en vol', async () => {
    let rendre: (status: PlusStatus) => void = () => {}
    service.restore.mockReturnValue(
      new Promise((resolve) => {
        rendre = resolve
      }),
    )
    const wrapper = await monter()

    await wrapper.get('.plus__restore').trigger('click')

    expect(wrapper.get('.plus__restore').classes()).toContain('v-btn--loading')
    expect(wrapper.get('.plus__submit').attributes('disabled')).toBeDefined()

    await wrapper.get('.plus__restore').trigger('click')

    expect(service.restore).toHaveBeenCalledTimes(1)

    rendre(NO_PLUS)
    await flushPromises()
  })

  it('le dit quand la restauration échoue', async () => {
    service.restore.mockRejectedValue(new BillingError('failed'))
    const wrapper = await monter()

    await wrapper.get('.plus__restore').trigger('click')
    await flushPromises()

    expect(toastMessage.value).toBe('La restauration n’a pas abouti. Réessaie.')
  })
})
