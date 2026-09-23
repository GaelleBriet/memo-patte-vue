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
import { usePurchaseStore } from '../store/purchase.store'
import PlusView from '../views/PlusView.vue'
import i18n from '@/core/i18n'
import { getMsIconPath } from '@/core/theme/icons'
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

beforeEach(() => {
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

async function monter(from?: string) {
  await routeur.push({ name: 'plus', query: from === undefined ? {} : { from } })
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

function traceIcone(element: ReturnType<VueWrapper['get']>) {
  return element.get('svg path').attributes('d')
}

describe('PlusView — ouverture', () => {
  it('ne touche à RevenueCat qu’à l’ouverture de l’écran', async () => {
    await routeur.push({ name: 'plus' })
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

describe('PlusView — provenance', () => {
  it('nomme l’export PDF quand on vient d’une fonction PDF', async () => {
    const wrapper = await monter('pdf')

    expect(wrapper.get('.plus__headline').text()).toBe('L’export PDF fait partie de MémoPatte Plus')
    expect(traceIcone(wrapper.get('.plus__hero-icon'))).toBe(getMsIconPath('picture_as_pdf')!.path)
  })

  it('met l’export PDF en tête des bénéfices, et lui seul en avant', async () => {
    const wrapper = await monter('pdf')
    const benefices = wrapper.findAll('.plus__benefit')

    expect(benefices.map((item) => item.text())).toEqual([
      'Export PDF complet',
      'Sauvegarde garantie dans le cloud',
      'Le même carnet sur tous tes appareils',
      'Tes photos sauvegardées aussi',
    ])
    expect(benefices.map((item) => item.classes().includes('plus__benefit--highlighted'))).toEqual([
      true,
      false,
      false,
      false,
    ])
  })

  it('garde le titre général quand on vient des Paramètres', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__headline').text()).toBe('Garde tes carnets en sécurité, partout')
    expect(traceIcone(wrapper.get('.plus__hero-icon'))).toBe(
      getMsIconPath('workspace_premium')!.path,
    )
    expect(wrapper.findAll('.plus__benefit').map((item) => item.text())).toEqual([
      'Sauvegarde garantie dans le cloud',
      'Le même carnet sur tous tes appareils',
      'Tes photos sauvegardées aussi',
      'Export PDF complet',
    ])
    expect(wrapper.find('.plus__benefit--highlighted').exists()).toBe(false)
  })

  it('retombe sur la version générale pour une provenance inconnue', async () => {
    const wrapper = await monter('inconnue')

    expect(wrapper.get('.plus__headline').text()).toBe('Garde tes carnets en sécurité, partout')
  })
})

describe('PlusView — contenu', () => {
  it('rappelle ce qui reste gratuit sous le titre', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__subtitle').text()).toBe(
      'Animaux, rappels, poids et export JSON/CSV restent gratuits, sans compte ni abonnement.',
    )
  })

  it('dit en une ligne ce qu’Android sauvegarde déjà et ce que Plus garantit', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__android').text()).toBe(
      'Android sauvegarde déjà ton carnet, mais sans les photos ni garantie de restauration. Plus le garantit.',
    )
    expect(wrapper.find('table').exists()).toBe(false)
  })

  it('rappelle la devise des prix et le carnet qui reste, et mène à Google Play', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.plus__terms').text()).toBe(
      'Prix affichés par Google Play, dans ta devise. Si tu arrêtes Plus, tes carnets restent sur ton téléphone.',
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

  it('résume chaque offre en une ligne, l’économie de l’annuel en pourcentage', async () => {
    const wrapper = await monter()

    expect(offres(wrapper).map((offre) => offre.get('.plus-offer__detail').text())).toEqual([
      '≈ 44 % d’économie vs mensuel',
      'Sans engagement',
      'Paiement unique, pour toujours.',
    ])
  })

  it('présélectionne l’offre annuelle, seule à porter « Meilleure offre »', async () => {
    const wrapper = await monter()
    const [annuel, mensuel, aVie] = offres(wrapper)

    expect(annuel!.classes()).toContain('plus-offer--selected')
    expect(annuel!.attributes('aria-checked')).toBe('true')
    expect(wrapper.findAll('.plus-offer__badge').map((badge) => badge.text())).toEqual([
      'Meilleure offre',
    ])
    expect(annuel!.find('.plus-offer__badge').exists()).toBe(true)
    expect(mensuel!.attributes('aria-checked')).toBe('false')
    expect(aVie!.attributes('aria-checked')).toBe('false')
  })

  it('présélectionne la première offre reçue quand l’annuel manque', async () => {
    service.listOffers.mockResolvedValue(OFFRES.filter((offre) => offre.plan !== 'annual'))
    const wrapper = await monter()

    expect(offres(wrapper).map((offre) => offre.attributes('aria-checked'))).toEqual([
      'true',
      'false',
    ])
    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus mensuel — $1.99/mois')
  })

  it('regroupe les offres sous un nom lisible par le lecteur d’écran', async () => {
    const wrapper = await monter()

    expect(wrapper.get('[role="radiogroup"]').attributes('aria-label')).toBe(
      'Trois façons de payer, même contenu',
    )
  })
})

describe('PlusView — barre d’achat', () => {
  it('pose le bouton d’achat dans la barre fixe, hors de la zone qui défile', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.pushed-screen__actions .plus__submit').exists()).toBe(true)
    expect(wrapper.find('.pushed-screen__scroll .plus__submit').exists()).toBe(false)
  })

  it('rattache la mention de l’offre au bouton pour le lecteur d’écran', async () => {
    const wrapper = await monter()
    const mention = wrapper.get('.plus__disclosure')

    expect(mention.attributes('id')).toBeTruthy()
    expect(wrapper.get('.plus__submit').attributes('aria-describedby')).toBe(
      mention.attributes('id'),
    )
  })

  it.each([
    [
      0,
      'Renouvellement automatique chaque année. Annulable à tout moment dans Google Play — accès conservé jusqu’à la fin de la période payée.',
      'Continuer avec Plus annuel — $12.99/an',
    ],
    [
      1,
      'Renouvellement automatique chaque mois. Annulable à tout moment dans Google Play — accès conservé jusqu’à la fin de la période payée.',
      'Continuer avec Plus mensuel — $1.99/mois',
    ],
    [
      2,
      'Paiement unique de $34.99. Pas d’abonnement, rien à renouveler.',
      'Continuer avec Plus à vie — $34.99',
    ],
  ])(
    'dit le renouvellement et le prix de l’offre choisie (n° %i) juste au-dessus du bouton',
    async (index, mention, bouton) => {
      const wrapper = await monter()

      await offres(wrapper)[index]!.trigger('click')

      expect(wrapper.get('.pushed-screen__actions .plus__disclosure').text()).toBe(mention)
      expect(wrapper.get('.plus__submit').text()).toBe(bouton)
    },
  )
})

describe('PlusView — offres indisponibles', () => {
  it('remplace le bouton d’achat par l’état prévu quand Google Play ne rend rien', async () => {
    service.listOffers.mockResolvedValue([])
    const wrapper = await monter('pdf')

    expect(offres(wrapper)).toHaveLength(0)
    expect(wrapper.find('.plus__submit').exists()).toBe(false)
    expect(wrapper.get('.plus__pending').text()).toBe(
      'Les offres s’affichent dès que Google Play répond.',
    )
    const barre = wrapper.get('.pushed-screen__actions')
    expect(barre.get('.plus__unavailable-title').text()).toBe('Offres indisponibles pour l’instant')
    expect(barre.get('.plus__unavailable-hint').text()).toBe('Vérifie ta connexion, puis réessaie.')
    expect(barre.get('.plus__retry-offers').text()).toBe('Réessayer')
    expect(wrapper.get('.plus__headline').text()).toBe('L’export PDF fait partie de MémoPatte Plus')
    expect(wrapper.findAll('.plus__benefit')).toHaveLength(4)
    expect(wrapper.get('.plus__android').isVisible()).toBe(true)
  })

  it('le dit aussi quand le store a répondu par une erreur, et réessaie', async () => {
    service.listOffers.mockRejectedValueOnce(new BillingError('failed'))
    const wrapper = await monter()

    expect(wrapper.get('.plus__unavailable-title').text()).toBe(
      'Offres indisponibles pour l’instant',
    )

    await wrapper.get('.plus__retry-offers').trigger('click')
    await flushPromises()

    expect(service.listOffers).toHaveBeenCalledTimes(2)
    expect(offres(wrapper)).toHaveLength(3)
    expect(wrapper.find('.plus__unavailable-title').exists()).toBe(false)
    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus annuel — $12.99/an')
  })

  it('montre la connexion à Google Play pendant le réessai, sans relancer', async () => {
    service.listOffers.mockResolvedValueOnce([])
    const wrapper = await monter()
    let repondre: (offers: PlusOffer[]) => void = () => {}
    service.listOffers.mockReturnValue(
      new Promise((resolve) => {
        repondre = resolve
      }),
    )

    await wrapper.get('.plus__retry-offers').trigger('click')

    const bouton = wrapper.get('.plus__retry-offers')
    expect(bouton.text()).toBe('Connexion à Google Play…')
    expect(bouton.attributes('aria-busy')).toBe('true')
    expect(bouton.find('.plus__retry-spinner').exists()).toBe(true)
    expect(wrapper.get('.plus__unavailable-title').text()).toBe(
      'Offres indisponibles pour l’instant',
    )

    await bouton.trigger('click')
    expect(service.listOffers).toHaveBeenCalledTimes(2)

    repondre([...OFFRES])
    await flushPromises()

    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus annuel — $12.99/an')
  })

  it('se connecte à Google Play à l’ouverture, avant d’annoncer quoi que ce soit', async () => {
    let repondre: (offers: PlusOffer[]) => void = () => {}
    service.listOffers.mockReturnValue(
      new Promise((resolve) => {
        repondre = resolve
      }),
    )
    const wrapper = await monter()

    expect(wrapper.find('.plus__unavailable-title').exists()).toBe(false)
    expect(wrapper.find('.plus__pending').exists()).toBe(true)
    expect(wrapper.get('.plus__retry-offers').text()).toBe('Connexion à Google Play…')

    await wrapper.get('.plus__retry-offers').trigger('click')
    expect(service.listOffers).toHaveBeenCalledTimes(1)

    repondre([...OFFRES])
    await flushPromises()

    expect(offres(wrapper)).toHaveLength(3)
  })

  it('reste présentable sans clé RevenueCat, sans proposer un réessai inutile', async () => {
    service.isAvailable.mockReturnValue(false)
    service.listOffers.mockResolvedValue([])
    const wrapper = await monter()

    expect(wrapper.get('.plus__unavailable-title').isVisible()).toBe(true)
    expect(wrapper.find('.plus__retry-offers').exists()).toBe(false)
    expect(wrapper.find('.plus__restore').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Connexion à Google Play…')
    expect(service.listOffers).not.toHaveBeenCalled()
  })
})

describe('PlusView — déjà abonné', () => {
  it('montre son statut au lieu de l’argumentaire, sans rien redemander', async () => {
    writeStoredPlusStatus(ANNUEL)
    const wrapper = await monter('pdf')

    expect(wrapper.get('.plus-member__status').text()).toBe('Abonnement annuel actif.')
    expect(offres(wrapper)).toHaveLength(0)
    expect(wrapper.find('.plus__headline').exists()).toBe(false)
    expect(wrapper.find('.pushed-screen__actions').exists()).toBe(false)
    expect(wrapper.get('.plus-member__manage').attributes('href')).toBe(
      'https://play.google.com/store/account/subscriptions',
    )
    expect(service.listOffers).not.toHaveBeenCalled()

    expect(wrapper.get('.plus-member__close').text()).toBe('Retour')
    await wrapper.get('.plus-member__close').trigger('click')

    expect(back).toHaveBeenCalled()
  })

  it('charge les offres dès que l’abonnement s’avère échu, sans rester figé', async () => {
    writeStoredPlusStatus(ANNUEL)
    const wrapper = await monter()
    service.fetchStatus.mockResolvedValue(NO_PLUS)

    await usePurchaseStore().verifyKnownStatus()
    await flushPromises()

    expect(service.listOffers).toHaveBeenCalledTimes(1)
    expect(offres(wrapper)).toHaveLength(3)
    expect(wrapper.get('.plus__submit').text()).toBe('Continuer avec Plus annuel — $12.99/an')
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

  it('ne lance qu’un achat sur un double tap', async () => {
    service.purchase.mockReturnValue(new Promise(() => {}))
    const wrapper = await monter()
    const bouton = wrapper.get('.plus__submit')

    void bouton.trigger('click')
    await bouton.trigger('click')

    expect(service.purchase).toHaveBeenCalledTimes(1)
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

  it('confirme l’achat abouti, sans barre d’achat', async () => {
    service.purchase.mockResolvedValue({ kind: 'purchased', status: ANNUEL })
    const wrapper = await monter()

    await wrapper.get('.plus__submit').trigger('click')
    await flushPromises()

    expect(wrapper.get('.plus-outcome__title').text()).toBe('Bienvenue dans Plus')
    // #83 : « Carnet sauvegardé. Tu es tranquille. » ne se dira qu'une fois l'envoi initial livré.
    expect(wrapper.get('.plus-outcome__body').text()).toBe(
      'La sauvegarde de ton carnet arrive très vite.',
    )
    expect(wrapper.find('.pushed-screen__actions').exists()).toBe(false)
    expect(wrapper.get('.plus-outcome__primary').text()).toBe('Retour')

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
    expect(wrapper.find('.plus__submit').exists()).toBe(true)
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

    expect(wrapper.get('.plus__restore').text()).toBe('Restaurer mes achats')

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

  it('ne lance qu’une restauration sur un double tap', async () => {
    service.restore.mockReturnValue(new Promise(() => {}))
    const wrapper = await monter()
    const bouton = wrapper.get('.plus__restore')

    void bouton.trigger('click')
    await bouton.trigger('click')

    expect(service.restore).toHaveBeenCalledTimes(1)
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
