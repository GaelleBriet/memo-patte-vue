import { flushPromises, mount } from '@vue/test-utils'
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

import AnimalPhotoSheet from '../views/AnimalPhotoSheet.vue'
import AnimalPhotoViewer from '../views/AnimalPhotoViewer.vue'
import CarnetView from '../views/CarnetView.vue'
import type { Animal } from '../schema/animal.schema'
import { provideAnimalsRepository, useAnimalsStore } from '../store/animals.store'
import type { AnimalsRepository } from '../repository/animals.repository'
import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import i18n from '@/core/i18n'
import router from '@/router'
import vuetify from '@/core/theme/vuetify'
import AnimalChipSelector from '@/shared/components/AnimalChipSelector.vue'
import type {
  TreatmentsRepository,
  TreatmentWithHistory,
} from '@/features/treatments/repository/treatments.repository'
import { provideTreatmentsRepository } from '@/features/treatments/store/treatments.store'
import { fakeTreatmentsRepository } from '@/features/treatments/__tests__/fake-treatments-repository'
import {
  period,
  treatment as treatmentWith,
} from '@/features/treatments/__tests__/treatment-fixtures'
import TreatmentsSection from '@/features/treatments/views/TreatmentsSection.vue'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import type { VaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { provideVaccinationsRepository } from '@/features/vaccinations/store/vaccinations.store'
import { fakeVaccinationsRepository } from '@/features/vaccinations/__tests__/fake-vaccinations-repository'
import VaccinationsSection from '@/features/vaccinations/views/VaccinationsSection.vue'
import type { WeightEntry } from '@/features/weight/schema/weight.schema'
import type { WeightRepository } from '@/features/weight/repository/weight.repository'
import { provideWeightRepository } from '@/features/weight/store/weight.store'
import { fakeWeightRepository } from '@/features/weight/__tests__/fake-weight-repository'
import WeightSection from '@/features/weight/views/WeightSection.vue'
import { pickPhoto, type PickedPhoto } from '@/core/photos/photo-picker'
import { forgetPhotoUrls } from '@/core/photos/use-photo-urls'
import { memoryStorage } from '@/features/purchase/__tests__/billing-fixture'
import PdfExportSheet from '@/features/settings/views/PdfExportSheet.vue'
import { toKg } from '@/shared/domain/weight-unit'
import { applyWeightUnit } from '@/shared/domain/weight-unit-preference'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastAnnouncement,
  toastMessage,
} from '@/shared/utils/toast'

vi.mock('@/core/photos/photo-picker', () => ({
  pickPhoto: vi.fn<() => Promise<PickedPhoto | null>>(),
}))

const choisirPhoto = vi.mocked(pickPhoto)

vi.mock('@/core/photos/photo-storage', () => ({
  savePhoto: vi.fn<(base64: string) => Promise<string>>(),
  deletePhoto: vi.fn<(name: string) => Promise<void>>(),
  photoDisplayUrl: vi.fn<(name: string) => Promise<string>>(async (name) => `url:${name}`),
}))

const TODAY = new Date('2026-09-09T12:00:00')

function animal(id: string, name: string, overrides: Partial<Animal> = {}): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    photoPath: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
    unfollowedOn: null,
    ...overrides,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111', 'Milo', {
  breed: 'Golden retriever',
  birthDate: '2022-03-12',
})
const LUNA = animal('33333333-3333-4333-8333-333333333333', 'Luna', { species: 'cat' })

const STAMPS = {
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

function vaccination(animalId: string, dueDate: string | null): Vaccination {
  return {
    id: crypto.randomUUID(),
    animalId,
    name: 'Rage',
    lastInjectionDate: '2025-12-12',
    dueDate,
    ...STAMPS,
  }
}

/** Trimestriel sans prise : sa première dose, `firstDueOn`, est la dose du moment. */
function treatment(animalId: string, firstDueOn: string): TreatmentWithHistory {
  const id = crypto.randomUUID()
  return {
    ...treatmentWith([
      period({
        id,
        treatmentId: id,
        animalId,
        startsOn: firstDueOn,
        firstDueOn,
        frequency: { value: 3, unit: 'month' },
      }),
    ]),
    id,
    animalId,
    name: 'Bravecto',
    type: 'antiparasitic',
  }
}

function weight(animalId: string, weightKg: number, measuredOn: string): WeightEntry {
  return { id: crypto.randomUUID(), animalId, weightKg, measuredOn, ...STAMPS }
}

let store: ReturnType<typeof useAnimalsStore>
let animals: Animal[]
let vaccinations: Vaccination[]
let treatments: TreatmentWithHistory[]
let weights: WeightEntry[]
let load: MockInstance
let push: MockInstance
let listVaccinations: Mock<VaccinationsRepository['listByAnimal']>
let listTreatments: Mock<TreatmentsRepository['listWithHistoryByAnimal']>
let listWeights: Mock<WeightRepository['listByAnimal']>

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  forgetPhotoUrls()
  setActivePinia(createPinia())
  store = useAnimalsStore()
  animals = [MILO, LUNA]
  vaccinations = []
  treatments = []
  weights = []
  load = vi.spyOn(store, 'load').mockImplementation(async () => {
    store.animals = animals
    store.hasLoaded = true
    return true
  })
  listVaccinations = vi.fn<VaccinationsRepository['listByAnimal']>(async (id) =>
    vaccinations.filter((v) => v.animalId === id),
  )
  listTreatments = vi.fn<TreatmentsRepository['listWithHistoryByAnimal']>(async (id) =>
    treatments.filter((t) => t.animalId === id),
  )
  listWeights = vi.fn<WeightRepository['listByAnimal']>(async (id) =>
    weights.filter((w) => w.animalId === id),
  )
  const vaccinationsRepository = fakeVaccinationsRepository({ listByAnimal: listVaccinations })
  const treatmentsRepository = fakeTreatmentsRepository({ listWithHistoryByAnimal: listTreatments })
  const weightRepository = fakeWeightRepository({ listByAnimal: listWeights })
  provideVaccinationsRepository(() => vaccinationsRepository)
  provideTreatmentsRepository(() => treatmentsRepository)
  provideWeightRepository(() => weightRepository)
  await router.push({ name: 'animals' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  vi.stubGlobal('localStorage', memoryStorage())
  vi.stubGlobal('visualViewport', {
    addEventListener() {},
    removeEventListener() {},
    width: 412,
    height: 915,
    offsetTop: 0,
  })
})

// Un Carnet resté monté écouterait encore le retour au premier plan des tests suivants.
const mounted: ReturnType<typeof mount>[] = []

afterEach(() => {
  mounted.splice(0).forEach((wrapper) => wrapper.unmount())
  provideVaccinationsRepository(null)
  provideTreatmentsRepository(null)
  provideWeightRepository(null)
  applyWeightUnit('kg')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter() {
  const wrapper = mount(CarnetView, { global: { plugins: [vuetify, i18n, router] } })
  mounted.push(wrapper)
  await flushPromises()
  return wrapper
}

function stat(wrapper: ReturnType<typeof mount>, index: number) {
  const column = wrapper.findAll('.carnet-stat')[index]
  if (!column) throw new Error(`Pas de colonne de stats à l'index ${index}`)
  return {
    column,
    label: column.get('.carnet-stat__label').text(),
    value: column.get('.carnet-stat__value').text(),
    sub: column.get('.carnet-stat__sub').text(),
  }
}

describe('CarnetView — animal consulté', () => {
  it('charge la liste des animaux au montage', async () => {
    await monter()

    expect(load).toHaveBeenCalledOnce()
  })

  it('sélectionne le premier animal quand aucun ne l’est', async () => {
    await monter()

    expect(store.selectedAnimalId).toBe(MILO.id)
  })

  it('garde l’animal déjà sélectionné', async () => {
    store.select(LUNA.id)

    const wrapper = await monter()

    expect(store.selectedAnimalId).toBe(LUNA.id)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
  })

  it('rend une chip par animal, en mode switch', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
    expect(wrapper.getComponent(AnimalChipSelector).props('mode')).toBe('switch')
  })

  it('change l’animal consulté au tap sur une chip et le passe aux trois sections', async () => {
    const wrapper = await monter()

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(store.selectedAnimalId).toBe(LUNA.id)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
    expect(wrapper.getComponent(VaccinationsSection).props('animalId')).toBe(LUNA.id)
    expect(wrapper.getComponent(TreatmentsSection).props('animalId')).toBe(LUNA.id)
    expect(wrapper.getComponent(WeightSection).props('animalId')).toBe(LUNA.id)
  })

  it('mène au formulaire de création en un tap sur la chip « + »', async () => {
    const wrapper = await monter()

    await wrapper.get('.animal-chip-selector__add').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })
})

describe('CarnetView — header', () => {
  it('affiche nom, race et âge, l’avatar en dégradé', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Golden retriever · 4 ans')
    expect(wrapper.get('.carnet-header__avatar').attributes('style')).toContain('linear-gradient')
  })

  it('sans photo, n’affiche que le dégradé', async () => {
    const wrapper = await monter()

    expect(wrapper.find('.carnet-header__avatar img').exists()).toBe(false)
    expect(wrapper.getComponent(AnimalChipSelector).props('animals')[0]?.photoUrl).toBeNull()
  })

  it('affiche la photo de l’animal dans l’avatar du header et dans sa chip', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]

    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__avatar img').attributes('src')).toBe('url:milo.jpg')
    expect(wrapper.getComponent(AnimalChipSelector).props('animals')).toEqual([
      { id: MILO.id, name: 'Milo', photoUrl: 'url:milo.jpg' },
      { id: LUNA.id, name: 'Luna', photoUrl: null },
    ])
  })

  it('passe la date du jour aux sections', async () => {
    const wrapper = await monter()

    expect(wrapper.getComponent(VaccinationsSection).props('today')).toBe('2026-09-09')
    expect(wrapper.getComponent(TreatmentsSection).props('today')).toBe('2026-09-09')
    expect(wrapper.getComponent(WeightSection).props('today')).toBe('2026-09-09')
  })

  it('n’écrit que la race sans date de naissance', async () => {
    animals = [animal('a', 'Nino', { breed: 'Européen' })]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Européen')
  })

  it('n’écrit que l’âge sans race, en mois sous un an', async () => {
    animals = [animal('a', 'Nino', { birthDate: '2026-03-09' })]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('6 mois')
  })

  it('compte en semaines jusqu’à 16 semaines', async () => {
    animals = [animal('a', 'Pixel', { breed: 'Européen', birthDate: '2026-07-01' })]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Européen · 10 semaines')
  })

  it('précède l’âge d’« environ » quand la date de naissance est approximative', async () => {
    animals = [
      animal('a', 'Pixel', {
        breed: 'Européen',
        birthDate: '2026-07-01',
        birthDateApproximate: true,
      }),
    ]
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header__subtitle').text()).toBe('Européen · environ 10 semaines')
  })

  it('n’affiche pas de sous-titre sans race ni date de naissance', async () => {
    animals = [animal('a', 'Nino')]
    const wrapper = await monter()

    expect(wrapper.find('.carnet-header__subtitle').exists()).toBe(false)
  })

  it('ouvre l’édition de la fiche depuis l’icône edit', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-header__edit').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-edit', params: { id: MILO.id } })
  })

  describe('export PDF depuis l’icône du Carnet (DO-4, gratuit)', () => {
    it('ouvre la feuille pour le seul animal consulté, sans compte', async () => {
      const wrapper = await monter()

      expect(wrapper.findComponent(PdfExportSheet).exists()).toBe(false)

      await wrapper.get('.carnet-header__export-pdf').trigger('click')
      await flushPromises()

      expect(push).not.toHaveBeenCalledWith(expect.objectContaining({ name: 'plus' }))
      expect(wrapper.getComponent(PdfExportSheet).props('modelValue')).toBe(true)
      expect(wrapper.getComponent(PdfExportSheet).props('animals')).toEqual([
        { id: MILO.id, name: 'Milo', species: 'dog' },
      ])
    })

    it('n’annonce aucune pastille Plus, ni à l’œil ni au lecteur d’écran', async () => {
      const wrapper = await monter()
      const icone = wrapper.get('.carnet-header__export-pdf')

      expect(icone.find('.plus-badge').exists()).toBe(false)
      expect(icone.attributes('aria-label')).toBe('Exporter en PDF')
    })
  })

  it('revient à l’accueil par la flèche', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-header__back').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'home' })
  })
})

describe('CarnetView — bandeau de stats', () => {
  it('a trois colonnes Poids / Rappels / Traitements', async () => {
    const wrapper = await monter()

    expect(wrapper.findAll('.carnet-stat').map((c) => c.get('.carnet-stat__label').text())).toEqual(
      ['Poids', 'Rappels', 'Traitements'],
    )
  })

  it('met tout à — / 0 / 0 sans donnée (C2)', async () => {
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '—', sub: 'Aucune pesée' })
    expect(stat(wrapper, 1)).toMatchObject({ value: '0', sub: 'à venir' })
    expect(stat(wrapper, 2)).toMatchObject({ value: '0', sub: 'en cours' })
    expect(stat(wrapper, 1).column.classes()).not.toContain('carnet-stat--overdue')
  })

  it('affiche la dernière pesée et sa variation seule, sans date', async () => {
    weights = [weight(MILO.id, 24, '2026-08-05'), weight(MILO.id, 24.5, '2026-08-25')]
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '24,5\u00a0kg', sub: '+0,5\u00a0kg' })
  })

  it('écrit ±0,0 kg sans date quand rien ne bouge', async () => {
    weights = [weight(MILO.id, 24.5, '2026-08-05'), weight(MILO.id, 24.5, '2026-08-25')]
    const wrapper = await monter()

    expect(stat(wrapper, 0).sub).toBe('±0,0\u00a0kg')
  })

  it('laisse la date à la section « Suivi de poids », année comprise hors de l’année en cours', async () => {
    weights = [weight(MILO.id, 23.9, '2025-12-20'), weight(MILO.id, 24.2, '2026-01-10')]
    const wrapper = await monter()

    expect(stat(wrapper, 0).sub).toBe('+0,3\u00a0kg')
    expect(wrapper.get('.weight-section__delta').text()).toBe(
      '+0,3\u00a0kg depuis le\u00a020\u00a0déc.\u00a02025',
    )
  })

  it('écrit la dernière pesée et sa variation en livres quand c’est l’unité choisie', async () => {
    applyWeightUnit('lb')
    weights = [
      weight(MILO.id, toKg(53.3, 'lb'), '2026-08-25'),
      weight(MILO.id, toKg(54, 'lb'), '2026-09-13'),
    ]
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '54,0\u00a0lb', sub: '+0,7\u00a0lb' })
  })

  it('signale une première pesée', async () => {
    weights = [weight(MILO.id, 24.5, '2026-11-08')]
    const wrapper = await monter()

    expect(stat(wrapper, 0)).toMatchObject({ value: '24,5\u00a0kg', sub: 'Première pesée' })
  })

  it('compte les retards, vaccins et traitements confondus, en corail, dès qu’il y en a un', async () => {
    vaccinations = [vaccination(MILO.id, '2026-09-01'), vaccination(MILO.id, null)]
    treatments = [treatment(MILO.id, '2026-09-24'), treatment(LUNA.id, '2026-09-01')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '1', sub: 'en retard' })
    expect(stat(wrapper, 1).column.classes()).toContain('carnet-stat--overdue')
    expect(stat(wrapper, 2)).toMatchObject({ value: '1', sub: 'en cours' })
  })

  it('compte les rappels à venir, en neutre, quand rien n’est en retard', async () => {
    vaccinations = [vaccination(MILO.id, '2026-12-12'), vaccination(MILO.id, null)]
    treatments = [treatment(MILO.id, '2026-09-09')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '2', sub: 'à venir' })
    expect(stat(wrapper, 1).column.classes()).not.toContain('carnet-stat--overdue')
  })

  it('ne compte que les retards dès qu’il y en a, pas les rappels à venir avec', async () => {
    vaccinations = [vaccination(MILO.id, '2026-09-01'), vaccination(MILO.id, '2026-12-12')]
    treatments = [treatment(MILO.id, '2026-09-02'), treatment(MILO.id, '2026-09-24')]
    const wrapper = await monter()

    expect(stat(wrapper, 1)).toMatchObject({ value: '2', sub: 'en retard' })
  })

  it('suit l’animal consulté', async () => {
    treatments = [treatment(LUNA.id, '2026-09-24')]
    const wrapper = await monter()
    expect(stat(wrapper, 2).value).toBe('0')

    await wrapper.findAll('.animal-chip')[1]!.trigger('click')
    await flushPromises()

    expect(stat(wrapper, 2).value).toBe('1')
  })
})

describe('CarnetView — retour au premier plan', () => {
  it('passe une dose du jour en retard quand l’app revient le lendemain', async () => {
    treatments = [treatment(MILO.id, '2026-09-09')]
    const wrapper = await monter()
    expect(wrapper.find('.treatment-row__badge').exists()).toBe(false)

    vi.setSystemTime(new Date('2026-09-10T08:00:00'))
    simulateWebResume()
    await flushPromises()

    expect(wrapper.get('.treatment-row__badge').text()).toBe('En retard · 1 j')
    expect(stat(wrapper, 1)).toMatchObject({ value: '1', sub: 'en retard' })
  })

  it('relit vaccins, traitements et pesées sans vider les lignes pendant la relecture', async () => {
    vaccinations = [vaccination(MILO.id, '2026-12-12')]
    treatments = [treatment(MILO.id, '2026-09-24')]
    weights = [weight(MILO.id, 24.5, '2026-09-01')]
    const wrapper = await monter()
    listVaccinations.mockClear()
    listTreatments.mockClear()
    listWeights.mockClear()
    listVaccinations.mockReturnValueOnce(new Promise(() => {}))
    listTreatments.mockReturnValueOnce(new Promise(() => {}))
    listWeights.mockReturnValueOnce(new Promise(() => {}))

    simulateWebResume()
    await flushPromises()

    expect(listVaccinations).toHaveBeenCalledExactlyOnceWith(MILO.id)
    expect(listTreatments).toHaveBeenCalledExactlyOnceWith(MILO.id)
    expect(listWeights).toHaveBeenCalledExactlyOnceWith(MILO.id)
    expect(wrapper.findAll('.vaccination-row')).toHaveLength(1)
    expect(wrapper.find('.vaccinations-section__empty').exists()).toBe(false)
    expect(wrapper.findAll('.treatment-row')).toHaveLength(1)
    expect(stat(wrapper, 0).value).toBe('24,5\u00a0kg')
  })

  it('relit la liste des animaux en gardant l’animal consulté', async () => {
    const wrapper = await monter()
    await wrapper.findAll('.animal-chip')[1]!.trigger('click')

    simulateWebResume()
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(2)
    expect(store.selectedAnimalId).toBe(LUNA.id)
  })
})

describe('CarnetView — sans animal', () => {
  beforeEach(() => {
    animals = []
  })

  it('souhaite la bienvenue et propose de créer le premier animal', async () => {
    const wrapper = await monter()

    expect(wrapper.get('.carnet-welcome__title').text()).toBe('Bienvenue sur MémoPatte')
    expect(wrapper.get('.carnet-welcome__create').text()).toBe('Créer mon premier animal')
    expect(wrapper.find('.carnet-header').exists()).toBe(false)
    expect(wrapper.find('.carnet-stat').exists()).toBe(false)
    expect(wrapper.findComponent(VaccinationsSection).exists()).toBe(false)
  })

  it('ouvre le formulaire de création', async () => {
    const wrapper = await monter()

    await wrapper.get('.carnet-welcome__create').trigger('click')

    expect(push).toHaveBeenCalledWith({ name: 'animal-new' })
  })
})

describe('CarnetView — chargement et erreur', () => {
  let list: Mock<AnimalsRepository['list']>

  beforeEach(() => {
    load.mockRestore()
    load = vi.spyOn(store, 'load')
    list = vi.fn<AnimalsRepository['list']>()
    provideAnimalsRepository(() => ({
      list,
      getById: vi.fn<AnimalsRepository['getById']>(),
      create: vi.fn<AnimalsRepository['create']>(),
      update: vi.fn<AnimalsRepository['update']>(),
      remove: vi.fn<AnimalsRepository['remove']>(),
      restore: vi.fn<AnimalsRepository['restore']>(),
      getDeparture: vi.fn<AnimalsRepository['getDeparture']>(),
      setDeparture: vi.fn<AnimalsRepository['setDeparture']>(),
      listRecords: vi.fn<AnimalsRepository['listRecords']>(),
      listVersions: vi.fn<AnimalsRepository['listVersions']>(),
      markAllDeletedStatement: vi.fn<AnimalsRepository['markAllDeletedStatement']>(),
      eraseAllStatement: vi.fn<AnimalsRepository['eraseAllStatement']>(),
      eraseAll: vi.fn<AnimalsRepository['eraseAll']>(),
      restoreStatement: vi.fn<AnimalsRepository['restoreStatement']>(),
      runImport: vi.fn<AnimalsRepository['runImport']>(),
      entity: 'animal',
      getRowForPush: vi.fn<AnimalsRepository['getRowForPush']>(),
      pushRow: vi.fn<AnimalsRepository['pushRow']>(),
      pullPage: vi.fn<AnimalsRepository['pullPage']>(),
      applyRemoteRowStatement: vi.fn<AnimalsRepository['applyRemoteRowStatement']>(),
    }))
  })

  afterEach(() => {
    provideAnimalsRepository(null)
  })

  it('montre le squelette du header et un indicateur tant que la liste n’est pas chargée', async () => {
    list.mockReturnValue(new Promise(() => {}))
    const wrapper = await monter()

    expect(wrapper.get('.carnet-header').find('.carnet-header__name').exists()).toBe(false)
    expect(
      wrapper.get('.carnet-loading').findComponent({ name: 'VProgressCircular' }).exists(),
    ).toBe(true)
    expect(wrapper.find('.carnet-welcome').exists()).toBe(false)
    expect(wrapper.find('.carnet-error').exists()).toBe(false)
  })

  it('affiche l’état d’erreur, pas « Bienvenue », quand l’ouverture échoue', async () => {
    list.mockRejectedValue(new Error('SQLite indisponible'))
    const wrapper = await monter()

    expect(wrapper.get('.carnet-error__title').text()).toBe('Impossible d’ouvrir le carnet.')
    expect(wrapper.get('.carnet-error__retry').text()).toBe('Réessayer')
    expect(wrapper.find('.carnet-welcome').exists()).toBe(false)
    expect(wrapper.find('.carnet-loading').exists()).toBe(false)
    expect(wrapper.find('.carnet-header').exists()).toBe(false)
  })

  it('relance le chargement sur « Réessayer » et bascule sur l’animal quand il réussit', async () => {
    list.mockRejectedValueOnce(new Error('SQLite indisponible')).mockResolvedValueOnce([MILO])
    const wrapper = await monter()
    expect(load).toHaveBeenCalledTimes(1)

    await wrapper.get('.carnet-error__retry').trigger('click')
    await flushPromises()

    expect(load).toHaveBeenCalledTimes(2)
    expect(wrapper.find('.carnet-error').exists()).toBe(false)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
  })

  it('ne souhaite la bienvenue qu’après un chargement réussi et vide', async () => {
    list.mockResolvedValue([])
    const wrapper = await monter()

    expect(wrapper.get('.carnet-welcome__title').text()).toBe('Bienvenue sur MémoPatte')
    expect(wrapper.find('.carnet-error').exists()).toBe(false)
    expect(wrapper.find('.carnet-loading').exists()).toBe(false)
  })
})

describe('CarnetView — route', () => {
  it('reste l’onglet Carnet, à /animals', () => {
    const route = router.resolve('/animals')

    expect(route.name).toBe('animals')
  })
})

describe('CarnetView — photo depuis l’avatar du header', () => {
  beforeEach(() => {
    choisirPhoto.mockReset()
    vi.stubGlobal('visualViewport', {
      addEventListener() {},
      removeEventListener() {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
  })

  afterEach(() => {
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    dismissToast()
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
  })

  async function monterAttache() {
    const wrapper = mount(CarnetView, {
      global: { plugins: [vuetify, i18n, router] },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    await flushPromises()
    return wrapper
  }

  function feuille(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('.animal-photo-sheet .bottom-sheet__panel')
  }

  function actionsDeLaFeuille(): string[] {
    return [...(feuille()?.querySelectorAll('.animal-photo-sheet__action') ?? [])].map((action) =>
      [...action.querySelectorAll('.animal-photo-sheet__label, .animal-photo-sheet__hint')]
        .map((text) => text.textContent!.trim())
        .join(' · '),
    )
  }

  function action(libelle: string): HTMLElement {
    const found = [
      ...(feuille()?.querySelectorAll<HTMLElement>('.animal-photo-sheet__action') ?? []),
    ].find((element) => element.textContent!.includes(libelle))
    if (!found) throw new Error(`Pas d’action « ${libelle} » dans la feuille`)
    return found
  }

  async function toucherAvatar(wrapper: ReturnType<typeof mount>) {
    await wrapper.get('.carnet-header__photo').trigger('click')
    await flushPromises()
  }

  it('avec une photo, l’avatar se lit « voir, changer ou retirer »', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]
    const wrapper = await monterAttache()

    const avatar = wrapper.get('.carnet-header__photo')
    expect(avatar.element.tagName).toBe('BUTTON')
    expect(avatar.attributes('aria-label')).toBe('Photo de Milo\u00a0: voir, changer ou retirer')
    expect(avatar.attributes('aria-haspopup')).toBe('dialog')
  })

  it('sans photo, l’avatar se lit « Ajouter une photo de Milo » et garde le dégradé, sans patte', async () => {
    const wrapper = await monterAttache()

    expect(wrapper.get('.carnet-header__photo').attributes('aria-label')).toBe(
      'Ajouter une photo de Milo',
    )
    expect(wrapper.get('.carnet-header__avatar').attributes('style')).toContain('linear-gradient')
    expect(wrapper.find('.carnet-header__avatar .v-icon').exists()).toBe(false)
  })

  it('porte un badge « appareil photo », muet pour les lecteurs d’écran', async () => {
    const wrapper = await monterAttache()

    const badge = wrapper.get('.carnet-header__photo .carnet-header__photo-badge')
    expect(badge.attributes('aria-hidden')).toBe('true')
    expect(badge.find('.v-icon').exists()).toBe(true)
  })

  it('ouvre la feuille d’un toucher sur l’avatar', async () => {
    const wrapper = await monterAttache()

    await toucherAvatar(wrapper)

    expect(feuille()).not.toBeNull()
  })

  it('ouvre la feuille d’un toucher sur le badge', async () => {
    const wrapper = await monterAttache()

    await wrapper.get('.carnet-header__photo-badge').trigger('click')
    await flushPromises()

    expect(feuille()).not.toBeNull()
  })

  it('l’appui long n’ouvre plus rien', async () => {
    const wrapper = await monterAttache()

    await wrapper.get('.carnet-header__photo').trigger('contextmenu')
    await flushPromises()

    expect(feuille()).toBeNull()
  })

  it('rend le focus à l’avatar à la fermeture de la feuille', async () => {
    const wrapper = await monterAttache()

    await toucherAvatar(wrapper)
    document.body.querySelector<HTMLElement>('.animal-photo-sheet .bottom-sheet__handle')!.click()
    await flushPromises()

    expect(document.activeElement).toBe(wrapper.get('.carnet-header__photo').element)
  })

  it('titre la feuille du nom et de la race de l’animal, puis « Photo »', async () => {
    const wrapper = await monterAttache()

    await toucherAvatar(wrapper)

    expect(feuille()!.querySelector('.bottom-sheet__title')?.textContent).toBe('Milo')
    expect(feuille()!.querySelector('.bottom-sheet__subtitle')?.textContent).toBe(
      'Golden retriever',
    )
    expect(feuille()!.querySelector('.animal-photo-sheet__heading')?.textContent).toBe('Photo')
  })

  it('sans photo, propose seulement « Ajouter une photo · Choisir une photo »', async () => {
    const wrapper = await monterAttache()

    await toucherAvatar(wrapper)

    expect(actionsDeLaFeuille()).toEqual(['Ajouter une photo · Choisir une photo'])
  })

  it('avec une photo, propose de la voir, de la changer ou de la retirer', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]
    const wrapper = await monterAttache()

    await toucherAvatar(wrapper)

    expect(actionsDeLaFeuille()).toEqual([
      'Voir la photo',
      'Changer la photo · Choisir une photo',
      'Retirer la photo',
    ])
  })

  it('« Voir la photo » referme la feuille et montre la photo en plein écran', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]
    const wrapper = await monterAttache()
    await toucherAvatar(wrapper)

    action('Voir la photo').click()
    await flushPromises()

    expect(wrapper.getComponent(AnimalPhotoSheet).props('modelValue')).toBe(false)
    expect(wrapper.getComponent(AnimalPhotoViewer).props('modelValue')).toBe(true)
    expect(document.body.querySelector('.animal-photo-viewer__image')?.getAttribute('src')).toBe(
      'url:milo.jpg',
    )
  })

  it('« Retirer la photo », sans confirmation : referme la feuille, toast « Photo retirée » · « Annuler »', async () => {
    animals = [{ ...MILO, photoPath: 'milo.jpg' }, LUNA]
    const removePhoto = vi
      .spyOn(store, 'removePhoto')
      .mockResolvedValue({ animalId: MILO.id, photoPath: 'milo.jpg' })
    vi.spyOn(store, 'forgetRemovedPhoto').mockResolvedValue()
    const wrapper = await monterAttache()
    await toucherAvatar(wrapper)

    action('Retirer la photo').click()
    await flushPromises()

    expect(removePhoto).toHaveBeenCalledWith(MILO.id, expect.anything())
    expect(wrapper.getComponent(AnimalPhotoSheet).props('modelValue')).toBe(false)
    expect(toastMessage.value).toBe('Photo retirée')
    expect(toastAction.value?.label).toBe('Annuler')
  })

  it('« Ajouter une photo » enregistre la photo choisie', async () => {
    choisirPhoto.mockResolvedValue({ base64: 'TUlMTw==', previewUrl: 'data:,' })
    const update = vi.spyOn(store, 'update').mockResolvedValue(MILO)
    const wrapper = await monterAttache()
    await toucherAvatar(wrapper)

    action('Ajouter une photo').click()
    await flushPromises()

    expect(update).toHaveBeenCalledWith(MILO.id, expect.anything(), {
      kind: 'replace',
      base64: 'TUlMTw==',
    })
  })

  it('garde la feuille ouverte avec le message du formulaire si la photo est illisible', async () => {
    choisirPhoto.mockRejectedValue(new Error('Not implemented'))
    const wrapper = await monterAttache()
    await toucherAvatar(wrapper)

    action('Ajouter une photo').click()
    await flushPromises()

    expect(feuille()!.querySelector('[role="alert"]')?.textContent?.trim()).toBe(
      'La photo n’a pas pu être chargée. Réessaie.',
    )
  })

  it('désactive les actions pendant le choix', async () => {
    choisirPhoto.mockReturnValue(new Promise(() => {}))
    const wrapper = await monterAttache()
    await toucherAvatar(wrapper)

    action('Ajouter une photo').click()
    await flushPromises()

    expect(action('Ajouter une photo').hasAttribute('disabled')).toBe(true)
  })
})

describe('CarnetView — options de l’animal', () => {
  const REMOVAL = { animalId: MILO.id, deletedAt: '2026-09-09T12:00:00.000Z', photoPath: null }

  afterEach(() => {
    dismissToast()
    mounted.splice(0).forEach((wrapper) => wrapper.unmount())
    document.body.innerHTML = ''
  })

  async function monterAttache() {
    const wrapper = mount(CarnetView, {
      global: { plugins: [vuetify, i18n, router] },
      attachTo: document.body,
    })
    mounted.push(wrapper)
    await flushPromises()
    return wrapper
  }

  function feuille(): HTMLElement | null {
    return document.body.querySelector<HTMLElement>('.animal-options-sheet .bottom-sheet__panel')
  }

  function actions(): HTMLElement[] {
    return [...(feuille()?.querySelectorAll<HTMLElement>('.animal-options-sheet__action') ?? [])]
  }

  function texte(element: Element | null | undefined): string {
    return (element?.textContent ?? '').replace(/\s+/g, ' ').trim()
  }

  async function ouvrirOptions(wrapper: ReturnType<typeof mount>) {
    await wrapper.get('.carnet-header__options').trigger('click')
    await flushPromises()
  }

  async function toucher(element: HTMLElement | undefined) {
    element!.click()
    await flushPromises()
  }

  function quitter(id: string, changes: Partial<Animal>) {
    store.animals = store.animals.map((item) => (item.id === id ? { ...item, ...changes } : item))
  }

  it('AN-6 : n’affiche dans les chips que les animaux suivis, et ouvre sur le premier d’entre eux', async () => {
    animals = [{ ...MILO, unfollowedOn: '2026-09-01' }, LUNA]

    const wrapper = await monterAttache()

    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Luna'])
    expect(store.selectedAnimalId).toBe(LUNA.id)
  })

  it('TR-37 : dit à la section des traitements si l’animal est suivi', async () => {
    animals = [MILO, { ...LUNA, unfollowedOn: '2026-09-01' }]
    store.select(LUNA.id)

    const wrapper = await monterAttache()

    expect(wrapper.getComponent(TreatmentsSection).props('followed')).toBe(false)
    store.select(MILO.id)
    await flushPromises()
    expect(wrapper.getComponent(TreatmentsSection).props('followed')).toBe(true)
  })

  it('souhaite la bienvenue quand plus aucun animal n’est suivi', async () => {
    animals = [{ ...MILO, unfollowedOn: '2026-09-01' }]

    const wrapper = await monterAttache()

    expect(wrapper.find('.carnet-welcome').exists()).toBe(true)
  })

  it('AN-12 : le menu ⋮ ouvre « Options » avec « Ne plus suivre » et « Supprimer »', async () => {
    const wrapper = await monterAttache()

    expect(wrapper.get('.carnet-header__options').attributes('aria-label')).toBe('Options de Milo')
    await ouvrirOptions(wrapper)

    expect(texte(feuille()?.querySelector('.bottom-sheet__title'))).toBe('Milo')
    expect(texte(feuille()?.querySelector('.animal-options-sheet__heading'))).toBe('Options')
    expect(
      actions().map((action) => texte(action.querySelector('.animal-options-sheet__label'))),
    ).toEqual(['Ne plus suivre Milo', 'Supprimer Milo'])
    expect(texte(actions()[0]?.querySelector('.animal-options-sheet__hint'))).toBe(
      'Ses rappels et ses traitements en cours s’arrêtent. Son carnet reste intact.',
    )
  })

  it('AN-12 : propose « Suivre Luna de nouveau » pour un animal qu’on ne suit plus', async () => {
    animals = [MILO, { ...LUNA, unfollowedOn: '2026-09-01' }]
    store.select(LUNA.id)
    const wrapper = await monterAttache()

    await ouvrirOptions(wrapper)

    expect(actions().map(texte)).toEqual(['Suivre Luna de nouveau', 'Supprimer Luna'])
  })

  it('AN-9, V15 bis : « Ne plus suivre » sans question, revient à l’accueil et propose « Annuler »', async () => {
    const undo = { animalId: MILO.id, unfollowedOn: '2026-09-09', stoppedPeriodIds: [] }
    const unfollow = vi.spyOn(store, 'unfollow').mockImplementation(async () => {
      quitter(MILO.id, { unfollowedOn: '2026-09-09' })
      return undo
    })
    const undoUnfollow = vi.spyOn(store, 'undoUnfollow').mockImplementation(async () => {
      quitter(MILO.id, { unfollowedOn: null })
    })
    const wrapper = await monterAttache()
    await ouvrirOptions(wrapper)

    await toucher(actions()[0])

    expect(unfollow).toHaveBeenCalledExactlyOnceWith(MILO.id)
    expect(document.body.querySelector('.confirm-dialog__panel')).toBeNull()
    expect(push).toHaveBeenCalledExactlyOnceWith({ name: 'home' })
    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Luna'])
    expect(toastMessage.value).toBe('Tu ne suis plus Milo')
    expect(toastAction.value?.ariaLabel?.replace(/\s/gu, ' ')).toBe(
      'Annuler : suivre Milo de nouveau',
    )
    await vi.waitFor(() =>
      expect(toastAnnouncement.value).toBe('Tu ne suis plus Milo. Ses rappels sont coupés.'),
    )

    runToastAction()
    await flushPromises()

    expect(undoUnfollow).toHaveBeenCalledExactlyOnceWith(undo)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
  })

  it('AN-11 : « Suivre de nouveau » garde l’animal affiché, avec le toast qui parle de « Reprendre »', async () => {
    animals = [MILO, { ...LUNA, unfollowedOn: '2026-09-01' }]
    store.select(LUNA.id)
    const undo = {
      animalId: LUNA.id,
      departure: { unfollowedOn: '2026-09-01', departureReason: null, departureDate: null },
    }
    const follow = vi.spyOn(store, 'follow').mockImplementation(async () => {
      quitter(LUNA.id, { unfollowedOn: null })
      return undo
    })
    const undoFollow = vi.spyOn(store, 'undoFollow').mockResolvedValue()
    const wrapper = await monterAttache()
    await ouvrirOptions(wrapper)

    await toucher(actions()[0])

    expect(follow).toHaveBeenCalledExactlyOnceWith(LUNA.id)
    expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
    expect(wrapper.findAll('.animal-chip').map((chip) => chip.text())).toEqual(['Milo', 'Luna'])
    expect(toastMessage.value?.replace(/\s/gu, ' ')).toBe(
      'Tu suis de nouveau Luna. Ses traitements arrêtés ne reprennent pas seuls : relance chacun avec « Reprendre ».',
    )

    expect(toastAction.value?.ariaLabel?.replace(/\s/gu, ' ')).toBe('Annuler : ne plus suivre Luna')
    runToastAction()
    await flushPromises()

    expect(undoFollow).toHaveBeenCalledExactlyOnceWith(undo)
  })

  it('dit l’échec du geste en toast', async () => {
    vi.spyOn(store, 'unfollow').mockRejectedValue(new Error('base verrouillée'))
    const wrapper = await monterAttache()
    await ouvrirOptions(wrapper)

    await toucher(actions()[0])

    expect(toastMessage.value).toBe('Le changement n’a pas pu être enregistré. Réessaie.')
    expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
  })

  describe('« Supprimer »', () => {
    async function demanderSuppression(wrapper: ReturnType<typeof mount>) {
      await ouvrirOptions(wrapper)
      await toucher(actions()[1])
    }

    function dialogue(): HTMLElement | null {
      return document.body.querySelector<HTMLElement>('.confirm-dialog__panel')
    }

    it('AN-12 : demande confirmation, « Annuler » ne supprime rien', async () => {
      const remove = vi.spyOn(store, 'remove')
      const wrapper = await monterAttache()

      await demanderSuppression(wrapper)

      expect(texte(dialogue()?.querySelector('.confirm-dialog__title'))).toBe('Supprimer Milo ?')
      expect(texte(dialogue()?.querySelector('.confirm-dialog__text'))).toBe(
        'Tout son carnet sera supprimé : vaccins, traitements, pesées, photo.',
      )
      await toucher(dialogue()?.querySelector<HTMLElement>('.confirm-dialog__cancel') ?? undefined)

      expect(remove).not.toHaveBeenCalled()
    })

    it('AN-12 : supprime, affiche l’animal suivant, et « Annuler » rend l’animal', async () => {
      const remove = vi.spyOn(store, 'remove').mockImplementation(async () => {
        store.animals = store.animals.filter((item) => item.id !== MILO.id)
        return REMOVAL
      })
      const undoRemove = vi.spyOn(store, 'undoRemove').mockImplementation(async () => {
        store.animals = [MILO, ...store.animals]
      })
      const forgetPhoto = vi.spyOn(store, 'forgetPhoto').mockResolvedValue()
      const wrapper = await monterAttache()
      await demanderSuppression(wrapper)

      await toucher(dialogue()?.querySelector<HTMLElement>('.confirm-dialog__confirm') ?? undefined)

      expect(remove).toHaveBeenCalledExactlyOnceWith(MILO.id)
      expect(wrapper.get('.carnet-header__name').text()).toBe('Luna')
      expect(toastMessage.value).toBe('Carnet de Milo supprimé')
      expect(toastAction.value?.ariaLabel?.replace(/\s/gu, ' ')).toBe(
        'Annuler : garder le carnet de Milo',
      )

      runToastAction()
      await flushPromises()

      expect(undoRemove).toHaveBeenCalledExactlyOnceWith(REMOVAL)
      expect(wrapper.get('.carnet-header__name').text()).toBe('Milo')
      expect(forgetPhoto).not.toHaveBeenCalled()
    })

    it('AN-12 : n’efface la photo qu’une fois le toast fermé sans « Annuler »', async () => {
      vi.spyOn(store, 'remove').mockImplementation(async () => {
        store.animals = store.animals.filter((item) => item.id !== MILO.id)
        return REMOVAL
      })
      const forgetPhoto = vi.spyOn(store, 'forgetPhoto').mockResolvedValue()
      const wrapper = await monterAttache()
      await demanderSuppression(wrapper)
      await toucher(dialogue()?.querySelector<HTMLElement>('.confirm-dialog__confirm') ?? undefined)
      expect(forgetPhoto).not.toHaveBeenCalled()

      dismissToast()

      expect(forgetPhoto).toHaveBeenCalledExactlyOnceWith(REMOVAL)
    })

    it('revient à l’accueil quand il ne reste aucun animal suivi', async () => {
      animals = [MILO]
      vi.spyOn(store, 'remove').mockImplementation(async () => {
        store.animals = []
        return REMOVAL
      })
      const wrapper = await monterAttache()
      await demanderSuppression(wrapper)

      await toucher(dialogue()?.querySelector<HTMLElement>('.confirm-dialog__confirm') ?? undefined)

      expect(push).toHaveBeenCalledWith({ name: 'home' })
    })

    it('jamais de lien rouge en bas du Carnet', async () => {
      const wrapper = await monterAttache()

      expect(wrapper.text()).not.toContain('Supprimer Milo')
    })
  })
})
