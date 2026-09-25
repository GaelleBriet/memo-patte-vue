import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import AnimalFormView from '../views/AnimalFormView.vue'
import type { Animal, AnimalInput } from '../schema/animal.schema'
import { useAnimalsStore } from '../store/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { pickPhoto, type PickedPhoto } from '@/core/photos/photo-picker'
import { photoDisplayUrl } from '@/core/photos/photo-storage'
import { forgetPhotoUrls } from '@/core/photos/use-photo-urls'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

vi.mock('@/core/photos/photo-picker', () => ({
  pickPhoto: vi.fn<() => Promise<PickedPhoto | null>>(),
}))
vi.mock('@/core/photos/photo-storage', () => ({
  savePhoto: vi.fn<(base64: string) => Promise<string>>(),
  deletePhoto: vi.fn<(name: string) => Promise<void>>(),
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
}))

const choisirPhoto = vi.mocked(pickPhoto)

// Le vrai routeur ne sert qu'aux tests de routes (`resolve`) : naviguer avec lui chargerait
// le graphe du Carnet et SQLite à chaque test.
const Vide = { render: () => null }

function routeurMemoire(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/animals/new', name: 'animal-new', component: Vide },
    ],
  })
}

function routeurAvecPile(formulaire: { path: string; name: string }): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/animals', name: 'animals', component: Vide },
      { ...formulaire, component: Vide },
      { path: '/notifications/priming', name: 'notifications-priming', component: Vide },
    ],
  })
}

async function retourAndroid(): Promise<void> {
  const arrive = new Promise<void>((resolve) => {
    const retirer = routeur.afterEach(() => {
      retirer()
      resolve()
    })
  })
  routeur.back()
  await arrive
}

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

const MILO_COMPLET: Animal = {
  ...MILO,
  breed: 'Labrador',
  birthDate: '2023-03-12',
  initialWeightKg: 8.5,
}

let load: MockInstance
let create: MockInstance<(input: AnimalInput) => Promise<Animal>>
let update: MockInstance<(id: string, input: AnimalInput) => Promise<Animal>>
let replace: MockInstance
let routeur: Router

beforeEach(async () => {
  choisirPhoto.mockReset()
  forgetPhotoUrls()
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  load = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO_COMPLET]
    animals.hasLoaded = true
    return true
  })
  create = vi.spyOn(animals, 'create').mockResolvedValue(MILO)
  update = vi.spyOn(animals, 'update').mockResolvedValue(MILO)
  routeur = routeurMemoire()
  await routeur.push('/animals/new')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

function monter() {
  return mount(AnimalFormView, {
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
}

async function monterEdition(id = MILO.id) {
  const wrapper = mount(AnimalFormView, {
    props: { id },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function valeur(wrapper: VueWrapper, id: string): string {
  return (champ(wrapper, id).element as HTMLInputElement).value
}

function champ(wrapper: VueWrapper, id: string) {
  return wrapper.get(`#${id}`)
}

function especes(wrapper: VueWrapper) {
  return wrapper.findAll('.form-segmented button')
}

function messages(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.form-field__error').map((noeud) => noeud.text())
}

async function remplirMinimum(wrapper: VueWrapper) {
  await champ(wrapper, 'animal-name').setValue('Milo')
  await especes(wrapper)[0]!.trigger('click')
}

async function soumettre(wrapper: VueWrapper) {
  await wrapper.get('.form-screen__submit').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('AnimalFormView — structure', () => {
  it('affiche le titre « Nouvel animal » et la flèche de retour', () => {
    const wrapper = monter()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Nouvel animal')
    expect(wrapper.get('.pushed-screen__back').html()).toContain('pushed-screen__back')
  })

  it('rend les cinq champs du schéma, et rien d’autre', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.form-field')).toHaveLength(5)
    expect(wrapper.findAll('select')).toHaveLength(0)
  })

  it('marque le nom et l’espèce comme obligatoires, les trois autres comme optionnels', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.form-field__required')).toHaveLength(2)
    expect(wrapper.findAll('.form-field__optional')).toHaveLength(3)
  })
})

describe('AnimalFormView — sélecteur d’espèce', () => {
  it('n’offre que chien et chat, dans un groupe de choix exclusifs', () => {
    const wrapper = monter()

    expect(especes(wrapper)).toHaveLength(2)
    expect(especes(wrapper).map((bouton) => bouton.text())).toEqual(['Chien', 'Chat'])
    expect(wrapper.get('.form-segmented').attributes('role')).toBe('radiogroup')
  })

  it('ne préselectionne aucune espèce', () => {
    const wrapper = monter()

    for (const bouton of especes(wrapper)) {
      expect(bouton.attributes('aria-checked')).toBe('false')
    }
  })

  it('marque l’espèce choisie', async () => {
    const wrapper = monter()

    await especes(wrapper)[1]!.trigger('click')

    expect(especes(wrapper)[1]!.attributes('aria-checked')).toBe('true')
    expect(especes(wrapper)[0]!.attributes('aria-checked')).toBe('false')
  })
})

describe('AnimalFormView — champs date et poids', () => {
  it('borne le sélecteur de date à aujourd’hui', () => {
    const wrapper = monter()
    const date = champ(wrapper, 'animal-birth-date')

    expect(date.attributes('type')).toBe('date')
    expect(date.attributes('max')).toBe(todayIsoDate())
  })

  it('affiche « kg » en suffixe et ouvre un clavier décimal', () => {
    const wrapper = monter()

    expect(champ(wrapper, 'animal-weight').attributes('inputmode')).toBe('decimal')
    expect(wrapper.get('.animal-form__field--weight').text()).toContain('kg')
  })
})

describe('AnimalFormView — validation', () => {
  it('refuse un formulaire vide et n’écrit rien', async () => {
    const wrapper = monter()

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Le nom est obligatoire.', 'Choisis une espèce.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse un poids à 0 et n’écrit rien (état F3)', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-weight').setValue('0')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Le poids doit être supérieur à 0 kg.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('efface le message d’erreur dès que le formulaire redevient valide', async () => {
    const wrapper = monter()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
  })
})

describe('AnimalFormView — longueur du nom et de la race', () => {
  const limite = 'a'.repeat(MAX_NAME_LENGTH)

  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('borne la saisie du nom et de la race à 80 caractères, collage compris', () => {
    const wrapper = monter()

    expect(champ(wrapper, 'animal-name').attributes('maxlength')).toBe('80')
    expect(champ(wrapper, 'animal-breed').attributes('maxlength')).toBe('80')
  })

  it('accepte un nom et une race de 80 caractères', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-name').setValue(limite)
    await champ(wrapper, 'animal-breed').setValue(limite)

    await soumettre(wrapper)
    await flushPromises()

    expect(messages(wrapper)).toEqual([])
    expect(create).toHaveBeenCalledOnce()
    expect(create.mock.calls[0]![0]).toMatchObject({ name: limite, breed: limite })
  })

  it('refuse 81 caractères avec un message pour chaque champ, et n’écrit rien', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-name').setValue(`${limite}a`)
    await champ(wrapper, 'animal-breed').setValue(`${limite}a`)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'Le nom ne peut pas dépasser 80 caractères.',
      'La race ne peut pas dépasser 80 caractères.',
    ])
    expect(champ(wrapper, 'animal-breed').attributes('aria-invalid')).toBe('true')
    expect(create).not.toHaveBeenCalled()
  })

  it('le dit aussi en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-name').setValue(`${limite}a`)
    await champ(wrapper, 'animal-breed').setValue(`${limite}a`)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'Name can’t be longer than 80 characters.',
      'Breed can’t be longer than 80 characters.',
    ])
  })
})

describe('AnimalFormView — revalidation après envoi', () => {
  it('n’affiche aucune erreur pendant la saisie avant tout envoi', async () => {
    const wrapper = monter()

    await champ(wrapper, 'animal-weight').setValue('0')

    expect(messages(wrapper)).toEqual([])
    expect(champ(wrapper, 'animal-weight').attributes('aria-invalid')).toBe('false')
  })

  it('efface l’erreur d’un champ dès qu’il est corrigé, sans nouvel envoi', async () => {
    const wrapper = monter()
    await soumettre(wrapper)

    await especes(wrapper)[1]!.trigger('click')

    expect(messages(wrapper)).toEqual(['Le nom est obligatoire.'])
    expect(wrapper.get('.form-segmented').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('.form-segmented').attributes('aria-describedby')).toBeUndefined()
  })

  it('efface toutes les erreurs une fois le formulaire rempli, sans rien écrire', async () => {
    const wrapper = monter()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('fait apparaître l’erreur d’un champ rendu invalide après l’envoi', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-weight').setValue('0')
    await soumettre(wrapper)

    await champ(wrapper, 'animal-weight').setValue('8,5')
    expect(messages(wrapper)).toEqual([])

    await champ(wrapper, 'animal-weight').setValue('0')
    expect(messages(wrapper)).toEqual(['Le poids doit être supérieur à 0 kg.'])
    expect(champ(wrapper, 'animal-weight').attributes('aria-invalid')).toBe('true')
  })
})

describe('AnimalFormView — écriture', () => {
  it('écrit par le store, jamais par le repository', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
  })

  it('envoie null, jamais la chaîne vide, pour les champs optionnels laissés vides', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Milo',
        species: 'dog',
        breed: null,
        birthDate: null,
        initialWeightKg: null,
      }),
      { kind: 'keep' },
    )
  })

  it('envoie les champs optionnels renseignés, le poids en nombre', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-breed').setValue('Labrador')
    await champ(wrapper, 'animal-birth-date').setValue('2023-03-12')
    await champ(wrapper, 'animal-weight').setValue('8.5')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        breed: 'Labrador',
        birthDate: '2023-03-12',
        initialWeightKg: 8.5,
      }),
      { kind: 'keep' },
    )
  })

  it('revient au Carnet une fois l’animal créé', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await wrapper.vm.$nextTick()

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('sélectionne l’animal créé pour l’afficher au retour sur le Carnet', async () => {
    const animals = useAnimalsStore()
    animals.select('33333333-3333-4333-8333-333333333333')
    let selectionAuPush: string | null = null
    replace.mockImplementation(async () => {
      selectionAuPush = animals.selectedAnimalId
    })
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await flushPromises()

    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
    expect(selectionAuPush).toBe(MILO.id)
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(create).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('AnimalFormView — pile de navigation', () => {
  beforeEach(async () => {
    replace.mockRestore()
    routeur = routeurAvecPile({ path: '/animals/new', name: 'animal-new' })
    await routeur.push('/animals')
    await routeur.push('/animals/new')
  })

  it('ne rouvre pas le formulaire au retour après la création', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)
    await soumettre(wrapper)
    await flushPromises()
    expect(routeur.currentRoute.value.name).toBe('animals')

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas le formulaire au retour après une annulation', async () => {
    const wrapper = monter()
    await wrapper.get('.form-screen__cancel').trigger('click')
    await flushPromises()

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })
})

describe('AnimalFormView — édition (état F2)', () => {
  it('titre « Modifier Milo », bouton « Enregistrer », champs pré-remplis', async () => {
    const wrapper = await monterEdition()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Milo')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrer')
    expect(valeur(wrapper, 'animal-name')).toBe('Milo')
    expect(especes(wrapper)[0]!.attributes('aria-checked')).toBe('true')
    expect(especes(wrapper)[1]!.attributes('aria-checked')).toBe('false')
    expect(valeur(wrapper, 'animal-breed')).toBe('Labrador')
    expect(valeur(wrapper, 'animal-birth-date')).toBe('2023-03-12')
    expect(valeur(wrapper, 'animal-weight')).toBe('8.5')
  })

  it('charge les animaux avant de chercher celui de la route', async () => {
    await monterEdition()

    expect(load).toHaveBeenCalledOnce()
  })

  it('affiche vide un champ optionnel à null', async () => {
    load.mockImplementation(async () => {
      const animals = useAnimalsStore()
      animals.animals = [MILO]
      animals.hasLoaded = true
      return true
    })
    const wrapper = await monterEdition()

    expect(valeur(wrapper, 'animal-breed')).toBe('')
    expect(valeur(wrapper, 'animal-birth-date')).toBe('')
    expect(valeur(wrapper, 'animal-weight')).toBe('')
  })

  it('garde le titre d’origine pendant qu’on retape le nom', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'animal-name').setValue('Milou')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Milo')
  })

  it('met à jour par le store avec l’identifiant de la route, jamais par create', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'animal-name').setValue('Milou')
    await champ(wrapper, 'animal-weight').setValue('9')

    await soumettre(wrapper)
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      MILO.id,
      {
        name: 'Milou',
        species: 'dog',
        breed: 'Labrador',
        birthDate: '2023-03-12',
        initialWeightKg: 9,
        photoPath: null,
      },
      { kind: 'keep' },
    )
    expect(create).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('renvoie null, jamais la chaîne vide, pour un champ resté vide (aller-retour)', async () => {
    load.mockImplementation(async () => {
      const animals = useAnimalsStore()
      animals.animals = [MILO]
      animals.hasLoaded = true
      return true
    })
    const wrapper = await monterEdition()

    await soumettre(wrapper)
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      MILO.id,
      {
        name: 'Milo',
        species: 'dog',
        breed: null,
        birthDate: null,
        initialWeightKg: null,
        photoPath: null,
      },
      { kind: 'keep' },
    )
  })

  it('bascule sur « Enregistrement… » pendant l’écriture', async () => {
    let terminer: (animal: Animal) => void = () => {}
    update.mockReturnValueOnce(
      new Promise<Animal>((resolve) => {
        terminer = resolve
      }),
    )
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrement…')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    terminer(MILO)
    await flushPromises()
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'animal-name').setValue('Milou')

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(update).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('prévient et n’autorise pas l’envoi quand l’animal est introuvable', async () => {
    const wrapper = await monterEdition('33333333-3333-4333-8333-333333333333')

    expect(wrapper.get('.form-screen__save-error').text()).toBe('Cet animal est introuvable.')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('AnimalFormView — envoi en cours (état F4)', () => {
  it('désactive les deux boutons et bascule le libellé pendant l’écriture', async () => {
    let terminer: (animal: Animal) => void = () => {}
    create.mockReturnValueOnce(
      new Promise<Animal>((resolve) => {
        terminer = resolve
      }),
    )
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').text()).toBe('Création…')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeDefined()

    terminer(MILO)
    await wrapper.vm.$nextTick()
  })

  it('n’écrit qu’une fois même si on tape deux fois sur « Créer »', async () => {
    create.mockReturnValueOnce(new Promise<Animal>(() => {}))
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
  })

  it('rend la main et prévient quand l’écriture échoue', async () => {
    create.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await wrapper.vm.$nextTick()

    expect(wrapper.get('.form-screen__save-error').text()).toBe(
      'L’animal n’a pas pu être enregistré. Réessaie.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('AnimalFormView — top bar au scroll (état F5)', () => {
  it('pose la bordure de la top bar dès que le contenu défile', async () => {
    const wrapper = monter()
    const zone = wrapper.get('.pushed-screen__scroll')

    expect(wrapper.get('.pushed-screen__topbar').classes()).not.toContain(
      'pushed-screen__topbar--scrolled',
    )

    Object.defineProperty(zone.element, 'scrollTop', { value: 12, configurable: true })
    await zone.trigger('scroll')

    expect(wrapper.get('.pushed-screen__topbar').classes()).toContain(
      'pushed-screen__topbar--scrolled',
    )
  })
})

describe('AnimalFormView — routes', () => {
  it('garde la création sur /animals/new, sans prop', () => {
    const route = router.resolve('/animals/new')

    expect(route.name).toBe('animal-new')
    expect(route.params).toEqual({})
  })

  it('ouvre l’édition depuis l’identifiant de l’animal, passé en prop', () => {
    const route = router.resolve(`/animals/${MILO.id}/edit`)

    expect(route.name).toBe('animal-edit')
    expect(route.params).toEqual({ id: MILO.id })
    expect(route.matched[0]?.props.default).toBe(true)
  })
})

function expectLie(wrapper: VueWrapper, controle: string, champ: string) {
  const idErreur = wrapper.get(`${champ} .form-field__error`).attributes('id')

  expect(idErreur).toBeTruthy()
  expect(wrapper.get(controle).attributes('aria-describedby')).toBe(idErreur)
  expect(wrapper.get(controle).attributes('aria-invalid')).toBe('true')
}

describe('AnimalFormView — accessibilité des erreurs', () => {
  it('relie chaque contrôle en erreur à son message et le marque invalide', async () => {
    const wrapper = monter()

    await soumettre(wrapper)

    expectLie(wrapper, '#animal-name', '.animal-form__field--name')
    expectLie(wrapper, '.form-segmented', '.animal-form__field--species')
    expect(wrapper.get('#animal-weight').attributes('aria-invalid')).toBe('false')
    expect(wrapper.get('#animal-weight').attributes('aria-describedby')).toBeUndefined()
  })
})

describe('AnimalFormView — changement de jour', () => {
  it('accepte la date du nouveau jour après un retour au premier plan', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    const wrapper = monter()

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()
    expect(champ(wrapper, 'animal-birth-date').attributes('max')).toBe('2026-09-10')

    await remplirMinimum(wrapper)
    await champ(wrapper, 'animal-birth-date').setValue('2026-09-10')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ birthDate: '2026-09-10' }), {
      kind: 'keep',
    })
  })
})

describe('AnimalFormView — photo (§2)', () => {
  const MILO_EN_PHOTO: Animal = { ...MILO_COMPLET, photoPath: 'milo.jpg' }

  function photo(wrapper: VueWrapper) {
    return wrapper.get('.animal-photo')
  }

  async function avecMiloEnPhoto() {
    load.mockImplementation(async () => {
      const animals = useAnimalsStore()
      animals.animals = [MILO_EN_PHOTO]
      animals.hasLoaded = true
      return true
    })
    const wrapper = await monterEdition()
    await flushPromises()
    return wrapper
  }

  it('s’affiche avant le nom, vide, avec la légende « Ajouter une photo »', () => {
    const wrapper = monter()

    const premier = wrapper.get('.form-screen__fields').element.firstElementChild
    expect(premier?.classList.contains('animal-photo')).toBe(true)
    expect(photo(wrapper).find('img').exists()).toBe(false)
    expect(photo(wrapper).get('.animal-photo__caption').text()).toBe('Ajouter une photo')
    expect(wrapper.find('.animal-photo__remove').exists()).toBe(false)
  })

  it('montre la photo choisie et l’envoie à la création', async () => {
    choisirPhoto.mockResolvedValue({
      base64: 'TUlMTw==',
      previewUrl: 'data:image/jpeg;base64,TUlMTw==',
    })
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await wrapper.get('.animal-photo__pick').trigger('click')
    await flushPromises()

    expect(photo(wrapper).get('img').attributes('src')).toBe('data:image/jpeg;base64,TUlMTw==')
    expect(photo(wrapper).get('.animal-photo__caption').text()).toBe('Changer la photo')

    await soumettre(wrapper)
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ name: 'Milo' }), {
      kind: 'replace',
      base64: 'TUlMTw==',
    })
  })

  it('ne change rien quand le sélecteur est fermé sans choix', async () => {
    choisirPhoto.mockResolvedValue(null)
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await wrapper.get('.animal-photo__pick').trigger('click')
    await flushPromises()
    await soumettre(wrapper)

    expect(photo(wrapper).find('img').exists()).toBe(false)
    expect(create).toHaveBeenCalledWith(expect.anything(), { kind: 'keep' })
  })

  it('signale une photo illisible sans toucher au reste du formulaire', async () => {
    choisirPhoto.mockRejectedValue(new Error('Not implemented'))
    const wrapper = monter()

    await wrapper.get('.animal-photo__pick').trigger('click')
    await flushPromises()

    expect(photo(wrapper).get('[role="alert"]').text()).toBe(
      'La photo n’a pas pu être chargée. Réessaie.',
    )
    expect(photo(wrapper).find('img').exists()).toBe(false)
  })

  it('en édition, affiche la photo enregistrée et la garde si on n’y touche pas', async () => {
    const wrapper = await avecMiloEnPhoto()

    expect(photo(wrapper).get('img').attributes('src')).toBe('url:milo.jpg')
    expect(photo(wrapper).get('.animal-photo__caption').text()).toBe('Changer la photo')

    await soumettre(wrapper)
    await flushPromises()

    expect(update).toHaveBeenCalledWith(MILO.id, expect.anything(), { kind: 'keep' })
  })

  it('en édition, « Retirer la photo » revient au cercle vide et retire la photo', async () => {
    const wrapper = await avecMiloEnPhoto()

    await wrapper.get('.animal-photo__remove').trigger('click')

    expect(photo(wrapper).find('img').exists()).toBe(false)
    expect(wrapper.find('.animal-photo__remove').exists()).toBe(false)

    await soumettre(wrapper)
    await flushPromises()

    expect(update).toHaveBeenCalledWith(MILO.id, expect.anything(), { kind: 'remove' })
  })

  it('pendant le choix, désactive la photo et Enregistrer : ni second sélecteur, ni envoi sans photo', async () => {
    let terminer: (photo: PickedPhoto | null) => void = () => {}
    choisirPhoto.mockReturnValue(new Promise((resolve) => (terminer = resolve)))
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await wrapper.get('.animal-photo__pick').trigger('click')
    await wrapper.get('.animal-photo__pick').trigger('click')
    await soumettre(wrapper)

    expect(choisirPhoto).toHaveBeenCalledOnce()
    expect(wrapper.get('.animal-photo__pick').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(create).not.toHaveBeenCalled()

    terminer({ base64: 'TUlMTw==', previewUrl: 'data:image/jpeg;base64,TUlMTw==' })
    await flushPromises()

    expect(wrapper.get('.animal-photo__pick').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
  })

  it('réactive la photo et Enregistrer après un choix en échec', async () => {
    choisirPhoto.mockRejectedValue(new Error('Not implemented'))
    const wrapper = monter()

    await wrapper.get('.animal-photo__pick').trigger('click')
    await flushPromises()

    expect(wrapper.get('.animal-photo__pick').attributes('disabled')).toBeUndefined()
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
  })

  it('en édition, une photo absente du disque (restauration) laisse le cercle vide', async () => {
    vi.mocked(photoDisplayUrl).mockRejectedValueOnce(new Error('File does not exist'))
    const wrapper = await avecMiloEnPhoto()

    expect(photo(wrapper).find('img').exists()).toBe(false)
    expect(photo(wrapper).get('.animal-photo__caption').text()).toBe('Ajouter une photo')
  })
})
