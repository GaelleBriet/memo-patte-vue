import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import VaccinationFormView from '../VaccinationFormView.vue'
import type { Vaccination, VaccinationInput, VaccinationUpdateInput } from '../vaccination.schema'
import { useVaccinationsStore } from '../vaccinations.store'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import { todayIsoDate } from '@/shared/form/form-dates'

// Le vrai routeur ne sert qu'aux tests de routes (`resolve`) : naviguer avec lui chargerait
// le graphe du Carnet et SQLite à chaque test.
const Vide = { render: () => null }

function routeurMemoire(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/animals', name: 'animals', component: Vide }],
  })
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

const RAGE: Vaccination = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: MILO.id,
  name: 'Rage',
  lastInjectionDate: '2026-03-12',
  dueDate: '2027-03-12',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let loadAnimals: MockInstance
let create: MockInstance<(input: VaccinationInput) => Promise<Vaccination>>
let update: MockInstance<(id: string, input: VaccinationUpdateInput) => Promise<Vaccination>>
let getById: MockInstance<(id: string) => Promise<Vaccination | null>>
let push: MockInstance
let routeur: Router

beforeEach(async () => {
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  loadAnimals = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO]
    animals.hasLoaded = true
    return true
  })
  const vaccinations = useVaccinationsStore()
  create = vi.spyOn(vaccinations, 'create').mockResolvedValue(RAGE)
  update = vi.spyOn(vaccinations, 'update').mockResolvedValue(RAGE)
  getById = vi.spyOn(vaccinations, 'getById').mockResolvedValue(RAGE)
  routeur = routeurMemoire()
  await routeur.push('/animals')
  push = vi.spyOn(routeur, 'push').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monterCreation(animalId = MILO.id) {
  const wrapper = mount(VaccinationFormView, {
    props: { animalId },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

async function monterEdition(id = RAGE.id) {
  const wrapper = mount(VaccinationFormView, {
    props: { id },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function champ(wrapper: VueWrapper, id: string) {
  return wrapper.get(`#${id}`)
}

function messages(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.form-field__error').map((noeud) => noeud.text())
}

async function remplirMinimum(wrapper: VueWrapper) {
  await champ(wrapper, 'vaccination-name').setValue('Rage')
  await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')
}

async function soumettre(wrapper: VueWrapper) {
  await wrapper.get('.form-screen__submit').trigger('click')
  await flushPromises()
}

describe('VaccinationFormView — structure', () => {
  it('affiche « Nouveau vaccin », la flèche de retour et l’animal en sous-titre', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Nouveau vaccin')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect(wrapper.find('.pushed-screen__back').exists()).toBe(true)
  })

  it('charge les animaux pour nommer celui de la route', async () => {
    await monterCreation()

    expect(loadAnimals).toHaveBeenCalledOnce()
  })

  it('rend les trois champs du schéma, et rien d’autre', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.findAll('.form-field')).toHaveLength(3)
    expect(wrapper.findAll('select')).toHaveLength(0)
  })

  it('n’offre aucun sélecteur d’animal : l’animal est un fait, pas un choix', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.find('.animal-chip-selector').exists()).toBe(false)
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)
    expect(wrapper.findAll('input').map((input) => input.attributes('id'))).toEqual([
      'vaccination-name',
      'vaccination-last-injection-date',
      'vaccination-due-date',
    ])
  })

  it('marque le nom et la date d’injection obligatoires, l’échéance optionnelle', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.findAll('.form-field__required')).toHaveLength(2)
    expect(wrapper.findAll('.form-field__optional')).toHaveLength(1)
  })

  it('borne la date d’injection à aujourd’hui, jamais l’échéance', async () => {
    const wrapper = await monterCreation()
    const injection = champ(wrapper, 'vaccination-last-injection-date')
    const echeance = champ(wrapper, 'vaccination-due-date')

    expect(injection.attributes('type')).toBe('date')
    expect(injection.attributes('max')).toBe(todayIsoDate())
    expect(echeance.attributes('type')).toBe('date')
    expect(echeance.attributes('max')).toBeUndefined()
    expect(echeance.attributes('min')).toBeUndefined()
  })
})

describe('VaccinationFormView — validation', () => {
  it('refuse un formulaire vide et n’écrit rien', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'Le nom du vaccin est obligatoire.',
      'La date d’injection est obligatoire.',
    ])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse une date d’injection dans le futur', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'vaccination-name').setValue('Rage')
    await champ(wrapper, 'vaccination-last-injection-date').setValue('2999-01-01')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La date d’injection ne peut pas être dans le futur.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('efface les messages dès que le formulaire redevient valide', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
  })
})

describe('VaccinationFormView — revalidation après envoi', () => {
  it('n’affiche aucune erreur pendant la saisie avant tout envoi', async () => {
    const wrapper = await monterCreation()

    await champ(wrapper, 'vaccination-last-injection-date').setValue('2999-01-01')

    expect(messages(wrapper)).toEqual([])
    expect(champ(wrapper, 'vaccination-last-injection-date').attributes('aria-invalid')).toBe(
      'false',
    )
  })

  it('efface l’erreur d’un champ dès qu’il est corrigé, sans nouvel envoi', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await champ(wrapper, 'vaccination-name').setValue('Rage')

    expect(messages(wrapper)).toEqual(['La date d’injection est obligatoire.'])
    expect(champ(wrapper, 'vaccination-name').attributes('aria-invalid')).toBe('false')
    expect(champ(wrapper, 'vaccination-name').attributes('aria-describedby')).toBeUndefined()
  })

  it('efface toutes les erreurs une fois le formulaire rempli, sans rien écrire', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('change le message quand le motif de l’erreur change', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await champ(wrapper, 'vaccination-last-injection-date').setValue('2999-01-01')

    expect(messages(wrapper)).toContain('La date d’injection ne peut pas être dans le futur.')
    expect(messages(wrapper)).not.toContain('La date d’injection est obligatoire.')
  })
})

describe('VaccinationFormView — création', () => {
  it('écrit par le store avec l’animal de la route', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'Rage',
      lastInjectionDate: '2026-03-12',
      dueDate: null,
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('envoie l’échéance renseignée', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'vaccination-due-date').setValue('2027-03-12')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2027-03-12' }))
  })

  it('revient au Carnet une fois le vaccin créé', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(create).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('VaccinationFormView — édition', () => {
  it('titre « Modifier Rage », animal en sous-titre, champs pré-remplis', async () => {
    const wrapper = await monterEdition()

    expect(getById).toHaveBeenCalledWith(RAGE.id)
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Rage')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect((champ(wrapper, 'vaccination-name').element as HTMLInputElement).value).toBe('Rage')
    expect(
      (champ(wrapper, 'vaccination-last-injection-date').element as HTMLInputElement).value,
    ).toBe('2026-03-12')
    expect((champ(wrapper, 'vaccination-due-date').element as HTMLInputElement).value).toBe(
      '2027-03-12',
    )
    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrer')
  })

  it('garde le titre d’origine pendant qu’on retape le nom', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'vaccination-name').setValue('Rage (rappel)')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Rage')
  })

  it('met à jour par le store avec l’identifiant de la route, sans animal', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'vaccination-due-date').setValue('')

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(RAGE.id, {
      name: 'Rage',
      lastInjectionDate: '2026-03-12',
      dueDate: null,
    })
    expect(create).not.toHaveBeenCalled()
    expect(push).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('prévient et n’autorise pas l’envoi quand le vaccin est introuvable', async () => {
    getById.mockResolvedValueOnce(null)
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__save-error').text()).toBe('Ce vaccin est introuvable.')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })
})

describe('VaccinationFormView — envoi en cours', () => {
  it('désactive les deux boutons et bascule le libellé pendant l’écriture', async () => {
    let terminer: (vaccination: Vaccination) => void = () => {}
    create.mockReturnValueOnce(
      new Promise<Vaccination>((resolve) => {
        terminer = resolve
      }),
    )
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').text()).toBe('Création…')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeDefined()

    terminer(RAGE)
    await flushPromises()
  })

  it('n’écrit qu’une fois même si on tape deux fois sur « Créer »', async () => {
    create.mockReturnValueOnce(new Promise<Vaccination>(() => {}))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    // Deux taps dans le même tick : le bouton n'est pas encore rendu désactivé.
    void wrapper.get('.form-screen__submit').trigger('click')
    void wrapper.get('.form-screen__submit').trigger('click')
    await flushPromises()

    expect(create).toHaveBeenCalledOnce()
  })

  it('rend la main et prévient quand l’écriture échoue', async () => {
    create.mockRejectedValueOnce(new Error('base fermée'))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__save-error').text()).toBe(
      'Le vaccin n’a pas pu être enregistré. Réessaie.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
    expect(push).not.toHaveBeenCalled()
  })
})

describe('VaccinationFormView — top bar au scroll', () => {
  it('pose la bordure de la top bar dès que le contenu défile', async () => {
    const wrapper = await monterCreation()
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

describe('VaccinationFormView — routes', () => {
  it('ouvre la création depuis l’animal de l’URL, en lui passant l’identifiant en prop', () => {
    const route = router.resolve(`/animals/${MILO.id}/vaccinations/new`)

    expect(route.name).toBe('vaccination-new')
    expect(route.params).toEqual({ animalId: MILO.id })
    expect(route.matched[0]?.props.default).toBe(true)
  })

  it('ouvre l’édition depuis l’identifiant du vaccin, sans animal dans l’URL', () => {
    const route = router.resolve(`/vaccinations/${RAGE.id}/edit`)

    expect(route.name).toBe('vaccination-edit')
    expect(route.params).toEqual({ id: RAGE.id })
    expect(route.matched[0]?.props.default).toBe(true)
  })
})

function expectLie(wrapper: VueWrapper, controle: string, champ: string) {
  const idErreur = wrapper.get(`${champ} .form-field__error`).attributes('id')

  expect(idErreur).toBeTruthy()
  expect(wrapper.get(controle).attributes('aria-describedby')).toBe(idErreur)
  expect(wrapper.get(controle).attributes('aria-invalid')).toBe('true')
}

describe('VaccinationFormView — accessibilité des erreurs', () => {
  it('relie chaque contrôle en erreur à son message et le marque invalide', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    expectLie(wrapper, '#vaccination-name', '.vaccination-form__field--name')
    expectLie(
      wrapper,
      '#vaccination-last-injection-date',
      '.vaccination-form__field--last-injection-date',
    )
    expect(wrapper.get('#vaccination-due-date').attributes('aria-invalid')).toBe('false')
  })
})

describe('VaccinationFormView — changement de jour', () => {
  it('accepte la date du nouveau jour après un retour au premier plan', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    const wrapper = await monterCreation()

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()
    const injection = champ(wrapper, 'vaccination-last-injection-date')
    expect(injection.attributes('max')).toBe('2026-09-10')

    await champ(wrapper, 'vaccination-name').setValue('Rage')
    await injection.setValue('2026-09-10')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ lastInjectionDate: '2026-09-10' }),
    )
  })
})
