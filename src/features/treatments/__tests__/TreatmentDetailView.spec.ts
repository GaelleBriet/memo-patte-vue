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
import { dose, missed, period, postponed, treatment } from './treatment-fixtures'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentDosesService } from '../service/treatment-doses.service'
import type { TreatmentStopService } from '../service/treatment-stop.service'
import {
  provideTreatmentDosesService,
  provideTreatmentRemindersService,
  provideTreatmentStopService,
  provideTreatmentsRepository,
} from '../store/treatments.store'
import TreatmentDetailView from '../views/TreatmentDetailView.vue'
import TreatmentDoseCard from '../views/TreatmentDoseCard.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import router from '@/router'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import DatePickerSheet from '@/shared/components/DatePickerSheet.vue'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import OverflowMenu from '@/shared/components/OverflowMenu.vue'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'

const TODAY = new Date('2026-09-28T21:00:00')
const NBSP = / /g

const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: '2023-04-10',
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const MATIN_ET_SOIR = period({ times: ['08:00', '20:00'], doseQuantity: 0.3, doseUnit: 'ml' })
const HIER: NewTreatmentDose[] = [
  dose('2026-09-27', '2026-09-27', { dueTime: '08:00' }),
  dose('2026-09-27', '2026-09-28', { dueTime: '20:00' }),
]
/** Planche A · V3 ter : deux heures par jour, rien de noté aujourd'hui. */
const METACAM = treatment([MATIN_ET_SOIR], HIER)
const TRIMESTRIEL = period({
  frequency: { value: 3, unit: 'month' },
  startsOn: '2026-04-10',
  firstDueOn: '2026-04-10',
})
/** Planche A · V1 quinquies bis : la prochaine dose reportée. */
const MILBEMAX = treatment(
  [TRIMESTRIEL],
  [
    dose('2026-04-10', '2026-07-10'),
    dose('2026-07-10', '2026-10-10'),
    postponed('2026-10-10', '2026-10-14', { createdAt: '2026-09-20T08:00:00.000Z' }),
  ],
)

const APPLIED = {
  animalId: LUNA.id,
  undo: [{ action: 'delete' as const, id: 'nouvelle' }],
  alreadyGivenOn: null,
  postponement: null,
}

let book: TreatmentWithHistory | null
let remove: MockInstance
let read: Mock<(id: string) => Promise<TreatmentWithHistory | null>>
let push: MockInstance
let service: {
  [K in 'record' | 'undo' | 'apply' | 'undoBatch']: Mock<TreatmentDosesService[K]>
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
  animals.animals = [LUNA]
  animals.hasLoaded = true
  book = METACAM
  read = vi.fn<(id: string) => Promise<TreatmentWithHistory | null>>(async (id) =>
    book !== null && id === book.id ? book : null,
  )
  const repository = fakeTreatmentsRepository({ getWithHistory: read, remove: async () => {} })
  remove = repository.remove
  provideTreatmentsRepository(() => repository)
  provideTreatmentRemindersService(() => ({
    reschedule: vi.fn<(id: string) => Promise<void>>(async () => {}),
  }))
  service = {
    record: vi.fn<TreatmentDosesService['record']>(),
    undo: vi.fn<TreatmentDosesService['undo']>(async () => {}),
    apply: vi.fn<TreatmentDosesService['apply']>(async () => APPLIED),
    undoBatch: vi.fn<TreatmentDosesService['undoBatch']>(async () => {}),
  }
  provideTreatmentDosesService(() => service)
  stop = {
    stop: vi.fn<TreatmentStopService['stop']>(async () => ({ animalId: LUNA.id, stopped: true })),
    undo: vi.fn<TreatmentStopService['undo']>(async () => {}),
  }
  provideTreatmentStopService(() => stop)
  await router.push({ name: 'animals' })
  await router.push({ name: 'treatment-detail', params: { id: METACAM.id } })
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

async function monter(shown: TreatmentWithHistory | null = METACAM) {
  book = shown
  wrapper = mount(TreatmentDetailView, {
    props: { id: METACAM.id },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(element: { text(): string }): string {
  return element.text().replace(NBSP, ' ')
}

function textes(view: VueWrapper, selector: string): string[] {
  return view.findAll(selector).map(texte)
}

function lignes(view: VueWrapper): string[] {
  return view
    .findAllComponents(HistoryRow)
    .map((row) => String(row.props('date')).replace(NBSP, ' '))
}

function ligne(view: VueWrapper, date: string) {
  const row = view
    .findAllComponents(HistoryRow)
    .find((candidate) => String(candidate.props('date')).replace(NBSP, ' ') === date)
  if (!row) throw new Error(`Pas de ligne « ${date} »`)
  return row
}

async function choisir(view: VueWrapper, date: string, action: string) {
  ligne(view, date).vm.$emit('select', action)
  await flushPromises()
}

function dansLaFeuille(selector: string): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>(selector)]
}

function dialogue(view: VueWrapper, title: string) {
  const found = view
    .findAllComponents(ConfirmDialog)
    .find((candidate) => candidate.props('title').replace(NBSP, ' ') === title)
  if (!found) throw new Error(`Pas de dialogue « ${title} »`)
  return found
}

function message(): string | undefined {
  return toastMessage.value?.replace(NBSP, ' ')
}

describe('TreatmentDetailView — carte de la dose du moment', () => {
  it('présente le traitement, son rythme et sa posologie (planche A · V3 ter)', async () => {
    const view = await monter()

    expect(view.get('.pushed-screen__title').text()).toBe('Métacam')
    expect(view.get('.pushed-screen__subtitle').text()).toBe('Médicament · Luna')
    expect(texte(view.get('.treatment-dose-card__setting--rhythm'))).toBe(
      'Tous les jours · 8 h et 20 h',
    )
    expect(texte(view.get('.treatment-dose-card__setting--dosage'))).toBe('0,3 ml')
  })

  it('à plusieurs heures, donne chaque heure du jour sans prise avec son « C’est fait », même passée', async () => {
    const view = await monter()

    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Dose du jour', 'Dose du jour'])
    expect(textes(view, '.treatment-dose-card__value')).toEqual([
      '28 sept. à 8 h',
      '28 sept. à 20 h',
    ])
    expect(
      view
        .findAll('.treatment-dose-card__done')
        .map((button) => button.attributes('aria-label')?.replace(NBSP, ' ')),
    ).toEqual([
      'C’est fait : noter la dose de 8 h du 28 sept. de Métacam pour Luna',
      'C’est fait : noter la dose de 20 h du 28 sept. de Métacam pour Luna',
    ])
    expect(textes(view, '.treatment-dose-card__other-date')).toEqual(['Fait à une autre date'])
  })

  it('« C’est fait » note l’heure touchée, aujourd’hui, et le toast dit l’heure, avec « Annuler »', async () => {
    const view = await monter()

    await view.findAll('.treatment-dose-card__done')[0]!.trigger('click')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' },
        givenOn: '2026-09-28',
      },
    })
    expect(message()).toBe('Prise de 8 h de Métacam notée pour Luna')
    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la prise de Métacam')

    runToastAction()
    await flushPromises()

    expect(service.undoBatch).toHaveBeenCalledWith(METACAM.id, APPLIED.undo)
  })

  it('relit la fiche après la prise : il ne reste que l’heure à donner', async () => {
    const view = await monter()
    service.apply.mockImplementation(async () => {
      book = treatment(
        [MATIN_ET_SOIR],
        [...HIER, dose('2026-09-28', '2026-09-28', { dueTime: '08:00' })],
      )
      return APPLIED
    })

    await view.findAll('.treatment-dose-card__done')[0]!.trigger('click')
    await flushPromises()

    expect(textes(view, '.treatment-dose-card__value')).toEqual(['28 sept. à 20 h'])
    expect(lignes(view)[0]).toBe('28 sept. 2026 · 8 h')
  })

  it('ne note qu’une prise sur un double tap', async () => {
    let terminer: () => void = () => {}
    service.apply.mockReturnValue(
      new Promise((resolve) => {
        terminer = () => resolve(APPLIED)
      }),
    )
    const view = await monter()
    const card = view.getComponent(TreatmentDoseCard)
    const due = { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' }

    card.vm.$emit('done', due)
    card.vm.$emit('done', due)
    terminer()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledOnce()
  })

  it('dit sans « Annuler » qu’une échéance était déjà notée', async () => {
    service.apply.mockResolvedValue({ ...APPLIED, undo: [], alreadyGivenOn: '2026-09-28' })
    const view = await monter()

    await view.findAll('.treatment-dose-card__done')[0]!.trigger('click')
    await flushPromises()

    expect(message()).toBe('Prise de Métacam déjà notée aujourd’hui pour Luna')
    expect(toastAction.value).toBeNull()
  })

  it('dit l’échec d’un geste et relit la fiche', async () => {
    service.apply.mockRejectedValue(new RangeError('Échéance inconnue du calendrier'))
    const view = await monter()
    const lectures = read.mock.calls.length

    await view.findAll('.treatment-dose-card__done')[0]!.trigger('click')
    await flushPromises()

    expect(message()).toBe('La modification n’a pas abouti. Réessaie.')
    expect(read).toHaveBeenCalledTimes(lectures + 1)
  })

  it('une prochaine dose à venir se note en avance, sans heure pour un traitement sans heure', async () => {
    const view = await monter(MILBEMAX)

    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Prochaine dose'])
    expect(textes(view, '.treatment-dose-card__value')).toEqual(['14 oct.'])

    await view.get('.treatment-dose-card__done').trigger('click')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(MILBEMAX.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-10-14', dueTime: null },
        givenOn: '2026-09-28',
      },
    })
    expect(message()).toBe('Prise de Métacam notée pour Luna')
  })

  it('dit le retard d’une dose passée, encore à noter', async () => {
    const view = await monter(
      treatment([period({ frequency: { value: 1, unit: 'week' }, firstDueOn: '2026-09-22' })]),
    )

    expect(view.find('.treatment-dose-card__label').exists()).toBe(false)
    expect(textes(view, '.treatment-dose-card__value--overdue')).toEqual([
      'en retard depuis le 22 sept.',
    ])
    expect(view.find('.treatment-dose-card__done').exists()).toBe(true)
  })
})

describe('TreatmentDetailView — « Fait à une autre date »', () => {
  async function ouvrir(shown: TreatmentWithHistory = METACAM) {
    const view = await monter(shown)
    await view.get('.treatment-dose-card__other-date').trigger('click')
    await flushPromises()
    return view
  }

  async function choisirLeJour(view: VueWrapper, date: string) {
    view.getComponent(DateCalendar).vm.$emit('update:modelValue', date)
    await flushPromises()
  }

  it('demande le jour, puis l’heure quand il y en a plusieurs (planches A · V3 ter bis et ter ter)', async () => {
    const view = await ouvrir()

    expect(dansLaFeuille('.bottom-sheet__title')[0]!.textContent).toBe('Fait à une autre date')
    expect(dansLaFeuille('.bottom-sheet__subtitle')[0]!.textContent).toBe('Métacam · Luna')
    expect(view.getComponent(DateCalendar).props()).toMatchObject({
      modelValue: '2026-09-28',
      min: '2023-04-10',
      max: '2026-09-28',
      excluded: [],
    })
    expect(dansLaFeuille('.treatment-other-date__submit')[0]!.textContent?.trim()).toBe('Suivant')

    await choisirLeJour(view, '2026-09-27')
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(dansLaFeuille('.bottom-sheet__title')[0]!.textContent?.replace(NBSP, ' ')).toBe(
      'À quelle heure ?',
    )
    expect(dansLaFeuille('.bottom-sheet__subtitle')[0]!.textContent).toBe(
      'Métacam · Luna · 27 sept.',
    )
    expect(
      dansLaFeuille('.treatment-other-date__hour').map((hour) => [
        hour.querySelector('.treatment-other-date__hour-detail')?.textContent?.replace(NBSP, ' '),
        hour.disabled,
      ]),
    ).toEqual([
      ['Dose de 8 h · déjà notée', true],
      ['Dose de 20 h · déjà notée', true],
    ])
  })

  it('note l’heure touchée en un tap, pour le jour choisi, et ferme la feuille', async () => {
    const view = await ouvrir()
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    const [, soir] = dansLaFeuille('.treatment-other-date__hour')
    expect(soir!.textContent?.replace(NBSP, ' ')).toContain('Dose de 20 h · pas encore notée')
    soir!.click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' },
        givenOn: '2026-09-28',
      },
    })
    expect(message()).toBe('Prise de 20 h de Métacam notée pour Luna')
    expect(view.findComponent(DateCalendar).exists()).toBe(false)
  })

  it('revient au choix du jour', async () => {
    const view = await ouvrir()
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    dansLaFeuille('.bottom-sheet__back')[0]!.click()
    await flushPromises()

    expect(view.findComponent(DateCalendar).exists()).toBe(true)
  })

  it('sans heures multiples, note le jour choisi sans demander l’heure, jamais un jour déjà donné', async () => {
    const quotidien = treatment(
      [period({ startsOn: '2026-09-24', firstDueOn: '2026-09-24' })],
      [dose('2026-09-24', '2026-09-25'), missed('2026-09-25', '2026-09-26')],
    )
    const view = await ouvrir(quotidien)

    expect(view.getComponent(DateCalendar).props('excluded')).toEqual(['2026-09-24'])

    await choisirLeJour(view, '2026-09-25')
    expect(dansLaFeuille('.treatment-other-date__submit')[0]!.textContent?.trim()).toBe(
      'Noter la prise du 25 sept.',
    )
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(quotidien.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null },
        givenOn: '2026-09-25',
      },
    })
    expect(message()).toBe('Prise de Métacam du 25 sept. notée pour Luna')
  })

  it('garde la feuille ouverte quand la prise n’a pas pu être notée', async () => {
    service.apply.mockRejectedValue(new Error('base verrouillée'))
    const view = await ouvrir()
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    dansLaFeuille('.treatment-other-date__hour')[1]!.click()
    await flushPromises()

    expect(dansLaFeuille('.treatment-other-date__hour')).toHaveLength(2)
    expect(view.findComponent(DateCalendar).exists()).toBe(false)
    expect(message()).toBe('La modification n’a pas abouti. Réessaie.')
  })
})

describe('TreatmentDetailView — historique', () => {
  const AVANT = period({ times: ['08:00'], doseQuantity: 0.5, doseUnit: 'ml' })
  const DEPUIS = { ...MATIN_ET_SOIR, id: 'p-2', startsOn: '2026-09-21', firstDueOn: '2026-09-21' }
  const DEUX_PERIODES = treatment(
    [AVANT, DEPUIS],
    [
      dose('2026-09-19', '2026-09-20', { dueTime: '08:00' }),
      dose('2026-09-20', '2026-09-21', { dueTime: '08:00' }),
      dose('2026-09-25', '2026-09-25', { dueTime: '08:00', periodId: 'p-2' }),
      missed('2026-09-25', '2026-09-26', { dueTime: '20:00', periodId: 'p-2' }),
      missed('2026-09-26', '2026-09-26', { dueTime: '08:00', periodId: 'p-2' }),
      dose('2026-09-26', '2026-09-27', { dueTime: '20:00', periodId: 'p-2' }),
      dose('2026-09-27', '2026-09-27', {
        dueTime: '08:00',
        periodId: 'p-2',
        givenOn: '2026-09-28',
      }),
    ],
  )

  it('compte les prises données et les range par période, rythme en tête (planche A · V3)', async () => {
    const view = await monter(DEUX_PERIODES)

    expect(view.get('.section-card__title').text()).toBe('Prises')
    expect(view.get('.section-card__counter').text()).toBe('5 depuis le 19 sept. 2026')
    expect(textes(view, '.treatment-history__head-title')).toEqual([
      'Depuis le 21 sept. 2026',
      'Du 1 sept. au 20 sept. 2026',
    ])
    expect(textes(view, '.treatment-history__head-settings')).toEqual([
      'Tous les jours · 8 h et 20 h · 0,3 ml',
      'Tous les jours · 8 h · 0,5 ml',
    ])
  })

  it('écrit l’échéance en titre, « Donnée le … » dessous, « Dernière prise » sur la dernière donnée', async () => {
    const view = await monter(DEUX_PERIODES)
    const derniere = ligne(view, '27 sept. 2026 · 8 h')

    expect(derniere.props()).toMatchObject({
      badge: 'Dernière prise',
      detail: 'Donnée le 28 sept. 2026',
      muted: false,
    })
    expect(ligne(view, '26 sept. 2026 · 20 h').props()).toMatchObject({ badge: null, detail: null })
    expect(view.text()).not.toContain('A fixé la dose')
  })

  it('regroupe en gris les oubliées qui se suivent, chacune avec son menu une fois dépliée', async () => {
    const view = await monter(DEUX_PERIODES)
    const groupe = view.get('.treatment-history__group')

    expect(texte(groupe)).toBe('Oubliées · du 25 sept. au 26 sept. 2026')
    expect(groupe.attributes('aria-expanded')).toBe('false')

    await groupe.trigger('click')

    expect(lignes(view)).toContain('Oubliée · 26 sept. 2026, 8 h')
    const oubliee = ligne(view, 'Oubliée · 25 sept. 2026, 20 h')
    expect(oubliee.props('muted')).toBe(true)
    expect(String(oubliee.props('optionsLabel')).replace(NBSP, ' ')).toBe(
      'Options pour la prise du 25 septembre 2026 à 20 h',
    )
    expect(
      ligne(view, 'Oubliée · 25 sept. 2026, 20 h')
        .props('items')
        .map(({ label }: { label: string }) => label),
    ).toEqual(['Marquer comme donnée', 'Supprimer cette prise'])
  })

  it('replie chaque période après ses premières lignes, et la déplie', async () => {
    const view = await monter(DEUX_PERIODES)

    expect(lignes(view)).toEqual([
      '27 sept. 2026 · 8 h',
      '26 sept. 2026 · 20 h',
      '20 sept. 2026',
      '19 sept. 2026',
    ])
    const [voir] = view.findAll('.treatment-history__toggle')
    expect(texte(voir!)).toBe('Voir l’autre prise de cette période')

    await voir!.trigger('click')

    expect(lignes(view)).toContain('25 sept. 2026 · 8 h')
    expect(texte(view.get('.treatment-history__toggle'))).toBe(
      'Masquer les autres prises de cette période',
    )
  })

  it('dit qu’une période n’a encore aucune prise', async () => {
    const view = await monter(
      treatment([period({ startsOn: '2026-09-29', firstDueOn: '2026-09-29' })]),
    )

    expect(view.get('.treatment-history__empty').text()).toBe(
      'Aucune prise dans cette période pour l’instant',
    )
    expect(view.find('.section-card__counter').exists()).toBe(false)
  })
})

describe('TreatmentDetailView — menu ⋮ d’une prise', () => {
  it('propose de changer la date, de la marquer oubliée et de la supprimer', async () => {
    const view = await monter()

    expect(
      ligne(view, '27 sept. 2026 · 20 h')
        .props('items')
        .map(({ label }: { label: string }) => label),
    ).toEqual(['Changer la date', 'Marquer comme oubliée', 'Supprimer cette prise'])
  })

  it('supprime une prise sans dialogue, même la seule, toast avec « Annuler »', async () => {
    const seule = treatment(
      [period({ firstDueOn: '2026-09-27', startsOn: '2026-09-27' })],
      [dose('2026-09-27', '2026-09-28')],
    )
    const view = await monter(seule)

    await choisir(view, '27 sept. 2026', 'remove')

    expect(service.apply).toHaveBeenCalledWith(seule.id, { kind: 'remove', doseId: '2026-09-27' })
    expect(message()).toBe('Prise du 27 sept. supprimée')
    expect(toastAction.value?.ariaLabel).toBe(
      'Annuler la suppression de la prise du 27 septembre 2026',
    )
    expect(view.findComponent(ConfirmDialog).props('modelValue')).toBe(false)

    runToastAction()
    await flushPromises()

    expect(service.undoBatch).toHaveBeenCalledWith(seule.id, APPLIED.undo)
  })

  it('marque une prise oubliée', async () => {
    const view = await monter()

    await choisir(view, '27 sept. 2026 · 20 h', 'mark-missed')

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: { kind: 'missed', due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' } },
    })
    expect(message()).toBe('Prise du 27 sept. à 20 h marquée comme oubliée')
    expect(toastAction.value?.label).toBe('Annuler')
  })

  it('change la date d’une prise, jusqu’à aujourd’hui, et dit le report gardé (TR-24 bis)', async () => {
    service.apply.mockResolvedValue({
      ...APPLIED,
      postponement: { kept: true, nextDueDate: '2026-10-14' },
    })
    const view = await monter(MILBEMAX)

    await choisir(view, '10 juil. 2026', 'change-date')

    const calendrier = view.getComponent(DatePickerSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      title: 'Changer la date',
      subtitle: 'Prise du 10 juil. 2026',
      date: '2026-07-10',
      min: '2023-04-10',
      max: '2026-09-28',
    })

    calendrier.vm.$emit('pick', '2026-07-08')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(MILBEMAX.id, {
      kind: 'redate',
      doseId: '2026-07-10',
      givenOn: '2026-07-08',
    })
    expect(message()).toBe(
      'Prise déplacée au 8 juil. Prochaine dose gardée au 14 oct., que tu avais reportée.',
    )
    expect(toastAction.value?.ariaLabel).toBe('Annuler le changement de date de la prise')
  })
})

describe('TreatmentDetailView — ligne « Reportée » (planche A · V1 quinquies bis)', () => {
  const REPORT = 'Reportée au 14 oct. 2026 (prévue le 10 oct.)'

  it('s’écrit en ligne discrète, avec « Changer la date » et « Supprimer ce report »', async () => {
    const view = await monter(MILBEMAX)

    expect(lignes(view)).toEqual([REPORT, '10 juil. 2026', '10 avr. 2026'])
    expect(ligne(view, REPORT).props()).toMatchObject({ muted: true, icon: 'ms:event_repeat' })
    expect(
      ligne(view, REPORT)
        .props('items')
        .map(({ label }: { label: string }) => label),
    ).toEqual(['Changer la date', 'Supprimer ce report'])
  })

  it('supprime le report, toast avec « Annuler »', async () => {
    const view = await monter(MILBEMAX)

    await choisir(view, REPORT, 'remove-move')

    expect(service.apply).toHaveBeenCalledWith(MILBEMAX.id, {
      kind: 'remove-move',
      doseId: 'report 2026-10-10',
    })
    expect(message()).toBe('Report supprimé')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la suppression du report')
  })

  it('change sa date entre les bornes du moteur', async () => {
    const view = await monter(MILBEMAX)

    await choisir(view, REPORT, 'change-date')

    const calendrier = view.getComponent(DatePickerSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      subtitle: REPORT,
      date: '2026-10-14',
      min: '2026-09-28',
      max: null,
    })

    calendrier.vm.$emit('pick', '2026-10-16')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(MILBEMAX.id, {
      kind: 'move',
      doseId: 'report 2026-10-10',
      to: '2026-10-16',
    })
    expect(message()).toBe('Dose reportée au 16 oct.')
  })

  it('n’a plus de menu quand la dose d’arrivée est notée (Q25)', async () => {
    const view = await monter(
      treatment(
        [TRIMESTRIEL],
        [
          dose('2026-04-10', '2026-07-10'),
          postponed('2026-07-10', '2026-07-14', { createdAt: '2026-07-01T08:00:00.000Z' }),
          dose('2026-07-14', '2026-10-14', { createdAt: '2026-07-14T08:00:00.000Z' }),
        ],
      ),
    )

    const report = ligne(view, 'Reportée au 14 juil. 2026 (prévue le 10 juil.)')

    expect(report.props('items')).toEqual([])
    expect(report.findComponent(OverflowMenu).exists()).toBe(false)
  })
})

describe('TreatmentDetailView — barre du haut et fin du traitement', () => {
  it('le crayon ouvre le formulaire, qui reviendra sur la fiche', async () => {
    const view = await monter()
    const crayon = view.get('.treatment-detail__edit')

    expect(crayon.attributes('aria-label')).toBe('Modifier')
    await crayon.trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'treatment-edit',
      params: { id: METACAM.id },
      query: { from: 'treatment-detail', reminder: `treatment:${METACAM.id}` },
    })
  })

  it('« Supprimer ce traitement » est dans le menu ⋮, et demande confirmation', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()
    const menu = view.get('.pushed-screen__end').getComponent(OverflowMenu)

    expect(menu.props('items')).toMatchObject([{ label: 'Supprimer ce traitement', danger: true }])
    menu.vm.$emit('select', 'remove')
    await flushPromises()

    const suppression = dialogue(view, 'Supprimer Métacam ?')
    expect(suppression.props('modelValue')).toBe(true)
    suppression.vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(METACAM.id)
    expect(message()).toBe('Traitement Métacam supprimé')
    expect(back).toHaveBeenCalled()
  })

  it('arrête le traitement après confirmation', async () => {
    const view = await monter()

    await view.get('.treatment-detail__stop').trigger('click')
    const arret = dialogue(view, 'Arrêter Métacam ?')
    expect(arret.props('modelValue')).toBe(true)
    arret.vm.$emit('confirm')
    await flushPromises()

    expect(stop.stop).toHaveBeenCalledWith(METACAM.id)
  })

  it('après la date de fin, dit la fin du traitement, sans dose ni geste (TR-12)', async () => {
    const view = await monter(
      treatment(
        [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', endsOn: '2026-09-21' })],
        [dose('2026-09-20', '2026-09-21'), dose('2026-09-21', '2026-09-22')],
      ),
    )

    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Fin du traitement'])
    expect(view.find('.treatment-dose-card__value').exists()).toBe(false)
    expect(view.find('.treatment-dose-card__done').exists()).toBe(false)
    expect(view.find('.treatment-dose-card__other-date').exists()).toBe(false)
    expect(view.find('.treatment-detail__stop').exists()).toBe(false)
  })

  it('arrêté, dit quand, propose de reprendre, plus de modifier ni d’arrêter', async () => {
    const view = await monter(
      treatment([period({ stoppedOn: '2026-09-26' })], [dose('2026-09-01', '2026-09-02')]),
    )

    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Fin du traitement'])
    expect(textes(view, '.treatment-dose-card__value')).toEqual(['Arrêté le 26 sept.'])
    expect(view.find('.treatment-dose-card__done').exists()).toBe(false)
    expect(view.find('.treatment-detail__edit').exists()).toBe(false)
    expect(view.find('.treatment-detail__stop').exists()).toBe(false)

    await view.get('.treatment-detail__resume-button').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'treatment-resume',
      params: { id: METACAM.id },
      query: { from: 'treatment-detail', reminder: `treatment:${METACAM.id}` },
    })
  })

  it('dit qu’un traitement est introuvable, ou illisible', async () => {
    expect((await monter(null)).get('[role="alert"]').text()).toBe('Ce traitement est introuvable.')
    wrapper?.unmount()

    const illisible = await monter(treatment([period({ times: ['8h'] })]))

    expect(illisible.get('[role="alert"]').text()).toBe(
      i18n.global.t('treatments.form.errors.load'),
    )
  })
})
