import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import TreatmentFormView from '../views/TreatmentFormView.vue'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import {
  getExactRemindersStatus,
  markExactRemindersSuggested,
  wasExactRemindersSuggested,
  type ExactRemindersStatus,
} from '@/core/notifications/exact-reminders'
import {
  getNotificationPermissionStatus,
  shouldShowPriming,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'
import { MAX_NAME_LENGTH } from '@/shared/domain/name-length'

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
  getNotificationPermissionStatus: vi.fn<() => Promise<NotificationPermissionStatus>>(),
}))

vi.mock('@/core/notifications/exact-reminders', () => ({
  getExactRemindersStatus: vi.fn<() => Promise<ExactRemindersStatus>>(),
  openExactRemindersSettings: vi.fn<() => Promise<ExactRemindersStatus>>(),
  wasExactRemindersSuggested: vi.fn<() => boolean>(),
  markExactRemindersSuggested: vi.fn<() => void>(),
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

const AUJOURDHUI = '2026-09-28T09:41:00'
const AT = '2026-07-10T09:00:00.000Z'

const MILO: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  birthDateApproximate: false,
  photoPath: null,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
  unfollowedOn: null,
}

const ID = '22222222-2222-4222-8222-222222222222'

function periode(overrides: Partial<TreatmentPeriodRecord> = {}): TreatmentPeriodRecord {
  return {
    id: ID,
    treatmentId: ID,
    animalId: MILO.id,
    startsOn: '2026-07-10',
    firstDueOn: '2026-07-10',
    referenceOn: '2026-07-10',
    endsOn: null,
    stoppedOn: null,
    frequency: { value: 3, unit: 'month' },
    times: [],
    doseQuantity: 1,
    doseUnit: 'tablet',
    reminderOffsetMinutes: null,
    reminderTime: null,
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

function prise(overrides: Partial<NewTreatmentDose> = {}): NewTreatmentDose {
  return {
    id: 'd-1',
    periodId: ID,
    treatmentId: ID,
    animalId: MILO.id,
    dueOn: '2026-07-10',
    dueTime: null,
    givenOn: '2026-07-10',
    status: 'given',
    nextDueDate: '2026-10-10',
    createdAt: AT,
    updatedAt: AT,
    deletedAt: null,
    ...overrides,
  }
}

function milbemax(
  periods: TreatmentPeriodRecord[] = [periode()],
  doses: NewTreatmentDose[] = [prise()],
): TreatmentWithHistory {
  return {
    id: ID,
    animalId: MILO.id,
    name: 'Milbemax',
    type: 'deworming',
    createdAt: AT,
    updatedAt: AT,
    periods,
    doses,
  }
}

const ECRIT: Treatment = {
  id: ID,
  animalId: MILO.id,
  name: 'Milbemax',
  type: 'deworming',
  periodId: ID,
  frequency: { value: 3, unit: 'month' },
  lastDoseDate: '2026-07-10',
  nextDueDate: '2026-10-10',
  stoppedOn: null,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
}

let loadAnimals: MockInstance
let create: MockInstance<(input: TreatmentCreationInput) => Promise<Treatment>>
let update: MockInstance<(id: string, input: TreatmentEditionInput) => Promise<Treatment>>
let resume: MockInstance<(id: string, input: TreatmentResumptionInput) => Promise<Treatment>>
let getWithHistory: MockInstance<(id: string) => Promise<TreatmentWithHistory | null>>
let replace: MockInstance
let routeur: Router
const formulairesMontes: VueWrapper[] = []

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'], now: new Date(AUJOURDHUI) })
  vi.mocked(getExactRemindersStatus).mockResolvedValue('unavailable')
  vi.mocked(getNotificationPermissionStatus).mockResolvedValue('granted')
  vi.mocked(wasExactRemindersSuggested).mockReturnValue(false)
  vi.mocked(markExactRemindersSuggested).mockClear()
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  loadAnimals = vi.spyOn(animals, 'load').mockImplementation(async () => {
    animals.animals = [MILO]
    animals.hasLoaded = true
    return true
  })
  const treatments = useTreatmentsStore()
  create = vi.spyOn(treatments, 'create').mockResolvedValue(ECRIT)
  update = vi.spyOn(treatments, 'update').mockResolvedValue(ECRIT)
  resume = vi.spyOn(treatments, 'resume').mockResolvedValue(ECRIT)
  getWithHistory = vi.spyOn(treatments, 'getWithHistory').mockResolvedValue(milbemax())
  routeur = routeurMemoire()
  await routeur.push('/animals')
  replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
})

afterEach(() => {
  for (const wrapper of formulairesMontes.splice(0)) if (wrapper.exists()) wrapper.unmount()
  vi.restoreAllMocks()
  vi.useRealTimers()
  i18n.global.locale.value = 'fr'
})

async function monter(props: { animalId?: string; id?: string; resume?: boolean }) {
  const wrapper = mount(TreatmentFormView, {
    props,
    global: { plugins: [vuetify, i18n, routeur] },
    attachTo: document.body,
  })
  formulairesMontes.push(wrapper)
  await flushPromises()
  return wrapper
}

const monterCreation = (animalId = MILO.id) => monter({ animalId })
const monterEdition = () => monter({ id: ID })
const monterReprise = () => monter({ id: ID, resume: true })

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

function libelles(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.form-field__label > span:first-child').map((noeud) => noeud.text())
}

function aide(wrapper: VueWrapper, field: string): string | undefined {
  const noeud = wrapper.find(`.treatment-form__field--${field} .form-field__help`)
  return noeud.exists() ? noeud.text() : undefined
}

function heures(wrapper: VueWrapper): string[] {
  return wrapper.findAll('.treatment-times__chip').map((chip) => chip.text())
}

async function choisirHeure(wrapper: VueWrapper, selecteur: string, heure: string) {
  const input = wrapper.get(selecteur)
  ;(input.element as HTMLInputElement).value = heure
  await input.trigger('change')
}

const ajouterHeure = (wrapper: VueWrapper, heure: string) =>
  choisirHeure(wrapper, '.treatment-times__input--add', heure)

function unite(wrapper: VueWrapper) {
  return wrapper.findComponent({ name: 'VSelect' })
}

function raccourcis(wrapper: VueWrapper) {
  return wrapper.findAll('.treatment-dosage__shortcut')
}

async function remplirMinimum(wrapper: VueWrapper) {
  await champ(wrapper, 'treatment-name').setValue('Panacur')
  await types(wrapper)[0]!.trigger('click')
  await champ(wrapper, 'treatment-frequency-value').setValue('1')
  await choisirUnite(wrapper, 'day')
  await champ(wrapper, 'treatment-first-dose-on').setValue('2026-09-29')
}

async function soumettre(wrapper: VueWrapper) {
  await wrapper.get('.form-screen__submit').trigger('click')
  await flushPromises()
}

describe('TreatmentFormView — structure (TR-1, planche V1)', () => {
  it('affiche « Nouveau traitement », la flèche de retour et l’animal en sous-titre', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Nouveau traitement')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect(wrapper.find('.pushed-screen__back').exists()).toBe(true)
    expect(loadAnimals).toHaveBeenCalledOnce()
  })

  it('rend les champs dans l’ordre de la planche, quatre obligatoires et trois facultatifs', async () => {
    const wrapper = await monterCreation()

    expect(libelles(wrapper)).toEqual([
      'Nom du produit',
      'Type',
      'Fréquence',
      'Première prise le',
      'Heures du traitement',
      'Rappel',
      'Posologie',
      'Date de fin',
    ])
    expect(wrapper.findAll('.form-field__required')).toHaveLength(4)
    expect(wrapper.findAll('.form-field__optional')).toHaveLength(3)
  })

  it('n’offre aucun sélecteur d’animal : l’animal est un fait, pas un choix', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.find('.animal-chip-selector').exists()).toBe(false)
  })

  it('propose les trois types en choix exclusifs, aucun présélectionné', async () => {
    const wrapper = await monterCreation()

    expect(types(wrapper).map((bouton) => bouton.text())).toEqual([
      'Vermifuge',
      'Antiparasitaire',
      'Médicament',
    ])
    expect(types(wrapper).map((bouton) => bouton.attributes('aria-checked'))).toEqual([
      'false',
      'false',
      'false',
    ])
    expect(wrapper.get('.treatment-form__field--type .form-segmented').classes()).toContain(
      'form-segmented--compact',
    )
  })

  it('saisit la fréquence sur une ligne : « Tous les », un entier, l’unité au mois par défaut', async () => {
    const wrapper = await monterCreation()
    const nombre = champ(wrapper, 'treatment-frequency-value')
    const ligne = wrapper.get('.treatment-form__frequency')

    expect(ligne.text()).toContain('Tous les')
    expect(ligne.find('#treatment-frequency-value').exists()).toBe(true)
    expect(ligne.find('.treatment-form__unit').attributes('role')).toBe('radiogroup')
    expect(nombre.attributes('inputmode')).toBe('numeric')
    expect(nombre.attributes('min')).toBe('1')
    expect(nombre.attributes('max')).toBe('365')
    expect(nombre.attributes('placeholder')).toBe('1')
    expect(uniteCochee(wrapper)).toBe('month')
  })

  it('garde l’unité cochée quand on la retape : une fréquence a toujours une unité', async () => {
    const wrapper = await monterCreation()

    await choisirUnite(wrapper, 'month')

    expect(uniteCochee(wrapper)).toBe('month')
  })

  it('accorde le mot de liaison et les libellés d’unité à la saisie', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('2')

    expect(unites(wrapper).map((bouton) => bouton.text())).toEqual(['jours', 'semaines', 'mois'])
    expect(wrapper.get('#treatment-frequency-every').text()).toBe('Tous les')

    await choisirUnite(wrapper, 'week')

    expect(wrapper.get('#treatment-frequency-every').text()).toBe('Toutes les')

    await champ(wrapper, 'treatment-frequency-value').setValue('1')

    expect(unites(wrapper).map((bouton) => bouton.text())).toEqual(['jour', 'semaine', 'mois'])
  })

  it('demande la première prise sans la borner, avec l’aide de TR-2', async () => {
    const wrapper = await monterCreation()
    const date = champ(wrapper, 'treatment-first-dose-on')

    expect(date.attributes('type')).toBe('date')
    expect(date.attributes('min')).toBeUndefined()
    expect(date.attributes('max')).toBeUndefined()
    expect(aide(wrapper, 'first-dose-on')).toBe(
      'Déjà en cours\u00a0? Indique la dernière prise certaine\u00a0: l’historique commencera là.',
    )
    expect(date.attributes('aria-describedby')).toBe(
      wrapper.get('.treatment-form__field--first-dose-on .form-field__help').attributes('id'),
    )
  })

  it('n’a ni « Prochaine dose » ni encart d’information à la création', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.find('#treatment-next-dose-on').exists()).toBe(false)
    expect(wrapper.find('.treatment-form__info').exists()).toBe(false)
  })

  it('écrit les textes anglais du glossaire', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monterCreation()

    expect(libelles(wrapper)).toEqual([
      'Product name',
      'Type',
      'Frequency',
      'First dose on',
      'Treatment times',
      'Reminder',
      'Dosage',
      'End date',
    ])
    expect(types(wrapper).map((bouton) => bouton.text())).toEqual([
      'Dewormer',
      'Parasite control',
      'Medication',
    ])
    expect(wrapper.get('.treatment-times__add').text()).toBe('Add a time')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Create')
    expect(aide(wrapper, 'ends-on')).toBe('No dose will be scheduled after this date.')
  })
})

describe('TreatmentFormView — heures du traitement (TR-5)', () => {
  it('part sans heure, avec « Ajouter une heure »', async () => {
    const wrapper = await monterCreation()

    expect(heures(wrapper)).toEqual([])
    expect(wrapper.get('.treatment-times__add').text()).toBe('Ajouter une heure')
    expect(wrapper.get('.treatment-times__input--add').attributes('type')).toBe('time')
  })

  it('ajoute plusieurs heures, rangées dans l’ordre de la journée, quelle que soit la fréquence', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-frequency-value').setValue('2')

    await ajouterHeure(wrapper, '20:00')
    await ajouterHeure(wrapper, '08:00')

    expect(heures(wrapper)).toEqual(['8\u00a0h', '20\u00a0h'])
    expect((wrapper.get('.treatment-times__input--add').element as HTMLInputElement).value).toBe('')
  })

  it('refuse une heure déjà présente, à l’ajout comme au changement, sans retirer de puce, et le dit', async () => {
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')

    await ajouterHeure(wrapper, '20:00')

    expect(heures(wrapper)).toEqual(['8\u00a0h', '20\u00a0h'])
    expect(messages(wrapper)).toEqual(['Cette heure est déjà dans la liste.'])

    await choisirHeure(wrapper, '.treatment-times__chip input', '09:00')
    expect(messages(wrapper)).toEqual([])

    await choisirHeure(wrapper, '.treatment-times__chip input', '20:00')

    expect(heures(wrapper)).toEqual(['9\u00a0h', '20\u00a0h'])
    expect(messages(wrapper)).toEqual(['Cette heure est déjà dans la liste.'])
    const erreur = wrapper.get('.treatment-form__field--times .form-field__error')
    for (const input of wrapper.findAll('.treatment-times__input')) {
      expect(input.attributes('aria-describedby')).toBe(erreur.attributes('id'))
      expect(input.attributes('aria-invalid')).toBe('true')
    }
  })

  it('efface l’erreur de doublon dès que la liste change', async () => {
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')
    await ajouterHeure(wrapper, '20:00')
    expect(messages(wrapper)).toEqual(['Cette heure est déjà dans la liste.'])

    await wrapper.get('.treatment-times__remove').trigger('click')

    expect(heures(wrapper)).toEqual(['20\u00a0h'])
    expect(messages(wrapper)).toEqual([])
  })

  it('retire une heure et en change une autre, chacune nommée pour le lecteur d’écran', async () => {
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')
    const [matin] = wrapper.findAll('.treatment-times__chip')

    expect(matin!.get('input').attributes('aria-label')).toBe('Heure 8\u00a0h, modifier')
    expect(matin!.get('.treatment-times__remove').attributes('aria-label')).toBe('Retirer 8\u00a0h')

    await matin!.get('.treatment-times__remove').trigger('click')
    await choisirHeure(wrapper, '.treatment-times__chip input', '07:30')

    expect(heures(wrapper)).toEqual(['7\u00a0h\u00a030'])
  })

  it('écrit les heures à l’anglaise', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monterCreation()

    await ajouterHeure(wrapper, '20:00')

    expect(heures(wrapper)).toEqual(['8\u00a0pm'])
    expect(wrapper.get('.treatment-times__remove').attributes('aria-label')).toBe(
      'Remove 8\u00a0pm',
    )
  })
})

describe('TreatmentFormView — champ « Rappel » (RA-7, RA-8, RA-23, planches V1 et V2)', () => {
  beforeEach(() => {
    vi.stubGlobal('visualViewport', {
      addEventListener() {},
      removeEventListener() {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    // Les tests suivants lisent les écrans poussés dans l'ordre du document.
    document.querySelector('body > .v-overlay-container')?.remove()
  })

  function moments(wrapper: VueWrapper): string[] {
    return wrapper.findAll('.treatment-reminder__choice').map((choix) => choix.text())
  }

  function momentCoche(wrapper: VueWrapper): string | undefined {
    return wrapper
      .findAll('.treatment-reminder__choice')
      .find((choix) => choix.attributes('aria-checked') === 'true')
      ?.text()
  }

  async function choisirMoment(wrapper: VueWrapper, texte: string) {
    const choix = wrapper.findAll('.treatment-reminder__choice').find((c) => c.text() === texte)
    await choix!.trigger('click')
  }

  it('sans heure, propose l’heure du rappel, 9 h par défaut, et l’écrit une fois changée (RA-8)', async () => {
    const wrapper = await monterCreation()
    const heure = wrapper.get('.treatment-reminder__time')

    expect(heure.text()).toBe('À 9 h')
    expect(heure.get('input').attributes('aria-label')).toBe('Heure du rappel, 9 h. Modifier.')
    expect(aide(wrapper, 'reminder')).toBe('Sans heure de traitement, choisis l’heure du rappel.')

    await remplirMinimum(wrapper)
    await choisirHeure(wrapper, '.treatment-reminder__time-input', '07:30')
    await soumettre(wrapper)

    expect(create.mock.calls[0]![0]).toMatchObject({ times: [], reminderTime: '07:30' })
  })

  it('avec une heure, « À l’heure » coché et « 1 h avant », sans rappels précis (RA-7)', async () => {
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '21:00')

    expect(wrapper.find('.treatment-reminder__time').exists()).toBe(false)
    expect(moments(wrapper)).toEqual(['À l’heure', '1 h avant'])
    expect(momentCoche(wrapper)).toBe('À l’heure')
    expect(wrapper.get('.treatment-reminder__choices').attributes('role')).toBe('radiogroup')
    expect(aide(wrapper, 'reminder')).toBeUndefined()

    await remplirMinimum(wrapper)
    await choisirMoment(wrapper, '1 h avant')
    await soumettre(wrapper)

    expect(create.mock.calls[0]![0]).toMatchObject({ reminderOffsetMinutes: 60 })
  })

  it('propose aussi « 15 min avant » et « 30 min avant » avec les rappels précis actifs, et en anglais', async () => {
    vi.mocked(getExactRemindersStatus).mockResolvedValue('precise')
    i18n.global.locale.value = 'en'
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')

    expect(moments(wrapper)).toEqual([
      'At the time',
      '15 min before',
      '30 min before',
      '1 hour before',
    ])
    expect(aide(wrapper, 'reminder')).toBe('For each time: 8 am and 8 pm.')
    expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)
  })

  it('dit que le rappel vaut pour chaque heure (V1 bis)', async () => {
    const wrapper = await monterCreation()
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')

    expect(aide(wrapper, 'reminder')).toBe('Pour chaque heure : 8 h et 20 h.')
  })

  it('corrige seulement le rappel d’un traitement qui a des prises (B3)', async () => {
    vi.mocked(getExactRemindersStatus).mockResolvedValue('precise')
    getWithHistory.mockResolvedValue(milbemax([periode({ times: ['21:00'] })]))
    const wrapper = await monterEdition()

    await choisirMoment(wrapper, '30 min avant')
    await soumettre(wrapper)

    expect(update.mock.calls[0]![1]).toMatchObject({ times: ['21:00'], reminderOffsetMinutes: 30 })
  })

  describe('rappels précis retirés (V2 ter)', () => {
    beforeEach(() => {
      vi.mocked(getExactRemindersStatus).mockResolvedValue('removed')
      getWithHistory.mockResolvedValue(
        milbemax([periode({ times: ['21:00'], reminderOffsetMinutes: 30 })]),
      )
    })

    it('garde le choix fait, dit « Peut arriver en retard » et ouvre l’écran d’explication par son lien', async () => {
      const wrapper = await monterEdition()

      expect(moments(wrapper)).toEqual(['À l’heure', '30 min avant', '1 h avant'])
      expect(momentCoche(wrapper)).toBe('30 min avant')
      const encart = wrapper.get('.treatment-reminder__less-precise')
      expect(encart.text()).toContain('Peut arriver en retard : les rappels précis sont désactivés')
      expect(encart.get('button').text()).toBe('Réactiver les rappels précis')

      await encart.get('button').trigger('click')
      await flushPromises()

      expect(document.body.textContent).toContain('Recevoir les rappels à l’heure pile')
      wrapper.unmount()
    })

    it('garde le rappel quand on modifie autre chose', async () => {
      const wrapper = await monterEdition()

      await champ(wrapper, 'treatment-name').setValue('Milbemax chat')
      await soumettre(wrapper)

      expect(update.mock.calls[0]![1]).toMatchObject({ reminderOffsetMinutes: 30 })
      expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)
    })
  })

  describe('suggestion des rappels précis (V2, RA-23)', () => {
    beforeEach(() => {
      vi.mocked(getExactRemindersStatus).mockResolvedValue('never-enabled')
    })

    it('apparaît une fois, quand le traitement reçoit sa première heure, et ouvre l’écran d’explication', async () => {
      const wrapper = await monterCreation()
      expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)

      await ajouterHeure(wrapper, '21:00')
      await flushPromises()

      const suggestion = wrapper.get('.treatment-reminder__suggest')
      expect(suggestion.text()).toBe('Pour un rappel à l’heure pile, active les rappels précis')
      expect(markExactRemindersSuggested).toHaveBeenCalledOnce()

      await suggestion.trigger('click')
      await flushPromises()
      expect(document.body.textContent).toContain('Recevoir les rappels à l’heure pile')
      wrapper.unmount()
    })

    it('ne revient pas quand elle a déjà été faite sur ce téléphone', async () => {
      vi.mocked(wasExactRemindersSuggested).mockReturnValue(true)
      const wrapper = await monterCreation()

      await ajouterHeure(wrapper, '21:00')
      await flushPromises()

      expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)
    })

    it('n’apparaît pas tant que les notifications ne sont pas autorisées', async () => {
      vi.mocked(getNotificationPermissionStatus).mockResolvedValue('unasked')
      const wrapper = await monterCreation()

      await ajouterHeure(wrapper, '21:00')
      await flushPromises()

      expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)
      expect(markExactRemindersSuggested).not.toHaveBeenCalled()
    })

    it('n’apparaît pas à l’ouverture d’un traitement qui a déjà une heure', async () => {
      getWithHistory.mockResolvedValue(milbemax([periode({ times: ['21:00'] })]))
      const wrapper = await monterEdition()

      expect(wrapper.find('.treatment-reminder__suggest').exists()).toBe(false)
      expect(markExactRemindersSuggested).not.toHaveBeenCalled()
    })
  })
})

describe('TreatmentFormView — posologie (TR-4)', () => {
  it('propose une quantité libre et les onze unités, sans raccourci tant que l’unité n’est pas le comprimé', async () => {
    const wrapper = await monterCreation()

    expect(champ(wrapper, 'treatment-dose-quantity').attributes('inputmode')).toBe('decimal')
    expect(champ(wrapper, 'treatment-dose-quantity').attributes('placeholder')).toBe('Quantité')
    expect(
      (unite(wrapper).props('items') as { title: string }[]).map(({ title }) => title),
    ).toEqual([
      'comprimé',
      'gélule',
      'pipette',
      'collier',
      'ml',
      'goutte',
      'g',
      'sachet',
      'pulvérisation',
      'application',
      'dose',
    ])
    expect(raccourcis(wrapper)).toHaveLength(0)

    await unite(wrapper).setValue('ml')

    expect(raccourcis(wrapper)).toHaveLength(0)
  })

  it('montre les raccourcis « ¼ ½ ¾ 1 1 ½ » pour les comprimés et coche celui de la quantité', async () => {
    const wrapper = await monterCreation()
    await unite(wrapper).setValue('tablet')

    expect(raccourcis(wrapper).map((bouton) => bouton.text())).toEqual([
      '¼',
      '½',
      '¾',
      '1',
      '1\u00a0½',
    ])

    await raccourcis(wrapper)[1]!.trigger('click')

    expect(valeur(wrapper, 'treatment-dose-quantity')).toBe('½')
    expect(raccourcis(wrapper).map((bouton) => bouton.attributes('aria-checked'))).toEqual([
      'false',
      'true',
      'false',
      'false',
      'false',
    ])
    expect(raccourcis(wrapper)[4]!.attributes('aria-label')).toBe('1\u00a0½\u00a0comprimé')
  })

  it('récrit la quantité en fraction quand l’unité devient le comprimé, en décimale sinon', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-dose-quantity').setValue('0,5')

    await unite(wrapper).setValue('tablet')
    expect(valeur(wrapper, 'treatment-dose-quantity')).toBe('½')

    await unite(wrapper).setValue('ml')
    expect(valeur(wrapper, 'treatment-dose-quantity')).toBe('0,5')
  })

  it('accorde les unités à la quantité, en français comme en anglais', async () => {
    const wrapper = await monterCreation()
    await champ(wrapper, 'treatment-dose-quantity').setValue('2')

    expect((unite(wrapper).props('items') as { title: string }[])[0]!.title).toBe('comprimés')

    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()

    expect((unite(wrapper).props('items') as { title: string }[])[0]!.title).toBe('tablets')
  })

  it('refuse une quantité sans unité, une unité sans quantité et une quantité illisible', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-dose-quantity').setValue('2')

    await soumettre(wrapper)
    expect(messages(wrapper)).toEqual(['Indique la quantité et l’unité, ou laisse les deux vides.'])

    await unite(wrapper).setValue('ml')
    await champ(wrapper, 'treatment-dose-quantity').setValue('deux')
    expect(messages(wrapper)).toEqual(['La quantité doit être un nombre supérieur à 0.'])

    await champ(wrapper, 'treatment-dose-quantity').setValue('')
    expect(messages(wrapper)).toEqual(['Indique la quantité et l’unité, ou laisse les deux vides.'])
    expect(create).not.toHaveBeenCalled()
  })
})

describe('TreatmentFormView — date de fin (TR-6)', () => {
  it('est facultative, avec son aide, et se vide par son bouton', async () => {
    const wrapper = await monterCreation()

    expect(aide(wrapper, 'ends-on')).toBe('Aucune dose ne sera prévue après cette date.')
    expect(wrapper.find('.treatment-form__clear').exists()).toBe(false)

    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-10')

    expect(wrapper.get('.treatment-form__clear').attributes('aria-label')).toBe(
      'Effacer la date de fin',
    )

    await wrapper.get('.treatment-form__clear').trigger('click')

    expect(valeur(wrapper, 'treatment-ends-on')).toBe('')
  })

  it('borne le sélecteur à la première prise et refuse une date antérieure', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    expect(champ(wrapper, 'treatment-ends-on').attributes('min')).toBe('2026-09-29')

    await champ(wrapper, 'treatment-ends-on').setValue('2026-09-28')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La date de fin ne peut pas précéder la première prise.'])
    expect(create).not.toHaveBeenCalled()

    await champ(wrapper, 'treatment-ends-on').setValue('2026-09-29')
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
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

  it('n’affiche aucune erreur pendant la saisie avant tout envoi', async () => {
    const wrapper = await monterCreation()

    await champ(wrapper, 'treatment-name').setValue('P')
    await champ(wrapper, 'treatment-frequency-value').setValue('999')

    expect(messages(wrapper)).toEqual([])
    expect(champ(wrapper, 'treatment-frequency-value').attributes('aria-invalid')).toBe('false')
  })

  it('efface l’erreur d’un champ dès qu’il est corrigé, sans nouvel envoi', async () => {
    const wrapper = await monterCreation()
    await soumettre(wrapper)

    await champ(wrapper, 'treatment-name').setValue('Panacur')

    expect(messages(wrapper)).toEqual([
      'Choisis un type.',
      'Indique une fréquence.',
      'La date est obligatoire.',
    ])
    expect(champ(wrapper, 'treatment-name').attributes('aria-invalid')).toBe('false')
    expect(champ(wrapper, 'treatment-name').attributes('aria-describedby')).toBeUndefined()

    await remplirMinimum(wrapper)

    expect(messages(wrapper)).toEqual([])
    expect(create).not.toHaveBeenCalled()
  })

  it('dit le plafond de la fréquence', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-frequency-value').setValue('366')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La fréquence doit être de 365 maximum.'])
  })

  it('relie chaque contrôle en erreur à son message et le marque invalide', async () => {
    const wrapper = await monterCreation()

    await soumettre(wrapper)

    const lie = (controle: string, field: string) => {
      const erreur = wrapper.get(`.treatment-form__field--${field} .form-field__error`)
      expect(wrapper.get(controle).attributes('aria-describedby')).toContain(
        erreur.attributes('id'),
      )
      expect(wrapper.get(controle).attributes('aria-invalid')).toBe('true')
    }
    lie('#treatment-name', 'name')
    lie('.treatment-form__field--type .form-segmented', 'type')
    lie('#treatment-frequency-value', 'frequency')
    lie('#treatment-first-dose-on', 'first-dose-on')
  })

  it('nomme le champ nombre par le libellé « Fréquence » et le mot de liaison', async () => {
    const wrapper = await monterCreation()

    const ids = champ(wrapper, 'treatment-frequency-value')
      .attributes('aria-labelledby')!
      .split(' ')
    expect(wrapper.get(`#${ids[0]}`).text()).toContain('Fréquence')
    expect(wrapper.get(`#${ids[1]}`).text()).toBe('Tous les')
  })
})

describe('TreatmentFormView — longueur du nom', () => {
  const limite = 'a'.repeat(MAX_NAME_LENGTH)

  it('borne la saisie du nom à 80 caractères, collage compris', async () => {
    const wrapper = await monterCreation()

    expect(champ(wrapper, 'treatment-name').attributes('maxlength')).toBe('80')
  })

  it.each([
    ['fr', 'Le nom ne peut pas dépasser 80 caractères.'],
    ['en', 'Name can’t be longer than 80 characters.'],
  ] as const)('refuse 81 caractères (%s) et n’écrit rien', async (langue, message) => {
    i18n.global.locale.value = langue
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-name').setValue(`${limite}a`)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([message])
    expect(create).not.toHaveBeenCalled()
  })

  it('refuse aussi 81 caractères en modification', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-name').setValue(`${limite}a`)

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Le nom ne peut pas dépasser 80 caractères.'])
    expect(update).not.toHaveBeenCalled()
  })
})

describe('TreatmentFormView — création (TR-1, TR-3)', () => {
  it('porte le bouton « Créer »', async () => {
    const wrapper = await monterCreation()

    expect(wrapper.get('.form-screen__submit').text()).toBe('Créer')
  })

  it('écrit par le store le traitement de la planche V1, première prise demain, sans rien noter comme donné', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await ajouterHeure(wrapper, '20:00')
    await unite(wrapper).setValue('tablet')
    await raccourcis(wrapper)[1]!.trigger('click')
    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-10')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'Panacur',
      type: 'deworming',
      firstDoseOn: '2026-09-29',
      frequency: { value: 1, unit: 'day' },
      times: ['20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      endsOn: '2026-10-10',
    })
    expect(update).not.toHaveBeenCalled()
  })

  it('accepte une première prise passée, sans heure, posologie ni date de fin', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-09-03')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledExactlyOnceWith({
      animalId: MILO.id,
      name: 'Panacur',
      type: 'deworming',
      firstDoseOn: '2026-09-03',
      frequency: { value: 1, unit: 'day' },
      times: [],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
    })
  })

  it('refuse une première prise trop ancienne pour le rythme, sous son champ, sans rien écrire', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')
    await champ(wrapper, 'treatment-first-dose-on').setValue('1950-01-01')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Cette date est trop ancienne pour ce rythme.'])
    expect(create).not.toHaveBeenCalled()

    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()

    expect(messages(wrapper)).toEqual(['This date is too far back for this schedule.'])
  })

  it('crée un médicament', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await types(wrapper)[2]!.trigger('click')

    await soumettre(wrapper)

    expect(create).toHaveBeenCalledWith(expect.objectContaining({ type: 'medication' }))
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

describe('TreatmentFormView — encart des doses passées (TR-3, planches A · V1 ter et V1 ter bis)', () => {
  const NBSP = /\u00a0/g

  async function saisirPanacur(wrapper: VueWrapper, firstDoseOn = '2026-09-03') {
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-first-dose-on').setValue(firstDoseOn)
  }

  function encart(wrapper: VueWrapper) {
    return wrapper.find('.treatment-form__past-doses')
  }

  function texte(wrapper: VueWrapper, selecteur: string): string {
    return wrapper.get(selecteur).text().replace(NBSP, ' ')
  }

  function gestes(wrapper: VueWrapper) {
    return wrapper.findAll('.treatment-unlogged__action')
  }

  function dansLEcran(selecteur: string): HTMLButtonElement[] {
    return [...document.body.querySelectorAll<HTMLButtonElement>(selecteur)]
  }

  const montes: VueWrapper[] = []

  async function monterCreation() {
    const wrapper = await monter({ animalId: MILO.id })
    montes.push(wrapper)
    return wrapper
  }

  beforeEach(() => {
    vi.stubGlobal('visualViewport', {
      addEventListener() {},
      removeEventListener() {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
  })

  afterEach(() => {
    for (const wrapper of montes.splice(0)) wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('n’apparaît pas tant que la première prise n’est pas passée', async () => {
    const wrapper = await monterCreation()

    expect(encart(wrapper).exists()).toBe(false)

    await remplirMinimum(wrapper)

    expect(encart(wrapper).exists()).toBe(false)
  })

  it('annonce les échéances passées, juste avant « Créer », sans rien présélectionner', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)

    expect(texte(wrapper, '.treatment-unlogged__title')).toBe('25 doses prévues depuis le 3 sept.')
    expect(texte(wrapper, '.treatment-unlogged__subtitle')).toBe('Ont-elles été données ?')
    expect(texte(wrapper, '.treatment-unlogged__note')).toBe(
      'Facultatif. Tu pourras aussi le faire depuis la fiche.',
    )
    expect(gestes(wrapper).map((geste) => geste.text())).toEqual([
      'Toutes données',
      'Choisir les jours',
    ])
    expect(wrapper.find('.treatment-unlogged__result').exists()).toBe(false)
    expect(wrapper.get('.form-screen__fields').element.lastElementChild).toBe(
      encart(wrapper).element,
    )
  })

  it('non rempli, crée le traitement sans aucune prise', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)

    await soumettre(wrapper)

    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('pastDoses')
  })

  it('« Toutes données » résume la réponse sans rien écrire, puis « Créer » écrit tout', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)

    await gestes(wrapper)[0]!.trigger('click')

    expect(texte(wrapper, '.treatment-unlogged__result-text')).toBe('25 données')
    expect(texte(wrapper, '.treatment-unlogged__edit')).toBe('Modifier')
    expect(gestes(wrapper)).toHaveLength(0)
    expect(wrapper.find('.treatment-unlogged__note').exists()).toBe(false)
    expect(create).not.toHaveBeenCalled()

    await soumettre(wrapper)

    const { pastDoses } = create.mock.calls[0]![0]
    expect(create).toHaveBeenCalledOnce()
    expect(pastDoses).toHaveLength(25)
    expect(pastDoses?.[0]).toEqual({ dueOn: '2026-09-03', dueTime: null, status: 'given' })
    expect(pastDoses?.at(-1)).toEqual({ dueOn: '2026-09-27', dueTime: null, status: 'given' })
  })

  it('« Choisir les jours » rend « 20 données, 5 oubliées », et « Modifier » le rouvre tel quel', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)
    const jours = () => dansLEcran('.choose-days-month__day[role="checkbox"]')
    const valider = () => dansLEcran('.treatment-choose-days__submit')[0]!

    await gestes(wrapper)[1]!.trigger('click')
    await flushPromises()

    expect(dansLEcran('.pushed-screen__subtitle').at(-1)?.textContent?.replace(NBSP, ' ')).toBe(
      'Panacur · Milo · du 3 au 27 sept.',
    )
    expect(jours()).toHaveLength(25)

    for (const jour of jours().slice(0, 5)) jour.click()
    await flushPromises()
    valider().click()
    await flushPromises()

    expect(texte(wrapper, '.treatment-unlogged__result-text')).toBe('20 données, 5 oubliées')
    expect(create).not.toHaveBeenCalled()

    await wrapper.get('.treatment-unlogged__edit').trigger('click')
    await flushPromises()

    expect(jours().filter((jour) => jour.getAttribute('aria-checked') === 'false')).toHaveLength(5)
    expect(valider().textContent?.replace(NBSP, ' ').trim()).toBe(
      'Valider : 20 données, 5 oubliées',
    )

    jours()[0]!.click()
    await flushPromises()
    valider().click()
    await flushPromises()
    await soumettre(wrapper)

    const { pastDoses } = create.mock.calls[0]![0]
    expect(
      pastDoses?.filter(({ status }) => status === 'missed').map(({ dueOn }) => dueOn),
    ).toEqual(['2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'])
    expect(pastDoses?.filter(({ status }) => status === 'given')).toHaveLength(21)
  })

  it('pour une seule dose, propose « Donnée » et « Oubliée »', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper, '2026-09-27')

    expect(texte(wrapper, '.treatment-unlogged__title')).toBe('1 dose prévue le 27 sept.')
    expect(texte(wrapper, '.treatment-unlogged__subtitle')).toBe('A-t-elle été donnée ?')
    expect(texte(wrapper, '.treatment-unlogged__note')).toBe(
      'Facultatif. Tu pourras aussi le faire depuis la fiche.',
    )
    expect(gestes(wrapper).map((geste) => geste.text())).toEqual(['Donnée', 'Oubliée'])

    await gestes(wrapper)[1]!.trigger('click')

    expect(texte(wrapper, '.treatment-unlogged__result-text')).toBe('1 oubliée')

    await soumettre(wrapper)

    expect(create.mock.calls[0]![0].pastDoses).toEqual([
      { dueOn: '2026-09-27', dueTime: null, status: 'missed' },
    ])
  })

  it('compte la dose du moment déjà passée d’un mensuel : « Donnée » / « Oubliée » (Q42)', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper, '2026-09-07')
    await choisirUnite(wrapper, 'month')
    await flushPromises()

    expect(texte(wrapper, '.treatment-unlogged__title')).toBe('1 dose prévue le 7 sept.')
    expect(gestes(wrapper).map((geste) => geste.text())).toEqual(['Donnée', 'Oubliée'])

    await gestes(wrapper)[0]!.trigger('click')

    expect(texte(wrapper, '.treatment-unlogged__result-text')).toBe('1 donnée')

    await soumettre(wrapper)

    expect(create.mock.calls[0]![0].pastDoses).toEqual([
      { dueOn: '2026-09-07', dueTime: null, status: 'given' },
    ])
  })

  it('n’ouvre pas d’encart pour une dose du jour', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper, '2026-09-28')

    expect(encart(wrapper).exists()).toBe(false)
  })

  it.each([
    [
      'la première prise',
      (wrapper: VueWrapper) => champ(wrapper, 'treatment-first-dose-on').setValue('2026-09-10'),
      '18 doses prévues depuis le 10 sept.',
    ],
    [
      'la fréquence',
      (wrapper: VueWrapper) => champ(wrapper, 'treatment-frequency-value').setValue('2'),
      '13 doses prévues depuis le 3 sept.',
    ],
    [
      'l’unité de la fréquence',
      (wrapper: VueWrapper) => choisirUnite(wrapper, 'week'),
      '4 doses prévues depuis le 3 sept.',
    ],
    [
      'les heures',
      (wrapper: VueWrapper) => ajouterHeure(wrapper, '08:00'),
      '25 doses prévues depuis le 3 sept.',
    ],
    [
      'la date de fin',
      (wrapper: VueWrapper) => champ(wrapper, 'treatment-ends-on').setValue('2026-09-12'),
      '10 doses prévues depuis le 3 sept.',
    ],
  ])('revient à son état de départ quand %s change', async (_, changer, titre) => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)
    await gestes(wrapper)[0]!.trigger('click')

    await changer(wrapper)
    await flushPromises()

    expect(wrapper.find('.treatment-unlogged__result').exists()).toBe(false)
    expect(gestes(wrapper)).toHaveLength(2)
    expect(texte(wrapper, '.treatment-unlogged__title')).toBe(titre)

    await soumettre(wrapper)

    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('pastDoses')
  })

  it('garde la réponse quand seuls le nom, le type ou la posologie changent', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper)
    await gestes(wrapper)[0]!.trigger('click')

    await champ(wrapper, 'treatment-name').setValue('Panacur 250')
    await types(wrapper)[2]!.trigger('click')
    await unite(wrapper).setValue('tablet')
    await raccourcis(wrapper)[1]!.trigger('click')

    expect(texte(wrapper, '.treatment-unlogged__result-text')).toBe('25 données')
  })

  it('compte chaque heure d’un traitement à plusieurs heures', async () => {
    const wrapper = await monterCreation()
    await saisirPanacur(wrapper, '2026-09-26')
    await ajouterHeure(wrapper, '08:00')
    await ajouterHeure(wrapper, '20:00')
    await flushPromises()

    expect(texte(wrapper, '.treatment-unlogged__title')).toBe('4 doses prévues depuis le 26 sept.')

    await gestes(wrapper)[0]!.trigger('click')
    await soumettre(wrapper)

    expect(create.mock.calls[0]![0].pastDoses).toEqual([
      { dueOn: '2026-09-26', dueTime: '08:00', status: 'given' },
      { dueOn: '2026-09-26', dueTime: '20:00', status: 'given' },
      { dueOn: '2026-09-27', dueTime: '08:00', status: 'given' },
      { dueOn: '2026-09-27', dueTime: '20:00', status: 'given' },
    ])
  })

  it('n’existe ni à la modification ni à la reprise', async () => {
    const edition = await monterEdition()
    montes.push(edition)
    expect(encart(edition).exists()).toBe(false)

    getWithHistory.mockResolvedValue(milbemax([periode({ stoppedOn: '2026-08-01' })]))
    const reprise = await monterReprise()
    montes.push(reprise)
    await champ(reprise, 'treatment-first-dose-on').setValue('2026-08-10')
    await champ(reprise, 'treatment-frequency-value').setValue('1')
    await choisirUnite(reprise, 'day')

    expect(encart(reprise).exists()).toBe(false)
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
    await vi.waitFor(() => expect(routeur.currentRoute.value.name).toBe('animals'))

    await retourAndroid()

    expect(routeur.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas le formulaire au retour après l’écran d’explication des notifications', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)
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

describe('TreatmentFormView — modification (TR-27, TR-28, planches V1 quater et quinquies)', () => {
  it('titre « Modifier Milbemax », bouton « Enregistrer », champs préremplis par la période en cours', async () => {
    getWithHistory.mockResolvedValue(
      milbemax([periode({ times: ['20:00', '08:00'], endsOn: '2026-12-31' })]),
    )
    const wrapper = await monterEdition()

    expect(getWithHistory).toHaveBeenCalledWith(ID)
    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Milbemax')
    expect(wrapper.get('.pushed-screen__subtitle').text()).toBe('Pour Milo')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Enregistrer')
    expect(valeur(wrapper, 'treatment-name')).toBe('Milbemax')
    expect(types(wrapper)[0]!.attributes('aria-checked')).toBe('true')
    expect(valeur(wrapper, 'treatment-frequency-value')).toBe('3')
    expect(uniteCochee(wrapper)).toBe('month')
    expect(heures(wrapper)).toEqual(['8\u00a0h', '20\u00a0h'])
    expect(valeur(wrapper, 'treatment-dose-quantity')).toBe('1')
    expect(unite(wrapper).props('modelValue')).toBe('tablet')
    expect(valeur(wrapper, 'treatment-ends-on')).toBe('2026-12-31')
    expect(wrapper.find('#treatment-first-dose-on').exists()).toBe(false)
  })

  it('garde le titre d’origine pendant qu’on retape le nom', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'treatment-name').setValue('Autre nom')

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Milbemax')
  })

  it('propose « Prochaine dose » d’après la dernière prise, jamais avant aujourd’hui, avec son aide (TR-7)', async () => {
    const wrapper = await monterEdition()
    const date = champ(wrapper, 'treatment-next-dose-on')

    expect(libelles(wrapper)).toContain('Prochaine dose')
    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-10-10')
    expect(date.attributes('min')).toBe('2026-09-28')
    expect(date.attributes('max')).toBeUndefined()
    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Calculée d’après la dernière prise\u00a0: 10 oct. Modifiable.',
    )
  })

  it('corrige le nom et le type sans changer la prochaine dose (TR-27)', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-name').setValue('Milbemax chat')
    await types(wrapper)[2]!.trigger('click')

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledExactlyOnceWith(ID, {
      name: 'Milbemax chat',
      type: 'medication',
      frequency: { value: 3, unit: 'month' },
      times: [],
      doseQuantity: 1,
      doseUnit: 'tablet',
      endsOn: null,
      nextDoseOn: '2026-10-10',
    })
    expect(create).not.toHaveBeenCalled()
  })

  it('reporte la prochaine dose : la date choisie part au store, l’aide garde la date calculée (V1 quinquies)', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-14')

    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Calculée d’après la dernière prise\u00a0: 10 oct. Modifiable.',
    )

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ nextDoseOn: '2026-10-14' }))
  })

  it('montre la case « Décaler aussi les doses suivantes », cochée, et l’envoie décochée (V28)', async () => {
    const wrapper = await monterEdition()
    expect(wrapper.find('.treatment-shift').exists()).toBe(false)

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-14')

    const caseDecaler = wrapper.get<HTMLInputElement>('.treatment-shift__input')
    expect(caseDecaler.element.checked).toBe(true)
    expect(wrapper.get('.treatment-shift__label').text()).toBe('Décaler aussi les doses suivantes')
    expect(wrapper.get('.treatment-shift__help').text().replaceAll(' ', ' ')).toBe(
      'Les doses suivantes passeront au 14 janv. 2027, puis tous les 3 mois.',
    )

    await caseDecaler.setValue(false)

    expect(wrapper.get('.treatment-shift__help').text().replaceAll(' ', ' ')).toBe(
      'Seule cette dose change. Les suivantes restent prévues le 10 janv. 2027, puis tous les 3 mois.',
    )
    await soumettre(wrapper)
    expect(update).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ nextDoseOn: '2026-10-14', shiftsFollowing: false }),
    )
  })

  it('propose aujourd’hui quand la fréquence change après des prises : une nouvelle période s’ouvrira (V1 quater)', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [periode({ frequency: { value: 1, unit: 'week' }, doseUnit: 'pipette' })],
        [prise({ dueOn: '2026-09-08', givenOn: '2026-09-08', nextDueDate: '2026-09-15' })],
      ),
    )
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-02')

    await choisirUnite(wrapper, 'day')
    await champ(wrapper, 'treatment-frequency-value').setValue('15')

    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-28')
    expect(champ(wrapper, 'treatment-next-dose-on').attributes('min')).toBe('2026-09-28')
    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Calculée d’après la dernière prise\u00a0: le 23 sept., déjà passé\u00a0; aujourd’hui est proposé. Modifiable.',
    )

    await soumettre(wrapper)

    expect(update).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ frequency: { value: 15, unit: 'day' }, nextDoseOn: '2026-09-28' }),
    )
  })

  it('rend la prochaine dose proposée quand la fréquence revient à celle de la période', async () => {
    const wrapper = await monterEdition()

    await champ(wrapper, 'treatment-frequency-value').setValue('1')
    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-28')

    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-10-10')
  })

  it('borne « Prochaine dose » à la date de fin saisie, et le dit quand elle est dépassée (Q20)', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-31')

    expect(champ(wrapper, 'treatment-next-dose-on').attributes('max')).toBe('2026-10-31')

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-11-01')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'La prochaine dose ne peut pas dépasser la date de fin. Change la date de fin pour aller plus loin.',
    ])
    expect(update).not.toHaveBeenCalled()
  })

  it('refuse une prochaine dose avant aujourd’hui, en donnant la première date possible', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-09-27')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Choisis une date à partir du 28 septembre.'])
    expect(update).not.toHaveBeenCalled()
  })

  it('exige une prochaine dose', async () => {
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-next-dose-on').setValue('')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La date est obligatoire.'])
    expect(update).not.toHaveBeenCalled()
  })

  it('refuse une date de fin avant la dernière prise notée (TR-6)', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [periode({ frequency: { value: 1, unit: 'week' } })],
        [prise({ dueOn: '2026-09-26', givenOn: '2026-09-26', nextDueDate: '2026-10-03' })],
      ),
    )
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-ends-on').setValue('2026-09-25')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual([
      'La date de fin ne peut pas précéder la dernière prise notée.',
    ])
    expect(update).not.toHaveBeenCalled()
  })

  it('grise « Prochaine dose » et dit pourquoi quand une dose plus lointaine est déjà reportée (Q26)', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            frequency: { value: 1, unit: 'day' },
            startsOn: '2026-09-20',
            firstDueOn: '2026-09-20',
          }),
        ],
        [
          prise({
            dueOn: '2026-10-05',
            givenOn: null,
            status: 'postponed',
            nextDueDate: '2026-10-07',
          }),
        ],
      ),
    )
    const wrapper = await monterEdition()

    expect(champ(wrapper, 'treatment-next-dose-on').attributes('disabled')).toBeDefined()
    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Une dose plus lointaine est déjà reportée. Supprime ce report pour déplacer celle-ci.',
    )
  })

  it('ne propose pas « Prochaine dose » sans prise notée d’aide calculée', async () => {
    getWithHistory.mockResolvedValue(
      milbemax([periode({ startsOn: '2026-10-10', firstDueOn: '2026-10-10' })], []),
    )
    const wrapper = await monterEdition()

    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-10-10')
    expect(aide(wrapper, 'next-dose-on')).toBeUndefined()
  })

  it('ne laisse corriger que le nom et le type d’un traitement fini par sa date de fin', async () => {
    getWithHistory.mockResolvedValue(milbemax([periode({ endsOn: '2026-08-01' })]))
    const wrapper = await monterEdition()

    expect(libelles(wrapper)).toEqual(['Nom du produit', 'Type'])

    await types(wrapper)[2]!.trigger('click')
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ type: 'medication', endsOn: '2026-08-01', nextDoseOn: null }),
    )
  })

  it('garde la date d’une dose en retard et le dit ; changée, elle n’accepte qu’une date à partir d’aujourd’hui', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            frequency: { value: 1, unit: 'week' },
            startsOn: '2026-09-20',
            firstDueOn: '2026-09-20',
            referenceOn: '2026-09-20',
          }),
        ],
        [prise({ dueOn: '2026-09-20', givenOn: '2026-09-20', nextDueDate: '2026-09-27' })],
      ),
    )
    const wrapper = await monterEdition()

    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-27')
    expect(aide(wrapper, 'next-dose-on')).toBe('Dose en retard depuis le 27 sept.')

    await soumettre(wrapper)
    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({ nextDoseOn: '2026-09-27' }),
    )

    const autre = await monterEdition()
    await champ(autre, 'treatment-next-dose-on').setValue('2026-09-26')
    await soumettre(autre)

    expect(messages(autre)).toEqual(['Choisis une date à partir du 28 septembre.'])
  })

  it('annonce les doses qui ne seront plus à renseigner quand la première échéance d’un traitement sans prise change', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            frequency: { value: 1, unit: 'day' },
            startsOn: '2026-09-20',
            firstDueOn: '2026-09-20',
          }),
        ],
        [],
      ),
    )
    const wrapper = await monterEdition()

    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-28')
    expect(aide(wrapper, 'next-dose-on')).toBeUndefined()

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-01')

    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Les 8 doses prévues avant cette date ne seront plus à renseigner.',
    )

    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()

    expect(aide(wrapper, 'next-dose-on')).toBe(
      'The 8 doses scheduled before this date will no longer need to be logged.',
    )
  })

  it('l’annonce au singulier pour une seule dose', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            frequency: { value: 1, unit: 'week' },
            startsOn: '2026-09-27',
            firstDueOn: '2026-09-27',
          }),
        ],
        [],
      ),
    )
    const wrapper = await monterEdition()

    expect(aide(wrapper, 'next-dose-on')).toBe('Dose en retard depuis le 27 sept.')

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-09-30')

    expect(aide(wrapper, 'next-dose-on')).toBe(
      'La dose prévue avant cette date ne sera plus à renseigner.',
    )
  })

  it('refuse une date de fin avant l’arrivée d’un report, et l’accepte quand « Prochaine dose » repasse avant elle', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [periode()],
        [
          prise(),
          prise({
            id: 'd-report',
            dueOn: '2026-10-10',
            givenOn: null,
            status: 'postponed',
            nextDueDate: '2026-10-14',
          }),
        ],
      ),
    )
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-12')

    await soumettre(wrapper)

    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-10-14')
    expect(messages(wrapper)).toEqual(['La prochaine dose est reportée au 14 oct.'])
    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()
    expect(messages(wrapper)).toEqual(['The next dose is postponed to Oct 14.'])
    i18n.global.locale.value = 'fr'
    expect(update).not.toHaveBeenCalled()

    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-11')
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ endsOn: '2026-10-12', nextDoseOn: '2026-10-11' }),
    )
  })

  it('nomme « une dose » quand le report en cause n’est pas celui de la prochaine dose', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            startsOn: '2026-09-11',
            firstDueOn: '2026-09-11',
            frequency: { value: 1, unit: 'week' },
          }),
        ],
        [
          prise({ dueOn: '2026-09-11', givenOn: '2026-09-11', nextDueDate: '2026-09-18' }),
          prise({
            id: 'd-report',
            dueOn: '2026-10-09',
            givenOn: null,
            status: 'postponed',
            nextDueDate: '2026-10-20',
          }),
        ],
      ),
    )
    const wrapper = await monterEdition()
    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-15')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['Une dose est reportée au 20 oct.'])
    expect(update).not.toHaveBeenCalled()

    i18n.global.locale.value = 'en'
    await wrapper.vm.$nextTick()

    expect(messages(wrapper)).toEqual(['A dose is postponed to Oct 20.'])
  })

  it('ne laisse corriger que le nom et le type d’un traitement arrêté', async () => {
    getWithHistory.mockResolvedValue(milbemax([periode({ stoppedOn: '2026-08-01' })]))
    const wrapper = await monterEdition()

    expect(libelles(wrapper)).toEqual(['Nom du produit', 'Type'])

    await champ(wrapper, 'treatment-name').setValue('Milbemax chat')
    await soumettre(wrapper)

    expect(update).toHaveBeenCalledWith(ID, expect.objectContaining({ name: 'Milbemax chat' }))
  })

  function attenduSansFormulaire(wrapper: VueWrapper) {
    expect(wrapper.get('.pushed-screen__title').text()).toBe('')
    expect(wrapper.find('.form-field').exists()).toBe(false)
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  }

  it.each([
    ['modification', monterEdition],
    ['reprise', monterReprise],
  ])(
    'en %s, ne montre ni « Nouveau traitement » ni champ tant que le traitement charge',
    async (_, monter) => {
      getWithHistory.mockReturnValueOnce(new Promise<TreatmentWithHistory>(() => {}))
      const wrapper = await monter()

      attenduSansFormulaire(wrapper)
      expect(wrapper.find('.treatment-form__loading').exists()).toBe(true)
      expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)

      await soumettre(wrapper)

      expect(update).not.toHaveBeenCalled()
      expect(create).not.toHaveBeenCalled()
    },
  )

  it.each([
    ['modification', monterEdition],
    ['reprise', monterReprise],
  ])('en %s, prévient sans formulaire quand le traitement est introuvable', async (_, monter) => {
    getWithHistory.mockResolvedValueOnce(null)
    const wrapper = await monter()

    attenduSansFormulaire(wrapper)
    expect(wrapper.find('.treatment-form__loading').exists()).toBe(false)
    expect(wrapper.get('.form-screen__save-error').text()).toBe('Ce traitement est introuvable.')

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('prévient sans formulaire quand la fiche n’a pas pu être lue, ou est illisible', async () => {
    getWithHistory.mockRejectedValueOnce(new Error('base verrouillée'))
    const wrapper = await monterEdition()

    attenduSansFormulaire(wrapper)
    expect(wrapper.get('.form-screen__save-error').text()).toBe(
      'Ce traitement n’a pas pu être chargé. Réessaie.',
    )

    getWithHistory.mockResolvedValueOnce(milbemax([periode({ times: ['8h'] })]))
    const illisible = await monterEdition()

    attenduSansFormulaire(illisible)
    expect(illisible.get('.form-screen__save-error').text()).toBe(
      'Ce traitement n’a pas pu être chargé. Réessaie.',
    )
    await soumettre(illisible)
    expect(update).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })

  it('écrit l’aide de « Prochaine dose » en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monterEdition()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Edit Milbemax')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Save')
    expect(aide(wrapper, 'next-dose-on')).toBe('Based on the last dose: Oct 10. You can change it.')

    await champ(wrapper, 'treatment-frequency-value').setValue('1')

    expect(aide(wrapper, 'next-dose-on')).toBe(
      'Based on the last dose: Aug 10, already passed; today is suggested. You can change it.',
    )
  })
})

describe('TreatmentFormView — échéances tombées d’une période sans prise', () => {
  const SANS_PRISE = () =>
    milbemax(
      [
        periode({
          startsOn: '2026-09-22',
          firstDueOn: '2026-09-23',
          frequency: { value: 2, unit: 'day' },
        }),
      ],
      [],
    )

  function feuille() {
    return wrapper!.findComponent({ name: 'TreatmentPastDuesSheet' })
  }

  function dansLaFeuille(selector: string): HTMLElement {
    const found = document.body.querySelector<HTMLElement>(selector)
    if (!found) throw new Error(`Rien pour ${selector}`)
    return found
  }

  let wrapper: VueWrapper | null = null

  async function corrigerLaFrequence() {
    getWithHistory.mockResolvedValue(SANS_PRISE())
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    await soumettre(wrapper)
    return wrapper
  }

  beforeEach(() => {
    vi.stubGlobal('visualViewport', {
      addEventListener() {},
      removeEventListener() {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  it('pose la question à « Enregistrer », sans rien écrire', async () => {
    await corrigerLaFrequence()

    expect(update).not.toHaveBeenCalled()
    expect(feuille().props('modelValue')).toBe(true)
    expect(feuille().props('texts')).toMatchObject({
      title: '3 doses étaient prévues avant aujourd’hui',
      text: 'Les 23, 25 et 27 sept., au rythme «\u00a0tous les 2 jours\u00a0».',
      keep: 'Elles restent à renseigner',
      drop: 'Elles n’étaient pas à donner',
    })
    expect(dansLaFeuille('.treatment-past-dues__choice--keep').textContent).toContain(
      'Le nouveau rythme commence aujourd’hui.',
    )
    expect(dansLaFeuille('.treatment-past-dues__choice--drop').textContent).toContain(
      'L’ancien réglage était une erreur.',
    )
  })

  it('« Elles restent à renseigner » enregistre avec ce choix et la prochaine dose que la feuille annonçait', async () => {
    await corrigerLaFrequence()
    expect(feuille().props('texts')).toMatchObject({
      keepHint: 'Le nouveau rythme commence aujourd’hui. Prochaine dose le 28 sept.',
      dropHint: 'L’ancien réglage était une erreur. Prochaine dose le 28 sept.',
    })

    dansLaFeuille('.treatment-past-dues__choice--keep').click()
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({
        frequency: { value: 3, unit: 'day' },
        pastDues: 'keep',
        nextDoseOn: '2026-09-28',
      }),
    )
  })

  it('« Elles n’étaient pas à donner » enregistre avec ce choix', async () => {
    await corrigerLaFrequence()

    dansLaFeuille('.treatment-past-dues__choice--drop').click()
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({ pastDues: 'drop' }),
    )
  })

  it('« Annuler » revient au formulaire : rien d’écrit, saisie gardée', async () => {
    const view = await corrigerLaFrequence()

    dansLaFeuille('.treatment-past-dues__cancel').click()
    await flushPromises()

    expect(update).not.toHaveBeenCalled()
    expect(feuille().props('modelValue')).toBe(false)
    expect(valeur(view, 'treatment-frequency-value')).toBe('3')
    expect(view.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
  })

  it('annonce et écrit la « Prochaine dose » choisie à la main quand elle vaut pour le choix', async () => {
    getWithHistory.mockResolvedValue(SANS_PRISE())
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-05')
    await soumettre(wrapper)

    expect(feuille().props('texts')).toMatchObject({
      keepHint: 'Le nouveau rythme commence aujourd’hui. Prochaine dose le 5 oct.',
      dropHint: 'L’ancien réglage était une erreur. Prochaine dose le 5 oct.',
    })

    dansLaFeuille('.treatment-past-dues__choice--keep').click()
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({ pastDues: 'keep', nextDoseOn: '2026-10-05' }),
    )
  })

  it('annonce et écrit la date calculée du chemin quand la date choisie à la main n’y vaut pas', async () => {
    getWithHistory.mockResolvedValue(SANS_PRISE())
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('3')
    await champ(wrapper, 'treatment-next-dose-on').setValue('2026-10-05')
    await champ(wrapper, 'treatment-ends-on').setValue('2026-10-01')
    await soumettre(wrapper)

    expect(feuille().props('texts')).toMatchObject({
      dropHint: 'L’ancien réglage était une erreur. Prochaine dose le 28 sept.',
    })

    dansLaFeuille('.treatment-past-dues__choice--drop').click()
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({ pastDues: 'drop', nextDoseOn: '2026-09-28', endsOn: '2026-10-01' }),
    )
  })

  it('annonce pour chaque choix la date que ce choix écrit, quand elles diffèrent', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [
          periode({
            startsOn: '2026-09-11',
            firstDueOn: '2026-09-11',
            frequency: { value: 1, unit: 'week' },
          }),
          periode({
            id: '66666666-6666-4666-8666-666666666666',
            startsOn: '2026-09-25',
            firstDueOn: '2026-09-25',
            frequency: { value: 10, unit: 'day' },
            createdAt: '2026-09-25T09:00:00.000Z',
          }),
        ],
        [
          prise({ id: 'a', dueOn: '2026-09-11', givenOn: '2026-09-11', nextDueDate: '2026-09-18' }),
          prise({ id: 'b', dueOn: '2026-09-18', givenOn: '2026-09-18', nextDueDate: '2026-09-25' }),
        ],
      ),
    )
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('20')
    await soumettre(wrapper)

    expect(feuille().props('texts')).toMatchObject({
      title: '1 dose était prévue avant aujourd’hui',
      keepHint: 'Le nouveau rythme commence aujourd’hui. Prochaine dose le 8 oct.',
      dropHint: 'L’ancien réglage était une erreur. Prochaine dose le 28 sept.',
    })

    dansLaFeuille('.treatment-past-dues__choice--keep').click()
    await flushPromises()

    expect(update).toHaveBeenCalledExactlyOnceWith(
      ID,
      expect.objectContaining({ pastDues: 'keep', nextDoseOn: '2026-10-08' }),
    )
  })

  it('dit qu’aujourd’hui est proposé pour un traitement jamais noté', async () => {
    const view = await corrigerLaFrequence()

    expect(valeur(view, 'treatment-next-dose-on')).toBe('2026-09-28')
    expect(aide(view, 'next-dose-on')).toBe('Aujourd’hui est proposé. Modifiable.')

    i18n.global.locale.value = 'en'
    await view.vm.$nextTick()

    expect(aide(view, 'next-dose-on')).toBe('Today is suggested. You can change it.')
  })

  it('repose la question quand les échéances annoncées ont changé depuis la réponse', async () => {
    const view = await corrigerLaFrequence()
    await champ(view, 'treatment-ends-on').setValue('2026-09-20')
    dansLaFeuille('.treatment-past-dues__choice--keep').click()
    await flushPromises()
    expect(messages(view)).toHaveLength(1)
    expect(update).not.toHaveBeenCalled()

    vi.setSystemTime(new Date('2026-09-30T08:00:00'))
    simulateWebResume()
    await view.vm.$nextTick()
    await champ(view, 'treatment-ends-on').setValue('2026-12-31')
    await soumettre(view)

    expect(update).not.toHaveBeenCalled()
    expect(feuille().props('modelValue')).toBe(true)
    expect(feuille().props('texts')).toMatchObject({
      title: '4 doses étaient prévues avant aujourd’hui',
    })
  })

  it('repose la question quand la fréquence change de nouveau', async () => {
    const view = await corrigerLaFrequence()
    dansLaFeuille('.treatment-past-dues__cancel').click()
    await flushPromises()

    await champ(view, 'treatment-frequency-value').setValue('4')
    await soumettre(view)

    expect(update).not.toHaveBeenCalled()
    expect(feuille().props('modelValue')).toBe(true)
  })

  it('pose la question pour des heures seules changées', async () => {
    getWithHistory.mockResolvedValue(SANS_PRISE())
    wrapper = await monterEdition()
    await ajouterHeure(wrapper, '09:00')

    await soumettre(wrapper)

    expect(update).not.toHaveBeenCalled()
    expect(feuille().props('modelValue')).toBe(true)
  })

  it('ne pose aucune question pour la posologie, le nom ou la date de fin', async () => {
    getWithHistory.mockResolvedValue(SANS_PRISE())
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-name').setValue('Autre')
    await champ(wrapper, 'treatment-dose-quantity').setValue('2')
    await champ(wrapper, 'treatment-ends-on').setValue('2026-12-31')

    await soumettre(wrapper)

    expect(feuille().exists()).toBe(false)
    expect(update).toHaveBeenCalledOnce()
  })

  it('ne pose aucune question quand une prise est notée dans la période : nouvelle période sans question (TR-28)', async () => {
    wrapper = await monterEdition()
    await champ(wrapper, 'treatment-frequency-value').setValue('1')

    await soumettre(wrapper)

    expect(feuille().exists()).toBe(false)
    expect(update).toHaveBeenCalledOnce()
  })

  it('ne pose jamais la question à la création ni à la reprise', async () => {
    wrapper = await monterCreation()
    await remplirMinimum(wrapper)
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-09-03')
    await soumettre(wrapper)

    expect(feuille().exists()).toBe(false)
    expect(create).toHaveBeenCalledOnce()
    wrapper.unmount()

    getWithHistory.mockResolvedValue(milbemax([periode({ stoppedOn: '2026-08-01' })]))
    wrapper = await monterReprise()
    await champ(wrapper, 'treatment-frequency-value').setValue('1')
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-09-29')
    await soumettre(wrapper)

    expect(feuille().exists()).toBe(false)
    expect(resume).toHaveBeenCalledOnce()
  })
})

describe('TreatmentFormView — retour vers l’écran d’origine', () => {
  async function monterDepuis(from: string, reminder?: string) {
    routeur = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/', name: 'home', component: Vide },
        { path: '/animals', name: 'animals', component: Vide },
        { path: '/treatments/:id/edit', name: 'treatment-edit', component: Vide },
      ],
    })
    await routeur.push({
      name: 'treatment-edit',
      params: { id: ID },
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
    const reminder = `treatment:${ID}`
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
    expect(update).not.toHaveBeenCalled()
  })

  it('revient au Carnet depuis une origine inconnue', async () => {
    const wrapper = await monterDepuis('ailleurs')

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('ramènera à l’accueil après l’écran d’explication des notifications', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValueOnce(true)
    const wrapper = await monterDepuis('home')

    await soumettre(wrapper)

    expect(replace).toHaveBeenCalledWith({
      name: 'notifications-priming',
      query: { animalName: 'Milo', kind: 'treatment', from: 'home' },
    })
  })
})

describe('TreatmentFormView — reprise (TR-32, planche V7)', () => {
  const PANACUR = periode({
    frequency: { value: 1, unit: 'day' },
    startsOn: '2026-10-06',
    firstDueOn: '2026-10-06',
    referenceOn: '2026-10-06',
    endsOn: '2026-10-10',
    times: ['20:00'],
    doseQuantity: 0.5,
  })
  const DERNIERE = prise({
    dueOn: '2026-10-10',
    dueTime: '20:00',
    givenOn: '2026-10-10',
    nextDueDate: '2026-10-11',
  })

  function panacur(periods = [PANACUR]): TreatmentWithHistory {
    return { ...milbemax(periods, [DERNIERE]), name: 'Panacur' }
  }

  beforeEach(() => {
    vi.setSystemTime(new Date('2026-11-02T09:41:00'))
    getWithHistory.mockResolvedValue(panacur())
  })

  it('titre « Reprendre Panacur », bouton « Reprendre », sans nom ni type', async () => {
    const wrapper = await monterReprise()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Reprendre Panacur')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Reprendre')
    expect(libelles(wrapper)).toEqual([
      'Fréquence',
      'Première prise le',
      'Heures du traitement',
      'Rappel',
      'Posologie',
      'Date de fin',
    ])
    expect(wrapper.find('#treatment-name').exists()).toBe(false)
  })

  it('reprend le rappel de la dernière période et l’écrit avec la reprise', async () => {
    getWithHistory.mockResolvedValue(panacur([{ ...PANACUR, reminderOffsetMinutes: 60 }]))
    const wrapper = await monterReprise()

    expect(wrapper.get('.treatment-reminder__choice[aria-checked="true"]').text()).toBe('1 h avant')

    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-11-03')
    await soumettre(wrapper)

    expect(resume.mock.calls[0]![1]).toMatchObject({ reminderOffsetMinutes: 60 })
  })

  it('reprend les réglages de la dernière période, tous modifiables, et le dit', async () => {
    const wrapper = await monterReprise()

    expect(wrapper.get('.treatment-form__info').text()).toBe(
      'Réglages de la dernière période, du 6 oct. au 10 oct. Tout reste modifiable.',
    )
    expect(valeur(wrapper, 'treatment-frequency-value')).toBe('1')
    expect(uniteCochee(wrapper)).toBe('day')
    expect(heures(wrapper)).toEqual(['20\u00a0h'])
    expect(valeur(wrapper, 'treatment-dose-quantity')).toBe('½')
    expect(unite(wrapper).props('modelValue')).toBe('tablet')
  })

  it('demande la première prise : vide au départ, « Reprendre » indisponible tant qu’elle manque', async () => {
    const wrapper = await monterReprise()

    expect(valeur(wrapper, 'treatment-first-dose-on')).toBe('')
    expect(valeur(wrapper, 'treatment-ends-on')).toBe('')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(aide(wrapper, 'ends-on')).toBe('Même durée que la dernière fois\u00a0: 5 jours.')

    await soumettre(wrapper)

    expect(resume).not.toHaveBeenCalled()
  })

  it('propose une date de fin de même durée dès que la première prise est choisie (V7 bis)', async () => {
    const wrapper = await monterReprise()

    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-11-03')

    expect(valeur(wrapper, 'treatment-ends-on')).toBe('2026-11-07')
    expect(aide(wrapper, 'ends-on')).toBe(
      '5 jours, comme la dernière fois. Aucune dose ne sera prévue après cette date.',
    )
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeUndefined()
  })

  it('garde une date de fin choisie à la main quand la première prise change', async () => {
    const wrapper = await monterReprise()
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-11-03')
    await champ(wrapper, 'treatment-ends-on').setValue('2026-11-20')

    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-11-05')

    expect(valeur(wrapper, 'treatment-ends-on')).toBe('2026-11-20')
    expect(aide(wrapper, 'ends-on')).toBe('Aucune dose ne sera prévue après cette date.')
  })

  it('reprend par le store avec la première prise choisie, sans nom ni type, puis revient au détail', async () => {
    routeur = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/animals', name: 'animals', component: Vide },
        { path: '/treatments/:id', name: 'treatment-detail', component: Vide },
        { path: '/treatments/:id/resume', name: 'treatment-resume', component: Vide },
      ],
    })
    await routeur.push({
      name: 'treatment-resume',
      params: { id: ID },
      query: { from: 'treatment-detail', reminder: `treatment:${ID}` },
    })
    replace = vi.spyOn(routeur, 'replace').mockResolvedValue()
    const wrapper = await monterReprise()
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-11-03')

    await soumettre(wrapper)

    expect(resume).toHaveBeenCalledExactlyOnceWith(ID, {
      firstDoseOn: '2026-11-03',
      frequency: { value: 1, unit: 'day' },
      times: ['20:00'],
      doseQuantity: 0.5,
      doseUnit: 'tablet',
      endsOn: '2026-11-07',
    })
    expect(update).not.toHaveBeenCalled()
    expect(replace).toHaveBeenCalledWith({ name: 'treatment-detail', params: { id: ID } })
  })

  it('borne le sélecteur de la première prise à la première date acceptée, et la dit en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monterReprise()

    expect(champ(wrapper, 'treatment-first-dose-on').attributes('min')).toBe('2026-10-11')

    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-10-10')
    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['The first dose can be on Oct 11 at the earliest.'])
  })

  it('refuse une première prise avant la fin de la dernière période', async () => {
    const wrapper = await monterReprise()
    await champ(wrapper, 'treatment-first-dose-on').setValue('2026-10-10')

    await soumettre(wrapper)

    expect(messages(wrapper)).toEqual(['La première prise est possible à partir du 11 oct.'])
    expect(resume).not.toHaveBeenCalled()
  })

  it('date la dernière période de son arrêt, sans durée à reprendre, pour un traitement arrêté', async () => {
    getWithHistory.mockResolvedValue(
      panacur([{ ...PANACUR, endsOn: null, stoppedOn: '2026-10-12' }]),
    )
    const wrapper = await monterReprise()

    expect(wrapper.get('.treatment-form__info').text()).toBe(
      'Réglages de la dernière période, du 6 oct. au 12 oct. Tout reste modifiable.',
    )
    expect(aide(wrapper, 'ends-on')).toBe('Aucune dose ne sera prévue après cette date.')
  })

  it('ne reprend pas un traitement en cours', async () => {
    getWithHistory.mockResolvedValue(panacur([{ ...PANACUR, endsOn: null }]))
    const wrapper = await monterReprise()

    expect(wrapper.get('.form-screen__save-error').text()).toBe('Ce traitement est introuvable.')
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
  })

  it('écrit la reprise en anglais', async () => {
    i18n.global.locale.value = 'en'
    const wrapper = await monterReprise()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Resume Panacur')
    expect(wrapper.get('.form-screen__submit').text()).toBe('Resume')
    expect(wrapper.get('.treatment-form__info').text()).toBe(
      'Settings from the last period, Oct 6 – Oct 10. Everything can be changed.',
    )
    expect(aide(wrapper, 'ends-on')).toBe('Same length as last time: 5 days.')
  })

  it('ouvre la reprise depuis l’identifiant du traitement', () => {
    const route = router.resolve(`/treatments/${ID}/resume`)
    const props = route.matched[0]!.props.default as (r: typeof route) => unknown

    expect(route.name).toBe('treatment-resume')
    expect(props(route)).toEqual({ id: ID, resume: true })
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

    terminer(ECRIT)
    await flushPromises()
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

  it('ne permet plus aucune écriture après une écriture réussie, « Annuler » restant utilisable', async () => {
    const wrapper = await monterCreation()
    await remplirMinimum(wrapper)

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
    expect(wrapper.get('.form-screen__cancel').attributes('disabled')).toBeUndefined()
    expect(create).toHaveBeenCalledOnce()
  })

  it('ne reste pas bloqué quand la navigation de retour échoue : pas de message d’échec, pas de seconde écriture', async () => {
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

    await soumettre(wrapper)
    await soumettre(wrapper)

    expect(create).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledExactlyOnceWith({ name: 'animals' })
    expect(wrapper.find('.form-screen__save-error').exists()).toBe(false)
    expect(wrapper.get('.form-screen__submit').attributes('disabled')).toBeDefined()
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
    const route = router.resolve(`/treatments/${ID}/edit`)

    expect(route.name).toBe('treatment-edit')
    expect(route.params).toEqual({ id: ID })
    expect(route.matched[0]?.props.default).toBe(true)
  })
})

describe('TreatmentFormView — changement de jour', () => {
  it('repropose « Prochaine dose » d’après le nouveau jour après un retour au premier plan', async () => {
    getWithHistory.mockResolvedValue(
      milbemax(
        [periode({ frequency: { value: 1, unit: 'day' } })],
        [prise({ dueOn: '2026-09-27', givenOn: '2026-09-27', nextDueDate: '2026-09-28' })],
      ),
    )
    const wrapper = await monterEdition()
    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-28')

    vi.setSystemTime(new Date('2026-09-30T08:00:00'))
    simulateWebResume()
    await wrapper.vm.$nextTick()

    expect(champ(wrapper, 'treatment-next-dose-on').attributes('min')).toBe('2026-09-30')
    expect(valeur(wrapper, 'treatment-next-dose-on')).toBe('2026-09-30')
  })
})
