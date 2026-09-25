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

import { fakeTreatmentsRepository } from './fake-treatments-repository'
import TreatmentDetailView from '../views/TreatmentDetailView.vue'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'
import type { TreatmentDosesService } from '../service/treatment-doses.service'
import type { TreatmentStopService } from '../service/treatment-stop.service'
import {
  provideTreatmentDosesService,
  provideTreatmentRemindersService,
  provideTreatmentStopService,
  provideTreatmentsRepository,
} from '../store/treatments.store'
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

const BRAVECTO: Treatment = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: BOREE.id,
  name: 'Bravecto',
  type: 'deworming',
  frequency: { value: 1, unit: 'month' },
  lastDoseDate: '2026-08-28',
  nextDueDate: '2026-09-28',
  stoppedOn: null,
  ...STAMPS,
}

const MILBEMAX: Treatment = {
  ...BRAVECTO,
  name: 'Milbemax',
  frequency: { value: 15, unit: 'day' },
  lastDoseDate: '2026-05-21',
  nextDueDate: '2026-06-05',
  stoppedOn: '2026-05-26',
}

function dose(id: string, givenOn: string, nextDueDate = '2026-09-28'): TreatmentDose {
  return {
    id,
    treatmentId: BRAVECTO.id,
    animalId: BOREE.id,
    givenOn,
    nextDueDate,
    frequency: { value: 1, unit: 'month' },
    ...STAMPS,
  }
}

const QUATRE = [
  dose('p4', '2026-08-28'),
  dose('p3', '2026-07-28'),
  dose('p2', '2026-06-28'),
  dose('p1', '2026-05-30'),
]

/** Une prise par mois, la plus récente d'abord. */
function mensuelles(count: number): TreatmentDose[] {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(2026, 7 - index, 28)
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-28`
    return dose(`m${index}`, iso)
  })
}

let treatment: Treatment
let doses: TreatmentDose[]
let remove: MockInstance
let push: MockInstance
let service: {
  [K in 'record' | 'undo' | 'remove' | 'undoRemove' | 'changeDate' | 'undoChangeDate']: Mock<
    TreatmentDosesService[K]
  >
}
let stop: { [K in 'stop' | 'undo']: Mock<TreatmentStopService[K]> }
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
  treatment = BRAVECTO
  doses = QUATRE
  const repository = fakeTreatmentsRepository({
    getById: async (id) => (id === treatment.id ? treatment : null),
    listDoses: async () => doses,
    remove: async () => {},
  })
  remove = repository.remove
  provideTreatmentsRepository(() => repository)
  provideTreatmentRemindersService(() => ({
    reschedule: vi.fn<(id: string) => Promise<void>>(async () => {}),
  }))
  service = {
    record: vi.fn<TreatmentDosesService['record']>(async () => ({
      animalId: BOREE.id,
      doseId: 'p5',
    })),
    undo: vi.fn<TreatmentDosesService['undo']>(async () => {}),
    remove: vi.fn<TreatmentDosesService['remove']>(async () => {}),
    undoRemove: vi.fn<TreatmentDosesService['undoRemove']>(async () => {}),
    changeDate: vi.fn<TreatmentDosesService['changeDate']>(async () => ({
      givenOn: '2026-08-28',
      nextDueDate: '2026-09-28',
      frequency: { value: 1, unit: 'month' },
    })),
    undoChangeDate: vi.fn<TreatmentDosesService['undoChangeDate']>(async () => {}),
  }
  provideTreatmentDosesService(() => service)
  stop = {
    stop: vi.fn<TreatmentStopService['stop']>(async () => ({ animalId: BOREE.id, stopped: true })),
    undo: vi.fn<TreatmentStopService['undo']>(async () => {}),
  }
  provideTreatmentStopService(() => stop)
  await router.push({ name: 'animals' })
  await router.push({ name: 'treatment-detail', params: { id: BRAVECTO.id } })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  document.body.innerHTML = ''
  provideTreatmentsRepository(null)
  provideTreatmentRemindersService(null)
  provideTreatmentDosesService(null)
  provideTreatmentStopService(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(id = treatment.id) {
  wrapper = mount(TreatmentDetailView, {
    props: { id },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function dates(view: VueWrapper): string[] {
  return view.findAllComponents(HistoryRow).map((row) => row.props('date'))
}

async function choisir(view: VueWrapper, index: number, action: string) {
  view.findAllComponents(HistoryRow)[index]!.vm.$emit('select', action)
  await flushPromises()
}

function dialogue(view: VueWrapper, title: string) {
  const found = view
    .findAllComponents(ConfirmDialog)
    .find((candidate) => candidate.props('title') === title)
  if (!found) throw new Error(`Pas de dialogue « ${title} »`)
  return found
}

describe('TreatmentDetailView — F8, traitement en cours', () => {
  it('présente la fréquence, la prochaine dose et la dernière prise, toujours visible', async () => {
    const view = await monter()

    expect(view.get('.pushed-screen__title').text()).toBe('Bravecto')
    expect(view.get('.pushed-screen__subtitle').text()).toBe('Vermifuge · Boree')
    expect(view.get('.treatment-detail__frequency').text()).toBe('Tous les mois')
    expect(view.getComponent(NextDueCard).props()).toMatchObject({
      label: 'Prochaine dose',
      date: '28 sept. 2026',
      delay: 'dans 5 jours',
    })
    expect(view.get('.section-card__title').text()).toBe('Prises')
    expect(view.get('.section-card__counter').text()).toBe('4 depuis mai 2026')
    const tete = view.getComponent(HistoryRow)
    expect(tete.props()).toMatchObject({
      date: '28 août 2026',
      badge: 'Dernière prise',
      detail: 'A fixé la dose du 28 sept.',
    })
    expect(dates(view)).toEqual(['28 août 2026'])
    expect(view.get('.treatment-detail__stop').text()).toBe('Arrêter ce traitement')
  })

  it('montre puis masque les prises précédentes', async () => {
    const view = await monter()
    const bouton = view.get('.treatment-detail__toggle')
    expect(bouton.text()).toBe('Voir les 3 prises précédentes')
    expect(bouton.attributes('aria-expanded')).toBe('false')

    await bouton.trigger('click')

    expect(dates(view)).toEqual(['28 août 2026', '28 juil. 2026', '28 juin 2026', '30 mai 2026'])
    expect(view.findAllComponents(HistoryRow).map((row) => row.props('regular'))).toEqual([
      false,
      true,
      true,
      true,
    ])
    expect(view.get('.treatment-detail__toggle').text()).toBe('Masquer les prises précédentes')
    await view.get('.treatment-detail__toggle').trigger('click')
    expect(dates(view)).toEqual(['28 août 2026'])
  })

  it('au-delà de 12 prises, les regroupe par année, chaque année dépliable', async () => {
    doses = mensuelles(20)
    const view = await monter()
    await view.get('.treatment-detail__toggle').trigger('click')

    const annees = view.findAll('.treatment-detail__year')
    expect(annees.map((annee) => annee.text())).toEqual(['2026 · 7 prises', '2025 · 12 prises'])
    expect(dates(view)).toEqual(['28 août 2026'])

    await annees[1]!.trigger('click')

    expect(annees[1]!.attributes('aria-expanded')).toBe('true')
    expect(dates(view)).toHaveLength(13)
    expect(dates(view)[1]).toBe('28 déc. 2025')
  })

  it('« C’est fait » note la prise du jour, toast avec « Annuler »', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('done')
    await flushPromises()

    expect(service.record).toHaveBeenCalledWith(BRAVECTO.id, '2026-09-23')
    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    runToastAction()
    await flushPromises()
    expect(service.undo).toHaveBeenCalledWith(BRAVECTO.id, 'p5')
  })

  it('« Modifier » ouvre le formulaire, qui reviendra sur le détail', async () => {
    const view = await monter()

    view.getComponent(NextDueCard).vm.$emit('edit')

    expect(push).toHaveBeenCalledWith({
      name: 'treatment-edit',
      params: { id: BRAVECTO.id },
      query: { from: 'treatment-detail', reminder: `treatment:${BRAVECTO.id}` },
    })
  })

  it('arrête le traitement après confirmation (F6)', async () => {
    const view = await monter()

    await view.get('.treatment-detail__stop').trigger('click')
    const arret = dialogue(view, 'Arrêter Bravecto ?')
    expect(arret.props('modelValue')).toBe(true)
    arret.vm.$emit('confirm')
    await flushPromises()

    expect(stop.stop).toHaveBeenCalledWith(BRAVECTO.id)
    expect(toastMessage.value).toBe('Bravecto arrêté. Il est dans Traitements terminés.')
  })
})

describe('TreatmentDetailView — prise supprimée ou redatée', () => {
  it('supprime la dernière prise sans dialogue, toast avec « Annuler »', async () => {
    const view = await monter()

    await choisir(view, 0, 'remove')

    expect(service.remove).toHaveBeenCalledWith(BRAVECTO.id, 'p4')
    expect(toastMessage.value).toBe('Prise du 28 août supprimée')
    expect(toastAction.value?.label).toBe('Annuler')
    runToastAction()
    await flushPromises()
    expect(service.undoRemove).toHaveBeenCalledWith(BRAVECTO.id, 'p4')
  })

  it('change la date d’une prise, jamais sur le jour d’une autre, et l’annule', async () => {
    const view = await monter()

    await choisir(view, 0, 'changeDate')
    const calendrier = view.getComponent(DatePickerSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      subtitle: 'Prise du 28 août 2026',
      date: '2026-08-28',
      min: '2026-04-10',
      max: '2026-09-23',
      excluded: ['2026-07-28', '2026-06-28', '2026-05-30'],
    })
    calendrier.vm.$emit('pick', '2026-08-26')
    await flushPromises()

    expect(service.changeDate).toHaveBeenCalledWith(BRAVECTO.id, 'p4', '2026-08-26')
    expect(toastMessage.value).toBe('Prise déplacée au 26 août')
    runToastAction()
    await flushPromises()
    expect(service.undoChangeDate).toHaveBeenCalledWith(BRAVECTO.id, 'p4', {
      givenOn: '2026-08-28',
      nextDueDate: '2026-09-28',
      frequency: { value: 1, unit: 'month' },
    })
  })

  it('propose de supprimer le traitement quand on supprime sa seule prise', async () => {
    doses = [dose('p4', '2026-08-28')]
    const view = await monter()

    await choisir(view, 0, 'remove')

    expect(service.remove).not.toHaveBeenCalled()
    expect(dialogue(view, 'Supprimer Bravecto ?').props()).toMatchObject({
      modelValue: true,
      text: 'C’est sa seule prise : le traitement Bravecto sera supprimé, avec ses rappels. Cette action est définitive.',
    })
  })

  it('supprime le traitement depuis le menu du détail et revient au Carnet', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()

    view.findAllComponents(OverflowMenu)[0]!.vm.$emit('select', 'remove')
    await flushPromises()
    const suppression = dialogue(view, 'Supprimer Bravecto ?')
    expect(suppression.props('text')).toBe(
      'Ses prises et ses rappels seront supprimés du carnet. Cette action est définitive.',
    )
    suppression.vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(BRAVECTO.id)
    expect(toastMessage.value).toBe('Traitement Bravecto supprimé')
    expect(back).toHaveBeenCalled()
  })
})

describe('TreatmentDetailView — F9 ter, traitement terminé', () => {
  beforeEach(() => {
    treatment = MILBEMAX
    doses = [dose('m2', '2026-05-21', '2026-06-05'), dose('m1', '2026-05-07', '2026-05-22')]
  })

  it('dit l’arrêt, l’ancienne fréquence et liste toutes ses prises, sans prochaine dose', async () => {
    const view = await monter()

    expect(view.findComponent(NextDueCard).exists()).toBe(false)
    expect(view.get('.treatment-detail__stopped-notice').text()).toBe(
      'Arrêté le 26 mai 2026. Aucun rappel.',
    )
    expect(view.get('.treatment-detail__frequency--past').text()).toBe('Était tous les 15 jours')
    expect(view.get('.section-card__counter').text()).toBe('2')
    expect(dates(view)).toEqual(['21 mai 2026', '7 mai 2026'])
    expect(view.findComponent(HistoryRow).props('badge')).toBeNull()
    expect(view.findAllComponents(HistoryRow).map((row) => row.props('regular'))).toEqual([
      false,
      false,
    ])
    expect(view.find('.treatment-detail__toggle').exists()).toBe(false)
    expect(view.find('.treatment-detail__stop').exists()).toBe(false)
  })

  it('« Reprendre ce traitement » ouvre la reprise, qui reviendra sur le détail', async () => {
    const view = await monter()

    expect(view.get('.treatment-detail__resume-hint').text()).toBe(
      'Tu choisiras la date de la prochaine dose.',
    )
    await view.get('.treatment-detail__resume-button').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'treatment-resume',
      params: { id: MILBEMAX.id },
      query: { from: 'treatment-detail', reminder: `treatment:${MILBEMAX.id}` },
    })
  })
})
