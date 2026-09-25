import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest'

import { fakeVaccinationsRepository } from './fake-vaccinations-repository'
import VaccinationDetailView from '../views/VaccinationDetailView.vue'
import VaccinationReminderSheet from '../views/VaccinationReminderSheet.vue'
import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'
import type { VaccinationInjectionsService } from '../service/vaccination-injections.service'
import {
  provideVaccinationInjectionsService,
  provideVaccinationRemindersService,
  provideVaccinationsRepository,
} from '../store/vaccinations.store'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import router from '@/router'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import NextDueCard from '@/shared/components/NextDueCard.vue'
import OverflowMenu from '@/shared/components/OverflowMenu.vue'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'

const TODAY = new Date('2026-09-23T10:00:00')

const BOREE: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Boree',
  species: 'dog',
  breed: 'Bouvier bernois',
  birthDate: '2026-04-10',
  initialWeightKg: null,
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const STAMPS = {
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const CARRE: Vaccination = {
  id: '55555555-5555-4555-8555-555555555555',
  animalId: BOREE.id,
  name: 'Carré',
  lastInjectionDate: '2026-08-26',
  dueDate: '2027-08-26',
  ...STAMPS,
}

function injection(id: string, injectedOn: string, nextDueDate: string | null) {
  return {
    id,
    vaccinationId: CARRE.id,
    animalId: BOREE.id,
    injectedOn,
    nextDueDate,
    ...STAMPS,
  } satisfies VaccinationInjection
}

const INJECTIONS = [
  injection('i3', '2026-08-26', '2027-08-26'),
  injection('i2', '2026-07-27', '2026-08-26'),
  injection('i1', '2026-06-28', '2026-07-27'),
]

let injections: VaccinationInjection[]
let getById: MockInstance
let remove: MockInstance
let service: {
  [K in 'record' | 'undo' | 'remove' | 'undoRemove' | 'changeDate' | 'undoChangeDate']: Mock<
    VaccinationInjectionsService[K]
  >
}
let push: MockInstance
let wrapper: VueWrapper | null = null

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
  setActivePinia(createPinia())
  const animals = useAnimalsStore()
  animals.animals = [BOREE]
  animals.hasLoaded = true
  injections = INJECTIONS
  const repository = fakeVaccinationsRepository({
    getById: async (id) => (id === CARRE.id ? CARRE : null),
    listInjections: async () => injections,
    remove: async () => {},
  })
  getById = repository.getById
  remove = repository.remove
  provideVaccinationsRepository(() => repository)
  provideVaccinationRemindersService(() => ({ reschedule: vi.fn(async () => {}) }))
  service = {
    record: vi.fn<VaccinationInjectionsService['record']>(),
    undo: vi.fn<VaccinationInjectionsService['undo']>(),
    remove: vi.fn<VaccinationInjectionsService['remove']>(async () => {}),
    undoRemove: vi.fn<VaccinationInjectionsService['undoRemove']>(async () => {}),
    changeDate: vi.fn<VaccinationInjectionsService['changeDate']>(async () => ({
      injectedOn: '2026-07-27',
      nextDueDate: '2026-08-26',
    })),
    undoChangeDate: vi.fn<VaccinationInjectionsService['undoChangeDate']>(async () => {}),
  }
  provideVaccinationInjectionsService(() => service)
  await router.push({ name: 'animals' })
  await router.push({ name: 'vaccination-detail', params: { id: CARRE.id } })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  document.body.innerHTML = ''
  provideVaccinationsRepository(null)
  provideVaccinationRemindersService(null)
  provideVaccinationInjectionsService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(id = CARRE.id) {
  wrapper = mount(VaccinationDetailView, {
    props: { id },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function lignes(view: VueWrapper) {
  return view.findAllComponents(HistoryRow)
}

async function choisir(view: VueWrapper, index: number, action: string) {
  lignes(view)[index]!.vm.$emit('select', action)
  await flushPromises()
}

function dialogue(view: VueWrapper) {
  return view.getComponent(ConfirmDialog)
}

describe('VaccinationDetailView — F7', () => {
  it('présente le vaccin, son prochain rappel et ses injections', async () => {
    const view = await monter()

    expect(view.get('.pushed-screen__title').text()).toBe('Carré')
    expect(view.get('.pushed-screen__subtitle').text()).toBe('Vaccin · Boree')
    expect(view.getComponent(NextDueCard).props()).toMatchObject({
      label: 'Prochain rappel',
      date: '26 août 2027',
      delay: 'dans 11 mois',
      overdue: false,
    })
    expect(view.get('.section-card__title').text()).toBe('Injections')
    expect(view.get('.section-card__counter').text()).toBe('3')
    expect(lignes(view).map((row) => [row.props('date'), row.props('detail')])).toEqual([
      ['26 août 2026', 'Rappel choisi : dans 1 an'],
      ['27 juil. 2026', 'Rappel choisi : autre date, 26 août 2026'],
      ['28 juin 2026', 'Rappel choisi : autre date, 27 juil. 2026'],
    ])
    expect(lignes(view)[1]!.props('optionsLabel')).toBe(
      'Options pour l’injection du 27 juillet 2026',
    )
    expect(
      lignes(view)[0]!
        .props('items')
        .map(({ label }) => label),
    ).toEqual(['Changer la date', 'Supprimer cette injection'])
  })

  it('« C’est fait » ouvre la feuille « Fait » du vaccin (F5)', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('done')
    await flushPromises()

    expect(view.getComponent(VaccinationReminderSheet).props()).toMatchObject({
      modelValue: true,
      vaccinationId: CARRE.id,
      startAt: 'done',
    })
  })

  it('« Modifier » ouvre le formulaire, qui reviendra sur le détail', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('edit')

    expect(push).toHaveBeenCalledWith({
      name: 'vaccination-edit',
      params: { id: CARRE.id },
      query: { from: 'vaccination-detail', reminder: `vaccination:${CARRE.id}` },
    })
  })

  it('dit « Pas de rappel programmé » quand le dernier choix était « Pas de rappel »', async () => {
    getById.mockResolvedValue({ ...CARRE, dueDate: null })
    const view = await monter()

    expect(view.getComponent(NextDueCard).props()).toMatchObject({
      date: null,
      emptyText: 'Pas de rappel programmé',
    })
  })

  it('dit quand le vaccin est introuvable', async () => {
    const view = await monter('99999999-9999-4999-8999-999999999999')

    expect(view.get('[role="alert"]').text()).toBe('Ce vaccin est introuvable.')
  })
})

describe('VaccinationDetailView — injection supprimée ou redatée', () => {
  it('supprime une injection sans dialogue, toast avec « Annuler » qui la rétablit', async () => {
    const view = await monter()

    await choisir(view, 1, 'remove')

    expect(service.remove).toHaveBeenCalledWith(CARRE.id, 'i2')
    expect(view.findComponent(ConfirmDialog).props('modelValue')).toBe(false)
    expect(toastMessage.value).toBe('Injection du 27 juil. supprimée')
    expect(toastAction.value?.ariaLabel).toBe(
      'Annuler la suppression de l’injection du 27 juillet 2026',
    )

    runToastAction()
    await flushPromises()
    expect(service.undoRemove).toHaveBeenCalledWith(CARRE.id, 'i2')
  })

  it('change la date d’une injection par le calendrier, dans ses bornes, et l’annule', async () => {
    const view = await monter()

    await choisir(view, 1, 'changeDate')
    const calendrier = view.getComponent(DatePickerSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      title: 'Changer la date',
      subtitle: 'Injection du 27 juil. 2026',
      date: '2026-07-27',
      min: '2026-04-10',
      max: '2026-09-23',
      excluded: ['2026-08-26', '2026-06-28'],
    })

    calendrier.vm.$emit('pick', '2026-07-25')
    await flushPromises()

    expect(service.changeDate).toHaveBeenCalledWith(CARRE.id, 'i2', '2026-07-25')
    expect(toastMessage.value).toBe('Injection déplacée au 25 juil.')
    runToastAction()
    await flushPromises()
    expect(service.undoChangeDate).toHaveBeenCalledWith(CARRE.id, 'i2', {
      injectedOn: '2026-07-27',
      nextDueDate: '2026-08-26',
    })
  })

  it('dit l’échec d’une suppression', async () => {
    service.remove.mockRejectedValue(new Error('base verrouillée'))
    const view = await monter()

    await choisir(view, 1, 'remove')

    expect(toastMessage.value).toBe('La modification n’a pas abouti. Réessaie.')
  })
})

describe('VaccinationDetailView — suppression du vaccin', () => {
  it('propose de supprimer le vaccin quand on supprime sa seule injection', async () => {
    injections = [injection('i3', '2026-08-26', '2027-08-26')]
    const view = await monter()

    await choisir(view, 0, 'remove')

    expect(service.remove).not.toHaveBeenCalled()
    expect(dialogue(view).props()).toMatchObject({
      modelValue: true,
      title: 'Supprimer Carré ?',
      text: 'C’est sa seule injection : le vaccin Carré sera supprimé, avec ses rappels. Cette action est définitive.',
      cancelLabel: 'Annuler',
      confirmLabel: 'Supprimer',
      tone: 'danger',
    })
  })

  it('supprime le vaccin depuis le menu du détail, après confirmation, et revient au Carnet', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()

    view.findAllComponents(OverflowMenu)[0]!.vm.$emit('select', 'remove')
    await flushPromises()
    expect(dialogue(view).props()).toMatchObject({
      modelValue: true,
      title: 'Supprimer Carré ?',
      text: 'Ses injections et ses rappels seront supprimés du carnet. Cette action est définitive.',
    })
    expect(
      view
        .findAllComponents(OverflowMenu)[0]!
        .props('items')
        .map(({ label }) => label),
    ).toEqual(['Supprimer ce vaccin'])

    dialogue(view).vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(CARRE.id)
    expect(toastMessage.value).toBe('Carré supprimé')
    expect(back).toHaveBeenCalled()
  })

  it('ne supprime rien quand on annule le dialogue', async () => {
    const view = await monter()

    view.findAllComponents(OverflowMenu)[0]!.vm.$emit('select', 'remove')
    await flushPromises()
    dialogue(view).vm.$emit('cancel')

    expect(remove).not.toHaveBeenCalled()
  })
})

describe('VaccinationDetailView — retour', () => {
  it('revient au Carnet sur l’animal du vaccin', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()

    await view.get('.pushed-screen__back').trigger('click')

    expect(useAnimalsStore().selectedAnimalId).toBe(BOREE.id)
    expect(back).toHaveBeenCalled()
  })
})
