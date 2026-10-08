import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import VaccinationFormView from '../views/VaccinationFormView.vue'
import VaccinationReminderSheet from '../views/VaccinationReminderSheet.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import type {
  Vaccination,
  VaccinationInput,
  VaccinationUpdateInput,
} from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { shouldShowPriming } from '@/core/notifications/permission'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

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
  birthDateApproximate: false,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
  departureReason: null,
  departureDate: null,
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
  const vaccinations = useVaccinationsStore()
  create = vi.spyOn(vaccinations, 'create').mockResolvedValue(RAGE)
  update = vi.spyOn(vaccinations, 'update').mockResolvedValue(RAGE)
  getById = vi.spyOn(vaccinations, 'getById').mockResolvedValue(RAGE)
  routeur = routeurMemoire()
  await routeur.push('/animals')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
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

function choix(wrapper: VueWrapper) {
  return wrapper.findAll('.next-reminder-choices__choice')
}

async function choisir(wrapper: VueWrapper, libelle: string) {
  const bouton = choix(wrapper).find((noeud) => noeud.text() === libelle)
  if (!bouton) throw new Error(`Raccourci introuvable : ${libelle}`)
  await bouton.trigger('click')
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

  it('V10 bis : nom, date de l’injection facultative, prochain rappel en date obligatoire', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.findAll('.form-field__label').map((label) => label.text())).toEqual([
      'Nom du vaccin*',
      'Date de l’injectionOptionnel',
      'Prochain rappel*',
    ])
    expect(wrapper.findAll('input').map((input) => input.attributes('id'))).toEqual([
      'vaccination-name',
      'vaccination-last-injection-date',
      'vaccination-planned-date',
    ])
    expect(wrapper.find('.animal-chip-selector').exists()).toBe(false)
    expect(wrapper.find('[role="radiogroup"]').exists()).toBe(false)
    expect(wrapper.get('.form-screen__submit').text()).toBe('Créer')
  })

  it('aide sous la date de l’injection tant qu’elle est vide', async () => {
    const wrapper = await monterCreation()

    expect(
      wrapper.get('.vaccination-form__field--last-injection-date .form-field__help').text(),
    ).toBe('Laisse vide si l’injection n’a pas encore eu lieu.')

    await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')

    expect(
      wrapper.find('.vaccination-form__field--last-injection-date .form-field__help').exists(),
    ).toBe(false)
  })

  it('annonce « Prévu le … » sous le rendez-vous saisi', async () => {
    const wrapper = await monterCreation()

    await champ(wrapper, 'vaccination-planned-date').setValue('2099-10-05')

    expect(
      wrapper
        .get('.vaccination-form__field--next-reminder .form-field__help')
        .text()
        .replace(/\s/gu, ' '),
    ).toBe('Rendez-vous prévu : le vaccin sera « Prévu le 5 oct. 2099 ».')
  })

  it('borne la date d’injection à aujourd’hui, le rendez-vous à partir d’aujourd’hui', async () => {
    const wrapper = await monterCreation()
    const injection = champ(wrapper, 'vaccination-last-injection-date')
    const rendezVous = champ(wrapper, 'vaccination-planned-date')

    expect(injection.attributes('type')).toBe('date')
    expect(injection.attributes('max')).toBe(todayIsoDate())
    expect(rendezVous.attributes('type')).toBe('date')
    expect(rendezVous.attributes('min')).toBe(todayIsoDate())
    expect(rendezVous.attributes('max')).toBeUndefined()
  })

  it('V10 ter : une date d’injection fait passer le prochain rappel aux raccourcis, facultatifs', async () => {
    const wrapper = await monterCreation()

    await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')

    expect(wrapper.find('#vaccination-planned-date').exists()).toBe(false)
    expect(choix(wrapper).map((noeud) => noeud.text())).toEqual([
      'Dans 1 mois',
      'Dans 1 an',
      'Dans 3 ans',
      'Autre date',
      'Pas de rappel',
    ])
    expect(choix(wrapper).map((noeud) => noeud.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'false',
    ])
    expect(wrapper.get('.vaccination-form__field--next-reminder .form-field__label').text()).toBe(
      'Prochain rappelOptionnel',
    )
  })

  it('compte le raccourci depuis l’injection et l’annonce', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')

    await choisir(wrapper, 'Dans 1 mois')

    expect(choix(wrapper)[0]!.attributes('aria-checked')).toBe('true')
    expect(wrapper.get('.vaccination-form__summary').text().replace(/\s/gu, ' ')).toBe(
      'Prochain rappel le 12 avr. 2026',
    )
  })

  it('« Autre date » ouvre le calendrier et retient le jour touché', async () => {
    vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await choisir(wrapper, 'Autre date')
    const calendrier = wrapper.getComponent(DatePickerSheet)
    expect(calendrier.props('modelValue')).toBe(true)
    calendrier.vm.$emit('pick', '2099-06-01')
    await flushPromises()
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2099-06-01' }))
    wrapper.unmount()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  it('vide le prochain rappel quand la date d’injection est effacée', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')

    await champ(wrapper, 'vaccination-last-injection-date').setValue('')
    await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')

    expect(choix(wrapper).some((noeud) => noeud.attributes('aria-checked') === 'true')).toBe(false)
  })
})

describe('VaccinationFormView — validation', () => {
  it('refuse un formulaire vide et n’écrit rien', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'Le nom du vaccin est obligatoire.',
      'Choisis la date du rendez-vous prévu.',
    ])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse une date d’injection dans le futur', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'vaccination-name').setValue('Rage')
    await champ(wrapper, 'vaccination-last-injection-date').setValue('2999-01-01')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La date de l’injection ne peut pas être dans le futur.'])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse un rendez-vous passé', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'vaccination-name').setValue('Typhus')
    await champ(wrapper, 'vaccination-planned-date').setValue('2020-01-01')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Le rendez-vous ne peut pas être dans le passé.'])
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

describe('VaccinationFormView — longueur du nom', () => {
  const limite = 'a'.repeat(MAX_NAME_LENGTH)

  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  it('borne la saisie du nom à 80 caractères, collage compris', async () => {
    const wrapper = await monterCreation()

    expect(champ(wrapper, 'vaccination-name').attributes('maxlength')).toBe('80')
  })

  it('accepte un nom de 80 caractères', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'vaccination-name').setValue(limite)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create.mock.calls[0]![0]).toMatchObject({ name: limite })
  })

  it.each([
    ['fr', 'Le nom du vaccin ne peut pas dépasser 80 caractères.'],
    ['en', 'Vaccine name can’t be longer than 80 characters.'],
  ] as const)('refuse 81 caractères (%s) et n’écrit rien', async (langue, message) => {
    i18n.global.locale.value = langue
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'vaccination-name').setValue(`${limite}a`)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([message])
    expect(create).not.toHaveBeenCalled()
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

    expect(messages(wrapper)).toEqual(['Choisis la date du rendez-vous prévu.'])
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

    expect(messages(wrapper)).toContain('La date de l’injection ne peut pas être dans le futur.')
    expect(messages(wrapper)).not.toContain('Choisis la date du rendez-vous prévu.')
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

  it('envoie le rappel du raccourci choisi', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ dueDate: '2027-03-12' }))
  })

  it('VA-3 : crée un vaccin prévu, sans injection, avec son rendez-vous', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'vaccination-name').setValue('Typhus, coryza')
    await champ(wrapper, 'vaccination-planned-date').setValue('2099-10-05')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'Typhus, coryza',
      lastInjectionDate: null,
      dueDate: '2099-10-05',
    })
  })

  it('revient au Carnet une fois le vaccin créé', async () => {
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

describe('VaccinationFormView — animal qu’on ne suit plus (AN-9)', () => {
  function neSuitPlusMilo(): void {
    const animals = useAnimalsStore()
    loadAnimals.mockImplementation(async () => {
      animals.animals = [{ ...MILO, unfollowedOn: '2026-10-01' }]
      animals.hasLoaded = true
      return true
    })
  }

  it('n’ouvre pas la création : retour sur son carnet, sans rien écrire', async () => {
    neSuitPlusMilo()

    await monterCreation()

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
    expect(useAnimalsStore().selectedAnimalId).toBe(MILO.id)
    expect(create).not.toHaveBeenCalled()
  })

  it('n’ouvre pas la création quand les animaux sont déjà chargés', async () => {
    const animals = useAnimalsStore()
    animals.animals = [{ ...MILO, unfollowedOn: '2026-10-01' }]
    animals.hasLoaded = true

    await monterCreation()

    expect(loadAnimals).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
    expect(create).not.toHaveBeenCalled()
  })

  it('garde « Créer » inactif pour un animal introuvable', async () => {
    const wrapper = await monterCreation('99999999-9999-4999-8999-999999999999')

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })

  it('garde « Créer » inactif tant que les animaux ne sont pas chargés', async () => {
    loadAnimals.mockReturnValue(new Promise(() => {}))

    const wrapper = await monterCreation()

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })

  it('laisse modifier un vaccin de son carnet', async () => {
    neSuitPlusMilo()

    await monterEdition()

    expect(replace).not.toHaveBeenCalled()
  })
})

describe('VaccinationFormView — écran d’explication des notifications', () => {
  it('y passe après un vaccin avec échéance quand la permission n’a jamais été demandée', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'vaccination' },
    })
  })

  it('y passe aussi après la modification d’un vaccin avec échéance', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'vaccination' },
    })
  })

  it('n’envoie pas de prénom quand l’animal du vaccin est introuvable', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    getById.mockResolvedValueOnce({ ...RAGE, animalId: '99999999-9999-4999-8999-999999999999' })
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({
      name: 'notifications-priming',
      query: { kind: 'vaccination' },
    })
  })

  it('revient au Carnet sans rien vérifier pour un vaccin sans échéance', async () => {
    vi.mocked(shouldShowPriming).mockClear()
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(shouldShowPriming).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
  })

  it('n’y passe pas quand l’enregistrement échoue', async () => {
    vi.mocked(shouldShowPriming).mockClear()
    create.mockRejectedValueOnce(new Error('disque plein'))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')

    await soumettre(wrapper)

    expect(shouldShowPriming).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })
})

describe('VaccinationFormView — retour sur l’animal du formulaire', () => {
  const AUTRE_ANIMAL = '33333333-3333-4333-8333-333333333333'

  function selectionAuPush(): () => string | null {
    const animals = useAnimalsStore()
    let selection: string | null = null
    replace.mockImplementation(async () => {
      selection = animals.selectedAnimalId
    })
    return () => selection
  }

  it('sélectionne l’animal du vaccin créé avant de revenir au Carnet', async () => {
    useAnimalsStore().select(AUTRE_ANIMAL)
    const selection = selectionAuPush()
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
    expect(selection()).toBe(MILO.id)
  })

  it('sélectionne l’animal du vaccin modifié, pris dans le vaccin et non dans la route', async () => {
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
    await choisir(wrapper, 'Dans 1 an')

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

describe('VaccinationFormView — pile de navigation', () => {
  beforeEach(async () => {
    replace.mockRestore()
    routeur = routeurAvecPile({
      path: '/animals/:animalId/vaccinations/new',
      name: 'vaccination-new',
    })
    await routeur.push('/animals')
    await routeur.push(`/animals/${MILO.id}/vaccinations/new`)
  })

  it('ne rouvre pas le formulaire au retour après l’enregistrement', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await soumettre(wrapper)
    await vi.waitFor(() => expect(routeur.currentRoute.value.name).toBe('animals'))

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas le formulaire au retour après l’écran d’explication des notifications', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')
    await soumettre(wrapper)
    await vi.waitFor(() => expect(routeur.currentRoute.value.name).toBe('notifications-priming'))
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

describe('VaccinationFormView — édition', () => {
  it('titre « Modifier Rage », nom et prochain rappel, « Autre date » cochée', async () => {
    const wrapper = await monterEdition()

    expect(getById).toHaveBeenCalledWith(RAGE.id)
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Rage')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect((champ(wrapper, 'vaccination-name').element as HTMLInputElement).value).toBe('Rage')
    expect(wrapper.find('#vaccination-last-injection-date').exists()).toBe(false)
    expect(choix(wrapper)[3]!.attributes('aria-checked')).toBe('true')
    expect(wrapper.get('.vaccination-form__summary').text().replace(/\s/gu, ' ')).toBe(
      'Prochain rappel le 12 mars 2027',
    )
    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrer')
  })

  it('coche « Pas de rappel » pour un vaccin injecté sans rappel', async () => {
    getById.mockResolvedValueOnce({ ...RAGE, dueDate: null })
    const wrapper = await monterEdition()

    expect(choix(wrapper)[4]!.attributes('aria-checked')).toBe('true')
  })

  it('compte les raccourcis depuis la dernière injection', async () => {
    const wrapper = await monterEdition()

    await choisir(wrapper, 'Dans 3 ans')
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(RAGE.id, { name: 'Rage', dueDate: '2029-03-12' })
  })

  it('vaccin prévu : change le rendez-vous, sans « Pas de rappel » ni injection', async () => {
    getById.mockResolvedValueOnce({ ...RAGE, lastInjectionDate: null, dueDate: '2099-10-05' })
    const wrapper = await monterEdition()

    expect(wrapper.find('#vaccination-last-injection-date').exists()).toBe(false)
    expect(choix(wrapper)).toHaveLength(0)
    expect((champ(wrapper, 'vaccination-planned-date').element as HTMLInputElement).value).toBe(
      '2099-10-05',
    )
    await champ(wrapper, 'vaccination-planned-date').setValue('2099-10-12')
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(RAGE.id, { name: 'Rage', dueDate: '2099-10-12' })
  })

  it('vaccin prévu en retard : le renommer garde son rendez-vous passé', async () => {
    getById.mockResolvedValueOnce({ ...RAGE, lastInjectionDate: null, dueDate: '2020-10-05' })
    const wrapper = await monterEdition()

    await champ(wrapper, 'vaccination-name').setValue('Typhus')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(update).toHaveBeenCalledExactlyOnceWith(RAGE.id, {
      name: 'Typhus',
      dueDate: '2020-10-05',
    })
  })

  it('garde le titre d’origine pendant qu’on retape le nom', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'vaccination-name').setValue('Rage (rappel)')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Rage')
  })

  it('met à jour par le store avec l’identifiant de la route, sans animal', async () => {
    const wrapper = await monterEdition()
    await choisir(wrapper, 'Pas de rappel')

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(RAGE.id, { name: 'Rage', dueDate: null })
    expect(create).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('prévient et n’autorise pas l’envoi quand le vaccin est introuvable', async () => {
    getById.mockResolvedValueOnce(null)
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__save-error').text()).toBe('Ce vaccin est introuvable.')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })

  it('prévient et n’écrase rien quand la fiche n’a pas pu être lue', async () => {
    getById.mockRejectedValueOnce(new Error('base verrouillée'))
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__save-error').text()).toBe(
      'Ce vaccin n’a pas pu être chargé. Réessaie.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
  })

  it('n’enregistre pas tant que la fiche n’est pas chargée', async () => {
    getById.mockReturnValueOnce(new Promise<Vaccination>(() => {}))
    const wrapper = await monterEdition()

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
  })
})

describe('VaccinationFormView — vaccin déjà suivi', () => {
  const CARRE: Vaccination = { ...RAGE, id: '33333333-3333-4333-8333-333333333333', name: 'Carré' }
  let findSameName: MockInstance<(animalId: string, name: string) => Promise<Vaccination | null>>

  beforeEach(() => {
    vi.stubGlobal('visualViewport', { addEventListener() {}, removeEventListener() {} })
    findSameName = vi.spyOn(useVaccinationsStore(), 'findSameName').mockResolvedValue(CARRE)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
  })

  async function saisirCarre(wrapper: VueWrapper, date = '2026-09-01') {
    await champ(wrapper, 'vaccination-name').setValue(' carre ')
    await champ(wrapper, 'vaccination-last-injection-date').setValue(date)
    await soumettre(wrapper)
  }

  function texte(selecteur: string): string | undefined {
    return document.body.querySelector(selecteur)?.textContent?.trim()
  }

  it('propose d’en noter le rappel au toucher d’« Enregistrer », sans rien créer', async () => {
    const wrapper = await monterCreation()

    await saisirCarre(wrapper)

    expect(findSameName).toHaveBeenCalledWith(MILO.id, ' carre ')
    expect(texte('.confirm-dialog__title')).toBe('C’est un rappel de Carré ?')
    expect(texte('.confirm-dialog__text')).toBe(
      'Milo a déjà un vaccin Carré. Noter une nouvelle injection garde tout son historique.',
    )
    expect(texte('.confirm-dialog__cancel')).toBe('Non, créer un autre vaccin')
    expect(texte('.confirm-dialog__confirm')).toBe('Oui, noter le rappel')
    expect(create).not.toHaveBeenCalled()
  })

  it('« Oui, noter le rappel » ouvre la feuille « Fait » du vaccin existant, date saisie reprise', async () => {
    const wrapper = await monterCreation()
    await saisirCarre(wrapper)

    document.body.querySelector<HTMLButtonElement>('.confirm-dialog__confirm')!.click()
    await flushPromises()

    const feuille = wrapper.getComponent(VaccinationReminderSheet)
    expect(feuille.props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'done',
      initialInjectedOn: '2026-09-01',
      returnTo: 'animals',
    })
    expect(create).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
  })

  it('part d’aujourd’hui quand aucune date n’est saisie', async () => {
    const wrapper = await monterCreation()
    await saisirCarre(wrapper, '')

    expect(document.body.querySelector('.confirm-dialog__title')).not.toBeNull()

    document.body.querySelector<HTMLButtonElement>('.confirm-dialog__confirm')!.click()
    await flushPromises()

    expect(wrapper.getComponent(VaccinationReminderSheet).props('initialInjectedOn')).toBeNull()
  })

  it('« Non, créer un autre vaccin » enregistre le nouveau vaccin comme aujourd’hui', async () => {
    const wrapper = await monterCreation()
    await saisirCarre(wrapper)

    document.body.querySelector<HTMLButtonElement>('.confirm-dialog__cancel')!.click()
    await flushPromises()

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'carre',
      lastInjectionDate: '2026-09-01',
      dueDate: null,
    })
    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('reste sur le formulaire sans rien enregistrer quand on quitte le dialogue', async () => {
    const wrapper = await monterCreation()
    await saisirCarre(wrapper)

    wrapper.getComponent(ConfirmDialog).vm.$emit('update:modelValue', false)
    await flushPromises()

    expect(create).not.toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
    expect(wrapper.getComponent(VaccinationReminderSheet).props('modelValue')).toBe(false)
  })

  it('crée directement quand l’animal ne suit aucun vaccin de ce nom', async () => {
    findSameName.mockResolvedValue(null)
    const wrapper = await monterCreation()

    await saisirCarre(wrapper)

    expect(document.body.querySelector('.confirm-dialog__title')).toBeNull()
    expect(create).toHaveBeenCalledOnce()
  })

  it('ne cherche pas de doublon en modification', async () => {
    const wrapper = await monterEdition()

    await soumettre(wrapper)

    expect(findSameName).not.toHaveBeenCalled()
    expect(update).toHaveBeenCalledOnce()
  })
})

describe('VaccinationFormView — retour vers l’écran d’origine', () => {
  async function monterDepuis(from: string, reminder?: string) {
    routeur = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: Vide },
        { path: '/animals', name: 'animals', component: Vide },
        { path: '/vaccinations/:id/edit', name: 'vaccination-edit', component: Vide },
      ],
    })
    await routeur.push({
      name: 'vaccination-edit',
      params: { id: RAGE.id },
      query: reminder ? { from, reminder } : { from },
    })
    replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
    return monterEdition()
  }

  it('revient à l’accueil après l’enregistrement quand « Modifier » y a été ouvert', async () => {
    const wrapper = await monterDepuis('home')

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'home' })
  })

  it('rend à l’accueil le rappel dont la feuille se rouvre, à l’enregistrement comme à l’annulation', async () => {
    const reminder = `vaccination:${RAGE.id}`
    const enregistre = await monterDepuis('home', reminder)
    await soumettre(enregistre)
    expect(replace).toHaveBeenLastCalledWith({ name: 'home', query: { reminder } })

    const annule = await monterDepuis('home', reminder)
    await annule.get('.form-screen__cancel').trigger('click')
    await flushPromises()
    expect(replace).toHaveBeenLastCalledWith({ name: 'home', query: { reminder } })
  })

  it('revient à l’accueil quand on annule', async () => {
    const wrapper = await monterDepuis('home')

    await wrapper.get('.form-screen__cancel').trigger('click')
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ name: 'home' })
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

  it('ne permet plus aucune écriture après une écriture réussie, « Annuler » restant utilisable', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeUndefined()
    expect(create).toHaveBeenCalledOnce()
  })

  it('quand la navigation de retour échoue : pas de message d’échec, pas de seconde écriture, le bouton reste désactivé et « Annuler » utilisable', async () => {
    replace.mockRejectedValue(new Error('navigation refusée'))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
    expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)
    expect(wrapper.get('.form-screen__submit').text()).toBe('Créer')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeUndefined()
  })

  it('retombe sur le Carnet quand le calcul de la route échoue après l’écriture, sans dire que l’enregistrement a échoué', async () => {
    vi.mocked(shouldShowPriming).mockRejectedValueOnce(new Error('plugin indisponible'))
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await choisir(wrapper, 'Dans 1 an')

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
    expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })

  it('ne réenregistre pas en édition quand la navigation de retour échoue', async () => {
    replace.mockRejectedValue(new Error('navigation refusée'))
    const wrapper = await monterEdition()

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledOnce()
    expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)
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
    expect(replace).not.toHaveBeenCalled()
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
    expectLie(wrapper, '#vaccination-planned-date', '.vaccination-form__field--next-reminder')
    expect(wrapper.get('#vaccination-last-injection-date').attributes('aria-invalid')).toBe('false')
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

describe('VaccinationFormView — propositions de noms (VA-4)', () => {
  it('enregistre la combinaison choisie dans les propositions de l’espèce', async () => {
    vi.spyOn(useVaccinationsStore(), 'listAll').mockResolvedValue([])
    const wrapper = await monterCreation()

    await champ(wrapper, 'vaccination-name').setValue('chppi')
    await wrapper.findAll('[role="option"]')[0]!.trigger('click')
    await champ(wrapper, 'vaccination-last-injection-date').setValue('2026-03-12')
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Carré, hépatite, parvovirose, parainfluenza' }),
    )
  })
})
