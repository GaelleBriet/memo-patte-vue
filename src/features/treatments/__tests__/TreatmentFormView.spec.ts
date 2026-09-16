import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import TreatmentFormView from '../TreatmentFormView.vue'
import type { Treatment, TreatmentInput, TreatmentUpdateInput } from '../treatment.schema'
import { useTreatmentsStore } from '../treatments.store'
import type { Animal } from '@/features/animals/animal.schema'
import { useAnimalsStore } from '@/features/animals/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { shouldShowPriming } from '@/core/notifications/permission'

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
}))

// Le vrai routeur ne sert qu'aux tests de routes (`resolve`) : naviguer avec lui chargerait
// le graphe du Carnet et SQLite à chaque test.
const Vide = { render: () => null }

function routeurMemoire(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/animals', name: 'animals', component: Vide }],
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

const BRAVECTO: Treatment = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: MILO.id,
  name: 'Bravecto',
  type: 'antiparasitic',
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-06-24',
  nextDueDate: '2026-09-24',
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let loadAnimals: MockInstance
let create: MockInstance<(input: TreatmentInput) => Promise<Treatment>>
let update: MockInstance<(id: string, input: TreatmentUpdateInput) => Promise<Treatment>>
let getById: MockInstance<(id: string) => Promise<Treatment | null>>
let replace: MockInstance
let routeur: Router

beforeEach(async () => {
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  loadAnimals = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO]
    animals.hasLoaded = true
    return true
  })
  const treatments = useTreatmentsStore()
  create = vi.spyOn(treatments, 'create').mockResolvedValue(BRAVECTO)
  update = vi.spyOn(treatments, 'update').mockResolvedValue(BRAVECTO)
  getById = vi.spyOn(treatments, 'getById').mockResolvedValue(BRAVECTO)
  routeur = routeurMemoire()
  await routeur.push('/animals')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function monterCreation(animalId = MILO.id) {
  const wrapper = mount(TreatmentFormView, {
    props: { animalId },
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

async function monterEdition(id = BRAVECTO.id) {
  const wrapper = mount(TreatmentFormView, {
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

function valeur(wrapper: VueWrapper, id: string): string {
  return (champ(wrapper, id).element as HTMLInputElement).value
}

function types(wrapper: VueWrapper) {
  return wrapper.findAll('.treatment-form__field--type .form-segmented button')
}

const UNITES = ['day', 'week', 'month'] as const

function unites(wrapper: VueWrapper) {
  return wrapper.findAll('.treatment-form__unit button')
}

function uniteCochee(wrapper: VueWrapper): string | undefined {
  const index = unites(wrapper).findIndex((bouton) => bouton.attributes('aria-checked') === 'true')
  return UNITES[index]
}

async function choisirUnite(wrapper: VueWrapper, unit: (typeof UNITES)[number]) {
  await unites(wrapper)[UNITES.indexOf(unit)]!.trigger('click')
}

function messages(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.form-field__error').map((noeud) => noeud.text())
}

async function remplirMinimum(wrapper: VueWrapper) {
  await champ(wrapper, 'treatment-name').setValue('Bravecto')
  await types(wrapper)[1]!.trigger('click')
  await champ(wrapper, 'treatment-frequency-value').setValue('3')
  await champ(wrapper, 'treatment-last-dose-date').setValue('2026-06-24')
}

async function soumettre(wrapper: VueWrapper) {
  await wrapper.get('.form-screen__submit').trigger('click')
  await flushPromises()
}

describe('TreatmentFormView — structure', () => {
  it('affiche « Nouveau traitement », la flèche de retour et l’animal en sous-titre', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Nouveau traitement')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect(wrapper.find('.pushed-screen__back').exists()).toBe(true)
    expect(loadAnimals).toHaveBeenCalledOnce()
  })

  it('rend les quatre champs du schéma, tous obligatoires', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.findAll('.form-field')).toHaveLength(4)
    expect(wrapper.findAll('.form-field__required')).toHaveLength(4)
    expect(wrapper.findAll('.form-field__optional')).toHaveLength(0)
  })

  it('n’offre aucun sélecteur d’animal : l’animal est un fait, pas un choix', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.find('.animal-chip-selector').exists()).toBe(false)
    expect(wrapper.findAll('[role="radiogroup"]')).toHaveLength(2)
  })

  it('propose vermifuge et antiparasitaire en choix exclusifs, aucun présélectionné', async () => {
    const wrapper = await monterCreation()

    expect(types(wrapper).map((bouton) => bouton.text())).toEqual(['Vermifuge', 'Antiparasitaire'])
    expect(types(wrapper).map((bouton) => bouton.attributes('aria-checked'))).toEqual([
      'false',
      'false',
    ])
  })

  it('saisit la fréquence en « Tous les » + entier + unité, l’unité au mois par défaut', async () => {
    const wrapper = await monterCreation()
    const nombre = champ(wrapper, 'treatment-frequency-value')

    expect(wrapper.get('.treatment-form__frequency').text()).toContain('Tous les')
    expect(nombre.attributes('inputmode')).toBe('numeric')
    expect(nombre.attributes('min')).toBe('1')
    expect(nombre.attributes('max')).toBe('365')
    expect(uniteCochee(wrapper)).toBe('month')
  })

  it('choisit l’unité parmi trois boutons sur leur propre ligne, jamais dans un select', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.findComponent({ name: 'VSelect' }).exists()).toBe(false)
    expect(wrapper.findAll('select')).toHaveLength(0)
    expect(unites(wrapper)).toHaveLength(3)
    expect(wrapper.get('.treatment-form__unit').attributes('role')).toBe('radiogroup')
    expect(wrapper.find('.treatment-form__frequency-row .treatment-form__unit').exists()).toBe(
      false,
    )
    expect(wrapper.find('.treatment-form__frequency-row #treatment-frequency-value').exists()).toBe(
      true,
    )
  })

  it('garde l’unité cochée quand on la retape : une fréquence a toujours une unité', async () => {
    const wrapper = await monterCreation()

    await choisirUnite(wrapper, 'month')

    expect(uniteCochee(wrapper)).toBe('month')
  })

  it('accorde le mot de liaison à l’unité : « Toutes les 2 semaines »', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('2')

    expect(wrapper.get('#treatment-frequency-every').text()).toBe('Tous les')

    await choisirUnite(wrapper, 'week')

    expect(wrapper.get('#treatment-frequency-every').text()).toBe('Toutes les')

    await choisirUnite(wrapper, 'day')

    expect(wrapper.get('#treatment-frequency-every').text()).toBe('Tous les')
  })

  it('accorde les libellés d’unité au nombre saisi', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('2')

    expect(unites(wrapper).map((bouton) => bouton.text())).toEqual(['jours', 'semaines', 'mois'])

    await champ(wrapper, 'treatment-frequency-value').setValue('1')

    expect(unites(wrapper).map((bouton) => bouton.text())).toEqual(['jour', 'semaine', 'mois'])
  })

  it('borne la date de la dernière prise à aujourd’hui', async () => {
    const wrapper = await monterCreation()
    const date = champ(wrapper, 'treatment-last-dose-date')

    expect(date.attributes('type')).toBe('date')
    expect(date.attributes('max')).toBe(todayIsoDate())
  })
})

describe('TreatmentFormView — aperçu de la prochaine dose', () => {
  it('ne montre rien tant que fréquence et date ne sont pas valides', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('3')

    expect(wrapper.find('.treatment-form__next-dose').exists()).toBe(false)
  })

  it('calcule la prochaine dose en direct dès que fréquence et date sont valides', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    await champ(wrapper, 'treatment-last-dose-date').setValue('2026-06-24')

    expect(wrapper.get('.treatment-form__next-dose').text()).toBe('Prochaine dose le 24 sept. 2026')

    await choisirUnite(wrapper, 'week')

    expect(wrapper.get('.treatment-form__next-dose').text()).toBe('Prochaine dose le 15 juil. 2026')
  })
})

describe('TreatmentFormView — validation', () => {
  it('refuse un formulaire vide et n’écrit rien', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'Le nom est obligatoire.',
      'Choisis un type.',
      'Indique une fréquence.',
      'La date est obligatoire.',
    ])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse une date dans le futur', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-last-dose-date').setValue('2999-01-01')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La date ne peut pas être dans le futur.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('dit le plafond en rouvrant une ligne dont la fréquence le dépasse', async () => {
    getById.mockResolvedValue({ ...BRAVECTO, frequency: { value: 10_000_000, unit: 'month' } })
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La fréquence doit être de 365 maximum.'])
    expect(update).not.toHaveBeenCalled()
  })

  it('efface les messages dès que le formulaire redevient valide', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
  })
})

describe('TreatmentFormView — revalidation après envoi', () => {
  it('n’affiche aucune erreur pendant la saisie avant tout envoi', async () => {
    const wrapper = await monterCreation()

    await champ(wrapper, 'treatment-name').setValue('B')
    await champ(wrapper, 'treatment-last-dose-date').setValue('2999-01-01')

    expect(messages(wrapper)).toEqual([])
    expect(champ(wrapper, 'treatment-last-dose-date').attributes('aria-invalid')).toBe('false')
  })

  it('efface l’erreur d’un champ dès qu’il est corrigé, sans nouvel envoi', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await champ(wrapper, 'treatment-name').setValue('Bravecto')

    expect(messages(wrapper)).toEqual([
      'Choisis un type.',
      'Indique une fréquence.',
      'La date est obligatoire.',
    ])
    expect(champ(wrapper, 'treatment-name').attributes('aria-invalid')).toBe('false')
    expect(champ(wrapper, 'treatment-name').attributes('aria-describedby')).toBeUndefined()
  })

  it('efface toutes les erreurs une fois les quatre champs remplis, sans rien écrire', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await remplirMinimum(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('change le message quand le motif de l’erreur change', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await champ(wrapper, 'treatment-last-dose-date').setValue('2999-01-01')

    expect(messages(wrapper)).toContain('La date ne peut pas être dans le futur.')
    expect(messages(wrapper)).not.toContain('La date est obligatoire.')
  })
})

describe('TreatmentFormView — création', () => {
  it('écrit par le store avec l’animal de la route et la fréquence en couple', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'Bravecto',
      type: 'antiparasitic',
      frequency: { value: 3, unit: 'month' },
      lastDoseDate: '2026-06-24',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('envoie l’unité choisie dans le sélecteur', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisirUnite(wrapper, 'day')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ frequency: { value: 3, unit: 'day' } }),
    )
  })

  it('revient au Carnet une fois le traitement créé', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('revient au Carnet sans rien écrire quand on annule', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(create).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })
})

describe('TreatmentFormView — écran d’explication des notifications', () => {
  it('y passe après un traitement quand la permission n’a jamais été demandée', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'treatment' },
    })
  })

  it('n’envoie pas de prénom quand l’animal de la route est introuvable', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation('99999999-9999-4999-8999-999999999999')
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({
      name: 'notifications-priming',
      query: { kind: 'treatment' },
    })
  })

  it('revient au Carnet quand l’écran a déjà eu sa réponse', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
  })

  it('n’y passe pas quand l’enregistrement échoue', async () => {
    vi.mocked(shouldShowPriming).mockClear()
    create.mockRejectedValueOnce(new Error('disque plein'))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(shouldShowPriming).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('TreatmentFormView — retour sur l’animal du formulaire', () => {
  const AUTRE_ANIMAL = '33333333-3333-4333-8333-333333333333'

  function selectionAuPush(): () => string | null {
    const animals = useAnimalsStore()
    let selection: string | null = null
    replace.mockImplementation(async () => {
      selection = animals.selectedAnimalId
    })
    return () => selection
  }

  it('sélectionne l’animal du traitement créé avant de revenir au Carnet', async () => {
    useAnimalsStore().select(AUTRE_ANIMAL)
    const selection = selectionAuPush()
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
    expect(selection()).toBe(MILO.id)
  })

  it('sélectionne l’animal du traitement modifié, pris dans le traitement et non dans la route', async () => {
    useAnimalsStore().select(AUTRE_ANIMAL)
    const selection = selectionAuPush()
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(selection()).toBe(MILO.id)
  })

  it('sélectionne l’animal avant de passer par l’écran d’explication des notifications', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    useAnimalsStore().select(AUTRE_ANIMAL)
    const selection = selectionAuPush()
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ name: 'notifications-priming' }),
    )
    expect(selection()).toBe(MILO.id)
  })

  it('sélectionne l’animal du formulaire quand on annule', async () => {
    useAnimalsStore().select(AUTRE_ANIMAL)
    const selection = selectionAuPush()
    const wrapper = await monterCreation()

    await wrapper.get('.form-screen__cancel').trigger('click')

    expect(selection()).toBe(MILO.id)
  })

  it('garde la sélection quand l’enregistrement échoue', async () => {
    create.mockRejectedValueOnce(new Error('disque plein'))
    useAnimalsStore().select(AUTRE_ANIMAL)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(useAnimalsStore().selectedAnimalId).toBe(AUTRE_ANIMAL)
  })
})

describe('TreatmentFormView — pile de navigation', () => {
  beforeEach(async () => {
    replace.mockRestore()
    routeur = routeurAvecPile({ path: '/animals/:animalId/treatments/new', name: 'treatment-new' })
    await routeur.push('/animals')
    await routeur.push(`/animals/${MILO.id}/treatments/new`)
  })

  it('ne rouvre pas le formulaire au retour après l’enregistrement', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await soumettre(wrapper)
    expect(routeur.currentRoute.value.name).toBe('animals')

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas le formulaire au retour après l’écran d’explication des notifications', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await soumettre(wrapper)
    expect(routeur.currentRoute.value.name).toBe('notifications-priming')
    await routeur.replace({ name: 'animals' })

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas le formulaire au retour après une annulation', async () => {
    const wrapper = await monterCreation()
    await wrapper.get('.form-screen__cancel').trigger('click')
    await flushPromises()

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })
})

describe('TreatmentFormView — édition', () => {
  it('titre « Modifier Bravecto », animal en sous-titre, champs pré-remplis', async () => {
    const wrapper = await monterEdition()

    expect(getById).toHaveBeenCalledWith(BRAVECTO.id)
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Bravecto')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect(valeur(wrapper, 'treatment-name')).toBe('Bravecto')
    expect(types(wrapper)[1]!.attributes('aria-checked')).toBe('true')
    expect(valeur(wrapper, 'treatment-frequency-value')).toBe('3')
    expect(uniteCochee(wrapper)).toBe('month')
    expect(valeur(wrapper, 'treatment-last-dose-date')).toBe('2026-06-24')
    expect(wrapper.get('.treatment-form__next-dose').text()).toBe('Prochaine dose le 24 sept. 2026')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrer')
  })

  it('garde le titre d’origine pendant qu’on retape le nom', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'treatment-name').setValue('Bravecto Plus')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Bravecto')
  })

  it('met à jour par le store avec l’identifiant de la route, sans animal', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('2')

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(BRAVECTO.id, {
      name: 'Bravecto',
      type: 'antiparasitic',
      frequency: { value: 2, unit: 'month' },
      lastDoseDate: '2026-06-24',
    })
    expect(create).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('prévient et n’autorise pas l’envoi quand le traitement est introuvable', async () => {
    getById.mockResolvedValueOnce(null)
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__save-error').text()).toBe('Ce traitement est introuvable.')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
  })

  it('prévient et n’écrase rien quand la fiche n’a pas pu être lue', async () => {
    getById.mockRejectedValueOnce(new Error('base verrouillée'))
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__save-error').text()).toBe(
      'Ce traitement n’a pas pu être chargé. Réessaie.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
  })

  it('n’enregistre pas tant que la fiche n’est pas chargée', async () => {
    getById.mockReturnValueOnce(new Promise<Treatment>(() => {}))
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
  })
})

describe('TreatmentFormView — envoi en cours', () => {
  it('désactive les deux boutons et bascule sur « Création… » pendant l’écriture', async () => {
    let terminer: (treatment: Treatment) => void = () => {}
    create.mockReturnValueOnce(
      new Promise<Treatment>((resolve) => {
        terminer = resolve
      }),
    )
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').text()).toBe('Création…')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeDefined()

    terminer(BRAVECTO)
    await flushPromises()
  })

  it('montre un exemple de fréquence dans le champ nombre vide', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.get('#treatment-frequency-value').attributes('placeholder')).toBe('1')
  })

  it('bascule sur « Enregistrement… » en édition', async () => {
    update.mockReturnValueOnce(new Promise<Treatment>(() => {}))
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrement…')
  })

  it('n’écrit qu’une fois même si on tape deux fois sur « Créer »', async () => {
    create.mockReturnValueOnce(new Promise<Treatment>(() => {}))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

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
      'Le traitement n’a pas pu être enregistré. Réessaie.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('TreatmentFormView — routes', () => {
  it('ouvre la création depuis l’animal de l’URL, en lui passant l’identifiant en prop', () => {
    const route = router.resolve(`/animals/${MILO.id}/treatments/new`)

    expect(route.name).toBe('treatment-new')
    expect(route.params).toEqual({ animalId: MILO.id })
    expect(route.matched[0]?.props.default).toBe(true)
  })

  it('ouvre l’édition depuis l’identifiant du traitement, sans animal dans l’URL', () => {
    const route = router.resolve(`/treatments/${BRAVECTO.id}/edit`)

    expect(route.name).toBe('treatment-edit')
    expect(route.params).toEqual({ id: BRAVECTO.id })
    expect(route.matched[0]?.props.default).toBe(true)
  })
})

function expectLie(wrapper: VueWrapper, controle: string, champ: string) {
  const idErreur = wrapper.get(`${champ} .form-field__error`).attributes('id')

  expect(idErreur).toBeTruthy()
  expect(wrapper.get(controle).attributes('aria-describedby')).toBe(idErreur)
  expect(wrapper.get(controle).attributes('aria-invalid')).toBe('true')
}

describe('TreatmentFormView — accessibilité des erreurs', () => {
  it('relie chaque contrôle en erreur à son message et le marque invalide', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    expect(messages(wrapper)).toHaveLength(4)
    expectLie(wrapper, '#treatment-name', '.treatment-form__field--name')
    expectLie(
      wrapper,
      '.treatment-form__field--type .form-segmented',
      '.treatment-form__field--type',
    )
    expectLie(wrapper, '#treatment-frequency-value', '.treatment-form__field--frequency')
    expectLie(wrapper, '#treatment-last-dose-date', '.treatment-form__field--last-dose-date')
  })

  it('nomme le champ nombre par le libellé « Fréquence » et le mot de liaison', async () => {
    const wrapper = await monterCreation()

    const ids = champ(wrapper, 'treatment-frequency-value')
      .attributes('aria-labelledby')!
      .split(' ')
    expect(ids).toHaveLength(2)
    expect(wrapper.get(`#${ids[0]}`).text()).toContain('Fréquence')
    expect(wrapper.get(`#${ids[1]}`).text()).toBe('Tous les')
  })

  it('annonce la prochaine dose dans une région polie, présente avant même l’aperçu', async () => {
    const wrapper = await monterCreation()
    const region = wrapper.get('[aria-live="polite"]')

    expect(region.text()).toBe('')

    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    await champ(wrapper, 'treatment-last-dose-date').setValue('2026-06-24')

    expect(wrapper.get('[aria-live="polite"]').text()).toBe('Prochaine dose le 24 sept. 2026')
  })
})

describe('TreatmentFormView — changement de jour', () => {
  it('accepte la date du nouveau jour après un retour au premier plan', async () => {
    vi.useFakeTimers({ now: new Date('2026-09-09T23:30:00'), toFake: ['Date'] })
    const wrapper = await monterCreation()

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()
    expect(champ(wrapper, 'treatment-last-dose-date').attributes('max')).toBe('2026-09-10')

    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-last-dose-date').setValue('2026-09-10')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ lastDoseDate: '2026-09-10' }))
  })
})
