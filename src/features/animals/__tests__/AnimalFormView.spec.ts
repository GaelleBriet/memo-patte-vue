import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import AnimalFormView from '../AnimalFormView.vue'
import { todayIsoDate } from '../animal-form'
import type { Animal, AnimalInput } from '../animal.schema'
import { useAnimalsStore } from '../animals.store'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'

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
let push: MockInstance

beforeEach(async () => {
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  load = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO_COMPLET]
    animals.hasLoaded = true
    return true
  })
  create = vi.spyOn(animals, 'create').mockResolvedValue(MILO)
  update = vi.spyOn(animals, 'update').mockResolvedValue(MILO)
  await router.push({ name: 'animal-new' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

// `router` est un singleton partagé : sans restauration, l'espion de `push`
// cumulerait les appels d'un test à l'autre.
afterEach(() => {
  vi.restoreAllMocks()
})

function monter() {
  return mount(AnimalFormView, {
    global: { plugins: [vuetify, i18n, router] },
    attachTo: document.body,
  })
}

async function monterEdition(id = MILO.id) {
  const wrapper = mount(AnimalFormView, {
    props: { id },
    global: { plugins: [vuetify, i18n, router] },
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
  return wrapper.findAll('.animal-form__species button')
}

function messages(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.animal-form__error').map((noeud) => noeud.text())
}

async function remplirMinimum(wrapper: VueWrapper) {
  await champ(wrapper, 'animal-name').setValue('Milo')
  await especes(wrapper)[0]!.trigger('click')
}

async function soumettre(wrapper: VueWrapper) {
  await wrapper.get('.animal-form__submit').trigger('click')
  await wrapper.vm.$nextTick()
}

describe('AnimalFormView — structure', () => {
  it('affiche le titre « Nouvel animal » et la flèche de retour', () => {
    const wrapper = monter()

    expect(wrapper.get('.animal-form__title').text()).toBe('Nouvel animal')
    expect(wrapper.get('.animal-form__back').html()).toContain('animal-form__back')
  })

  it('commence au champ Nom : la photo est hors du périmètre de l’écran', () => {
    const wrapper = monter()

    const premier = wrapper.get('.animal-form__fields').element.querySelector('label')
    expect(premier?.textContent).toContain('Nom')
    expect(wrapper.find('.animal-form__photo').exists()).toBe(false)
  })

  it('rend les cinq champs du schéma, et rien d’autre', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.animal-form__field')).toHaveLength(5)
    expect(wrapper.findAll('select')).toHaveLength(0)
  })

  it('marque le nom et l’espèce comme obligatoires, les trois autres comme optionnels', () => {
    const wrapper = monter()

    expect(wrapper.findAll('.animal-form__required')).toHaveLength(2)
    expect(wrapper.findAll('.animal-form__optional')).toHaveLength(3)
  })
})

describe('AnimalFormView — sélecteur d’espèce', () => {
  it('n’offre que chien et chat, dans un groupe de choix exclusifs', () => {
    const wrapper = monter()

    expect(especes(wrapper)).toHaveLength(2)
    expect(especes(wrapper).map((bouton) => bouton.text())).toEqual(['Chien', 'Chat'])
    expect(wrapper.get('.animal-form__species').attributes('role')).toBe('radiogroup')
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
    )
  })

  it('revient au Carnet une fois l’animal créé', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await wrapper.vm.$nextTick()

    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = monter()
    await remplirMinimum(wrapper)

    await wrapper.get('.animal-form__cancel').trigger('click')

    expect(create).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('AnimalFormView — édition (état F2)', () => {
  it('titre « Modifier Milo », bouton « Enregistrer », champs pré-remplis', async () => {
    const wrapper = await monterEdition()

    expect(wrapper.get('.animal-form__title').text()).toBe('Modifier Milo')
    expect(wrapper.get('.animal-form__submit').text()).toBe('Enregistrer')
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

    expect(wrapper.get('.animal-form__title').text()).toBe('Modifier Milo')
  })

  it('met à jour par le store avec l’identifiant de la route, jamais par create', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'animal-name').setValue('Milou')
    await champ(wrapper, 'animal-weight').setValue('9')

    await soumettre(wrapper)
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(MILO.id, {
      name: 'Milou',
      species: 'dog',
      breed: 'Labrador',
      birthDate: '2023-03-12',
      initialWeightKg: 9,
      photoPath: null,
    })
    expect(create).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
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

    expect(update).toHaveBeenCalledExactlyOnceWith(MILO.id, {
      name: 'Milo',
      species: 'dog',
      breed: null,
      birthDate: null,
      initialWeightKg: null,
      photoPath: null,
    })
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

    expect(wrapper.get('.animal-form__submit').text()).toBe('Enregistrement…')
    expect(wrapper.get('.animal-form__submit').attributes('disabled')).toBeDefined()

    terminer(MILO)
    await flushPromises()
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'animal-name').setValue('Milou')

    await wrapper.get('.animal-form__cancel').trigger('click')

    expect(update).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('prévient et n’autorise pas l’envoi quand l’animal est introuvable', async () => {
    const wrapper = await monterEdition('33333333-3333-4333-8333-333333333333')

    expect(wrapper.get('.animal-form__save-error').text()).toBe('Cet animal est introuvable.')
    expect(wrapper.get('.animal-form__submit').attributes('disabled')).toBeDefined()

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

    expect(wrapper.get('.animal-form__submit').text()).toBe('Création…')
    expect(wrapper.get('.animal-form__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.animal-form__cancel').attributes('disabled')).toBeDefined()

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

    expect(wrapper.get('.animal-form__save-error').text()).toBe(
      'L’animal n’a pas pu être enregistré. Réessaie.',
    )
    expect(wrapper.get('.animal-form__submit').attributes('disabled')).toBeUndefined()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('AnimalFormView — top bar au scroll (état F5)', () => {
  it('pose la bordure de la top bar dès que le contenu défile', async () => {
    const wrapper = monter()
    const zone = wrapper.get('.animal-form__scroll')

    expect(wrapper.get('.animal-form__topbar').classes()).not.toContain(
      'animal-form__topbar--scrolled',
    )

    Object.defineProperty(zone.element, 'scrollTop', { value: 12, configurable: true })
    await zone.trigger('scroll')

    expect(wrapper.get('.animal-form__topbar').classes()).toContain('animal-form__topbar--scrolled')
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
