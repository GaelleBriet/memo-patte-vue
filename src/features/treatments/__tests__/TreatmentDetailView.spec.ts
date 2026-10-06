import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createRouter, createWebHistory, type Router } from 'vue-router'
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
import { dose, missed, period, postponed, shifted, treatment } from './treatment-fixtures'
import { DoseAlreadyLoggedError } from '../logic/treatment-dose-writes'
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
import TreatmentChooseDays from '../views/TreatmentChooseDays.vue'
import TreatmentChangeDateSheet from '../views/TreatmentChangeDateSheet.vue'
import TreatmentDetailView from '../views/TreatmentDetailView.vue'
import TreatmentDoseCard from '../views/TreatmentDoseCard.vue'
import TreatmentStopDialog from '../views/TreatmentStopDialog.vue'
import TreatmentUnloggedPrompt from '../views/TreatmentUnloggedPrompt.vue'
import i18n from '@/core/i18n'
import {
  getExactRemindersStatus,
  type ExactRemindersStatus,
} from '@/core/notifications/exact-reminders'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import { routes } from '@/router'
import { sansEcran } from '@/router/__tests__/routeur-memoire'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import OverflowMenu from '@/shared/components/OverflowMenu.vue'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastAnnouncement,
  toastMessage,
  toastTone,
} from '@/shared/utils/toast'

vi.mock('@/core/notifications/exact-reminders', () => ({
  getExactRemindersStatus: vi.fn<() => Promise<ExactRemindersStatus>>(),
  openExactRemindersSettings: vi.fn<() => Promise<ExactRemindersStatus>>(),
}))

const TODAY = new Date('2026-09-28T21:00:00')
const NBSP = / /g

const REMOVED_AT = '2026-09-28T19:00:00.000Z'

const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: '2023-04-10',
  birthDateApproximate: false,
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
  finishes: false,
  moved: null,
  shiftKept: false,
}

let book: TreatmentWithHistory | null
let remove: MockInstance
let restore: MockInstance
let reschedule: Mock<(id: string) => Promise<void>>
let read: Mock<(id: string) => Promise<TreatmentWithHistory | null>>
let push: MockInstance
let service: {
  [K in 'apply' | 'noteMoment' | 'undoBatch']: Mock<TreatmentDosesService[K]>
}
let stop: { [K in 'stop' | 'undo']: Mock<TreatmentStopService[K]> }
let wrapper: VueWrapper | null = null
let router: Router

beforeEach(async () => {
  vi.useFakeTimers({ now: TODAY, toFake: ['Date'] })
  vi.mocked(getExactRemindersStatus).mockResolvedValue('precise')
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
  const repository = fakeTreatmentsRepository({
    getWithHistory: read,
    remove: async () => REMOVED_AT,
    restore: async () => {},
  })
  remove = repository.remove
  restore = repository.restore
  provideTreatmentsRepository(() => repository)
  reschedule = vi.fn<(id: string) => Promise<void>>(async () => {})
  provideTreatmentRemindersService(() => ({ reschedule }))
  service = {
    noteMoment: vi.fn<TreatmentDosesService['noteMoment']>(),
    apply: vi.fn<TreatmentDosesService['apply']>(async () => APPLIED),
    undoBatch: vi.fn<TreatmentDosesService['undoBatch']>(async () => {}),
  }
  provideTreatmentDosesService(() => service)
  stop = {
    stop: vi.fn<TreatmentStopService['stop']>(async () => ({
      animalId: LUNA.id,
      stopped: true,
      finished: true,
      undo: [],
    })),
    undo: vi.fn<TreatmentStopService['undo']>(async () => {}),
  }
  provideTreatmentStopService(() => stop)
  router = createRouter({ history: createWebHistory(), routes: routes.map(sansEcran) })
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
  router.options.history.destroy()
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

describe('TreatmentDetailView — rappels précis retirés (TR-34, planche A · V2 quater)', () => {
  it('dit sous les heures « Rappel 30 min avant · peut arriver en retard », et « Réactiver » ouvre l’écran d’explication', async () => {
    vi.mocked(getExactRemindersStatus).mockResolvedValue('removed')
    const view = await monter(treatment([{ ...MATIN_ET_SOIR, reminderOffsetMinutes: 30 }], HIER))
    const ligne = view.get('.treatment-dose-card__less-precise')

    expect(texte(ligne.get('span'))).toBe('Rappel 30 min avant · peut arriver en retard')
    expect(ligne.get('button').text()).toBe('Réactiver')
    expect(ligne.get('button').attributes('aria-label')).toBe('Réactiver les rappels précis')

    await ligne.get('button').trigger('click')
    await flushPromises()

    expect(document.body.textContent).toContain('Recevoir les rappels à l’heure pile')
  })

  it('ne dit rien quand les rappels précis sont actifs, ni pour un traitement sans heure', async () => {
    const actifs = await monter()
    expect(actifs.find('.treatment-dose-card__less-precise').exists()).toBe(false)
    actifs.unmount()

    vi.mocked(getExactRemindersStatus).mockResolvedValue('removed')
    const sansHeure = await monter(MILBEMAX)
    expect(sansHeure.find('.treatment-dose-card__less-precise').exists()).toBe(false)
  })
})

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

  it('dit où retrouver le traitement quand la prise notée le termine (TR-31)', async () => {
    const view = await monter()
    service.apply.mockResolvedValue({ ...APPLIED, finishes: true })

    await view.findAll('.treatment-dose-card__done')[1]!.trigger('click')
    await flushPromises()

    expect(message()).toBe('Dernière dose de Métacam notée, à retrouver dans Traitements terminés.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la prise de Métacam')
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

  it('passé minuit, écran resté ouvert, « C’est fait » note la prise au jour qu’il est', async () => {
    const view = await monter()
    vi.setSystemTime(new Date('2026-09-29T00:05:00'))

    await view.findAll('.treatment-dose-card__done')[0]!.trigger('click')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '08:00' },
        givenOn: '2026-09-29',
      },
    })
    expect(textes(view, '.treatment-dose-card__value')).toEqual([
      '29 sept. à 8 h',
      '29 sept. à 20 h',
    ])
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
      excluded: ['2026-09-27'],
    })
    expect(dansLaFeuille('.treatment-other-date__submit')[0]!.textContent?.trim()).toBe('Suivant')

    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(dansLaFeuille('.bottom-sheet__title')[0]!.textContent?.replace(NBSP, ' ')).toBe(
      'À quelle heure ?',
    )
    expect(dansLaFeuille('.bottom-sheet__subtitle')[0]!.textContent).toBe(
      'Métacam · Luna · 28 sept.',
    )
    expect(
      dansLaFeuille('.treatment-hours__hour').map((hour) => [
        hour.querySelector('.treatment-hours__detail')?.textContent?.replace(NBSP, ' '),
        hour.disabled,
      ]),
    ).toEqual([
      ['Dose de 8 h · pas encore notée', false],
      ['Dose de 20 h · pas encore notée', false],
    ])
  })

  it('grise l’heure déjà donnée du jour choisi', async () => {
    const view = await ouvrir(
      treatment([MATIN_ET_SOIR], [dose('2026-09-27', '2026-09-27', { dueTime: '08:00' })]),
    )

    await choisirLeJour(view, '2026-09-27')
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(
      dansLaFeuille('.treatment-hours__hour').map((hour) => [
        hour.querySelector('.treatment-hours__detail')?.textContent?.replace(NBSP, ' '),
        hour.disabled,
      ]),
    ).toEqual([
      ['Dose de 8 h · déjà notée', true],
      ['Dose de 20 h · pas encore notée', false],
    ])
  })

  it('pour un jour d’une période à une seule heure, note sans demander l’heure, à l’échéance de ce jour', async () => {
    const deuxPeriodes = treatment([
      period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', times: ['09:00'] }),
      {
        ...MATIN_ET_SOIR,
        id: 'p-2',
        startsOn: '2026-09-27',
        firstDueOn: '2026-09-27',
        createdAt: '2026-09-27T08:00:00.000Z',
      },
    ])
    const view = await ouvrir(deuxPeriodes)

    await choisirLeJour(view, '2026-09-24')
    expect(dansLaFeuille('.treatment-other-date__submit')[0]!.textContent?.trim()).toBe(
      'Noter la prise du 24 sept.',
    )
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(dansLaFeuille('.treatment-hours__hour')).toHaveLength(0)
    expect(service.apply).toHaveBeenCalledWith(deuxPeriodes.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-24', dueTime: '09:00' },
        givenOn: '2026-09-24',
      },
    })
  })

  it('note l’heure choisie, puis « Enregistrer », pour le jour choisi, et ferme la feuille (V29 bis)', async () => {
    const view = await ouvrir()
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    const [, soir] = dansLaFeuille('.treatment-hours__hour')
    expect(soir!.textContent?.replace(NBSP, ' ')).toContain('Dose de 20 h · pas encore notée')
    soir!.click()
    await flushPromises()
    expect(service.apply).not.toHaveBeenCalled()
    expect(soir!.getAttribute('aria-pressed')).toBe('true')
    expect(dansLaFeuille('.treatment-other-date__submit')[0]!.textContent?.trim()).toBe(
      'Enregistrer',
    )
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
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

    dansLaFeuille('.treatment-hours__hour')[1]!.click()
    await flushPromises()
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(dansLaFeuille('.treatment-hours__hour')).toHaveLength(2)
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
      'Du 1er sept. au 20 sept. 2026',
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

    const calendrier = view.getComponent(TreatmentChangeDateSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      subtitle: 'Prise du 10 juil. 2026',
      date: '2026-07-10',
      min: '2026-04-11',
      max: '2026-09-28',
      excluded: [],
    })

    calendrier.vm.$emit('save', '2026-07-08', true)
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

    const calendrier = view.getComponent(TreatmentChangeDateSheet)
    expect(calendrier.props()).toMatchObject({
      modelValue: true,
      subtitle: REPORT,
      date: '2026-10-14',
      min: '2026-09-28',
      max: null,
    })

    service.apply.mockResolvedValue({
      ...APPLIED,
      moved: {
        periodId: 'p-1',
        dueOn: '2026-10-10',
        dueTime: null,
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-10-16',
      },
    })
    calendrier.vm.$emit('save', '2026-10-16', true)
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

describe('TreatmentDetailView — « Décaler aussi les doses suivantes » (V29, V31)', () => {
  // Vermifuge tous les vendredis ; aujourd'hui lundi 28 sept.
  const VENDREDI = period({
    frequency: { value: 1, unit: 'week' },
    startsOn: '2026-09-18',
    firstDueOn: '2026-09-18',
  })
  const DECALAGE = 'Doses suivantes décalées · prochaine le 6 oct.'

  it('la ligne de décalage, discrète, se supprime seule, toast avec « Annuler »', async () => {
    const view = await monter(
      treatment(
        [VENDREDI],
        [
          dose('2026-09-18', '2026-09-25'),
          shifted('2026-09-25', '2026-09-29'),
          postponed('2026-09-25', '2026-09-29'),
        ],
      ),
    )

    expect(lignes(view)).toEqual([
      'Reportée au 29 sept. 2026 (prévue le 25 sept.)',
      DECALAGE,
      '18 sept. 2026',
    ])
    expect(ligne(view, DECALAGE).props()).toMatchObject({ muted: true, icon: 'ms:event_upcoming' })
    expect(
      ligne(view, DECALAGE)
        .props('items')
        .map(({ label }: { label: string }) => label),
    ).toEqual(['Supprimer ce décalage'])

    await choisir(view, DECALAGE, 'remove-shift')

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'remove-shift',
      doseId: 'décalage 2026-09-25',
    })
    expect(message()).toBe('Décalage supprimé. Les doses suivantes reviennent au vendredi.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la suppression du décalage')
  })

  it('« Fait à une autre date » refusé case cochée : rien ne s’enregistre ; décochée, la prise seule (Q2 a)', async () => {
    vi.setSystemTime(new Date('2026-10-14T21:00:00'))
    const view = await monter(
      treatment(
        [
          {
            ...VENDREDI,
            startsOn: '2026-10-02',
            firstDueOn: '2026-10-02',
            referenceOn: '2026-10-02',
          },
        ],
        [dose('2026-10-02', '2026-10-09'), postponed('2026-10-16', '2026-10-22')],
      ),
    )
    await view.get('.treatment-dose-card__other-date').trigger('click')
    await flushPromises()

    const enregistrer = () => dansLaFeuille('.treatment-other-date__submit')[0]!
    expect(enregistrer().disabled).toBe(true)
    expect(dansLaFeuille('.treatment-shift__help')[0]!.textContent?.replace(NBSP, ' ')).toBe(
      'Ce jour ferait passer le report du 22 oct. après la dose suivante : décoche la case, ou change d’abord la date du report.',
    )

    ;(dansLaFeuille('.treatment-shift__input')[0] as unknown as HTMLInputElement).click()
    await flushPromises()
    expect(enregistrer().disabled).toBe(false)
    enregistrer().click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-10-09', dueTime: null },
        givenOn: '2026-10-14',
        shiftsFollowing: false,
      },
    })
  })

  it('« Fait à une autre date » : récapitulatif, case cochée, envoyée décochée', async () => {
    const view = await monter(treatment([VENDREDI], [dose('2026-09-18', '2026-09-25')]))
    await view.get('.treatment-dose-card__other-date').trigger('click')
    await flushPromises()

    expect(dansLaFeuille('.treatment-other-date__recap')[0]!.textContent).toBe(
      'Dose du vendredi 25 sept., donnée le lundi 28 sept.',
    )
    const caseDecaler = dansLaFeuille('.treatment-shift__input')[0] as unknown as HTMLInputElement
    expect(caseDecaler.checked).toBe(true)
    expect(dansLaFeuille('.treatment-shift__help')[0]!.textContent?.replace(NBSP, ' ')).toBe(
      'Les doses suivantes passeront au lundi : 5, 12 oct.',
    )

    caseDecaler.click()
    await flushPromises()
    expect(dansLaFeuille('.treatment-shift__help')[0]!.textContent?.replace(NBSP, ' ')).toBe(
      'Seule cette dose change. Les suivantes restent le vendredi : 2, 9 oct.',
    )
    dansLaFeuille('.treatment-other-date__submit')[0]!.click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null },
        givenOn: '2026-09-28',
        shiftsFollowing: false,
      },
    })
  })
})

describe('TreatmentDetailView — « C’est fait » ne décale rien sans l’aval (2026-10-06)', () => {
  // Vermifuge tous les vendredis ; aujourd'hui lundi 28 sept., la dose du 25 est en retard.
  const VENDREDI = period({
    frequency: { value: 1, unit: 'week' },
    startsOn: '2026-09-18',
    firstDueOn: '2026-09-18',
  })
  const EN_RETARD = treatment([VENDREDI], [dose('2026-09-18', '2026-09-25')])
  const DUE_25 = { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null }

  async function cestFait(book: TreatmentWithHistory) {
    const view = await monter(book)
    await view.get('.treatment-dose-card__done').trigger('click')
    await flushPromises()
    return view
  }

  function aide(): string | undefined {
    return dansLaFeuille('.treatment-shift__help')[0]?.textContent?.replace(NBSP, ' ')
  }

  it('sur une dose en retard, demande l’aval, case cochée, dates montrées', async () => {
    await cestFait(EN_RETARD)

    expect(service.apply).not.toHaveBeenCalled()
    expect(dansLaFeuille('.treatment-done-confirm__recap')[0]!.textContent).toBe(
      'Dose du vendredi 25 sept., donnée le lundi 28 sept.',
    )
    expect(
      (dansLaFeuille('.treatment-shift__input')[0] as unknown as HTMLInputElement).checked,
    ).toBe(true)
    expect(aide()).toBe('Les doses suivantes passeront au lundi : 5, 12 oct.')

    dansLaFeuille('.treatment-done-confirm__save')[0]!.click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: { kind: 'given', due: DUE_25, givenOn: '2026-09-28', shiftsFollowing: true },
    })
    expect(message()).toBe('Prise de Métacam notée pour Luna')
    runToastAction()
    await flushPromises()
    expect(service.undoBatch).toHaveBeenCalledWith(METACAM.id, APPLIED.undo)
  })

  it('décochée, la prise seule', async () => {
    await cestFait(EN_RETARD)

    ;(dansLaFeuille('.treatment-shift__input')[0] as unknown as HTMLInputElement).click()
    await flushPromises()
    expect(aide()).toBe('Seule cette dose change. Les suivantes restent le vendredi : 2, 9 oct.')
    dansLaFeuille('.treatment-done-confirm__save')[0]!.click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: { kind: 'given', due: DUE_25, givenOn: '2026-09-28', shiftsFollowing: false },
    })
  })

  it('« Annuler » sur la confirmation n’écrit rien', async () => {
    await cestFait(EN_RETARD)

    dansLaFeuille('.treatment-done-confirm__cancel')[0]!.click()
    await flushPromises()

    expect(service.apply).not.toHaveBeenCalled()
    expect(message()).toBeUndefined()
  })

  it('avec une date de fin, avertit de la dose perdue (V28 bis)', async () => {
    await cestFait(treatment([{ ...VENDREDI, endsOn: '2026-10-09' }], EN_RETARD.doses))

    expect(aide()).toBe('Avec le décalage, la dose du 9 oct. ne sera plus prévue (date de fin).')
  })

  it('sur une dose donnée en avance aussi', async () => {
    await cestFait(treatment([VENDREDI], [...EN_RETARD.doses, dose('2026-09-25', '2026-10-02')]))

    expect(service.apply).not.toHaveBeenCalled()
    expect(dansLaFeuille('.treatment-done-confirm__recap')[0]!.textContent).toBe(
      'Dose du vendredi 2 oct., donnée le lundi 28 sept.',
    )
  })

  it('un report seul bloque le décalage : un tap, la prise seule, le toast le dit (Q2 a)', async () => {
    service.apply.mockResolvedValue({ ...APPLIED, heldBy: '2026-10-08' } as typeof APPLIED)
    await cestFait(
      treatment([VENDREDI], [...EN_RETARD.doses, postponed('2026-10-02', '2026-10-08')]),
    )

    expect(service.apply).toHaveBeenCalledWith(METACAM.id, {
      kind: 'note',
      gesture: { kind: 'given', due: DUE_25, givenOn: '2026-09-28' },
    })
    expect(message()).toBe(
      'Prise de Métacam notée pour Luna. La suite ne bouge pas : un report est prévu le 8 oct.',
    )
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

  it('ouverte depuis le Carnet, la flèche s’appelle « Retour au carnet »', async () => {
    const view = await monter()

    expect(view.get('.pushed-screen__back').attributes('aria-label')).toBe('Retour au carnet')
  })

  it('ouverte depuis la feuille « À faire », la flèche ramène à l’accueil (#569)', async () => {
    push.mockRestore()
    await router.push({ name: 'home' })
    await router.push({
      name: 'treatment-detail',
      params: { id: METACAM.id },
      query: { from: 'home' },
    })
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    const view = await monter()

    expect(view.get('.pushed-screen__back').attributes('aria-label')).toBe('Retour à l’accueil')
    await view.get('.pushed-screen__back').trigger('click')

    expect(back).toHaveBeenCalled()
    expect(replace).not.toHaveBeenCalled()
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
    expect(suppression.props('text')).toBe('Ses prises et ses rappels seront supprimés du carnet.')
    expect(message()).toBe('Supprimé')
    expect(back).toHaveBeenCalled()
  })

  it('« Annuler » rétablit le traitement supprimé et ses rappels (planche A · V8 bis)', async () => {
    vi.useFakeTimers({ now: TODAY, toFake: ['Date', 'setTimeout', 'clearTimeout'] })
    vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter()
    dialogue(view, 'Supprimer Métacam ?').vm.$emit('confirm')
    await flushPromises()
    vi.advanceTimersByTime(100)

    expect(toastAnnouncement.value).toBe('Métacam supprimé')
    expect(toastAction.value).toMatchObject({
      label: 'Annuler',
      ariaLabel: 'Annuler la suppression de Métacam',
    })
    reschedule.mockClear()
    runToastAction()
    await flushPromises()

    expect(restore).toHaveBeenCalledExactlyOnceWith(METACAM.id, REMOVED_AT)
    expect(reschedule).toHaveBeenCalledExactlyOnceWith(METACAM.id)
  })

  it('sans dose à renseigner, arrête après une confirmation simple (planche A · V6 bis)', async () => {
    const view = await monter(MILBEMAX)

    await view.get('.treatment-detail__stop').trigger('click')
    const arret = dialogue(view, 'Arrêter Métacam ?')
    expect(arret.props()).toMatchObject({
      modelValue: true,
      text: 'Plus aucun rappel pour Métacam. Ses prises restent dans le carnet.',
      note: null,
      confirmLabel: 'Arrêter',
    })
    expect(view.findComponent(TreatmentStopDialog).props('prompt').actions).toEqual([])
    arret.vm.$emit('confirm')
    await flushPromises()

    expect(stop.stop).toHaveBeenCalledWith(METACAM.id, [])
    expect(message()).toBe('Métacam arrêté, à retrouver dans Traitements terminés.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler l’arrêt de Métacam')
  })

  it('après la date de fin, dit la fin du traitement, sans dose ni geste (TR-12)', async () => {
    const view = await monter(
      treatment(
        [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', endsOn: '2026-09-21' })],
        [dose('2026-09-20', '2026-09-21'), dose('2026-09-21', '2026-09-22')],
      ),
    )

    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Fin du traitement'])
    expect(textes(view, '.treatment-dose-card__value')).toEqual(['Terminé le 21 sept.'])
    expect(view.find('.treatment-dose-card__done').exists()).toBe(false)
    expect(view.find('.treatment-dose-card__other-date').exists()).toBe(false)
    expect(view.find('.treatment-detail__stop').exists()).toBe(false)
  })

  it('terminé, propose de reprendre (TR-32)', async () => {
    const view = await monter(
      treatment(
        [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20', endsOn: '2026-09-21' })],
        [dose('2026-09-20', '2026-09-21'), dose('2026-09-21', '2026-09-22')],
      ),
    )

    await view.get('.treatment-detail__resume-button').trigger('click')

    expect(push).toHaveBeenCalledWith({
      name: 'treatment-resume',
      params: { id: METACAM.id },
      query: { from: 'treatment-detail', reminder: `treatment:${METACAM.id}` },
    })
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

  it('dit qu’un traitement est introuvable, ou n’a pas pu être lu', async () => {
    expect((await monter(null)).get('[role="alert"]').text()).toBe('Ce traitement est introuvable.')
    wrapper?.unmount()
    read.mockRejectedValue(new Error('base indisponible'))

    const enEchec = await monter()

    expect(enEchec.get('[role="alert"]').text()).toBe(
      'Ce traitement n’a pas pu être chargé. Réessaie.',
    )
  })

  it('dit qu’un traitement illisible ne se rechargera pas, et laisse le supprimer', async () => {
    const back = vi.spyOn(router, 'back').mockImplementation(() => {})
    const view = await monter(treatment([period({ times: ['8h'] })]))

    expect(view.get('[role="alert"]').text()).toBe(
      'Ce traitement contient une donnée illisible. Tu peux le supprimer, ou importer un export antérieur.',
    )
    expect(view.find('.treatment-detail__edit').exists()).toBe(false)

    view.get('.pushed-screen__end').getComponent(OverflowMenu).vm.$emit('select', 'remove')
    await flushPromises()
    dialogue(view, 'Supprimer Métacam ?').vm.$emit('confirm')
    await flushPromises()

    expect(remove).toHaveBeenCalledWith(METACAM.id)
    expect(back).toHaveBeenCalled()
  })
})

describe('TreatmentDetailView — doses non renseignées (TR-14 à TR-17)', () => {
  /** Critère 1 de la spec : dernière prise le 2 sept., fiche ouverte le 28. */
  const PANACUR = treatment(
    [period()],
    [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
  )
  const UNE_SEULE = treatment([period({ startsOn: '2026-09-27', firstDueOn: '2026-09-27' })])

  function boutons(view: VueWrapper) {
    return view.findAll('.treatment-unlogged__action')
  }

  function gestes(): { kind: string; due: { dueOn: string } }[] {
    const action = service.apply.mock.calls.at(-1)?.[1]
    if (action?.kind !== 'log') throw new Error('Pas de lot écrit')
    return [...action.gestures]
  }

  it('annonce les doses sous la carte, sans en faire un retard', async () => {
    const view = await monter(PANACUR)

    expect(texte(view.get('.treatment-unlogged__title'))).toBe('25 doses non renseignées')
    expect(texte(view.get('.treatment-unlogged__subtitle'))).toBe('du 3 au 27 sept.')
    expect(texte(view.get('.treatment-unlogged__note'))).toBe('Indique si elles ont été données.')
    expect(textes(view, '.treatment-dose-card__label')).toEqual(['Dose du jour'])
    expect(view.find('.treatment-dose-card__value--overdue').exists()).toBe(false)
    expect(
      view
        .get('.treatment-dose-card')
        .element.compareDocumentPosition(view.get('.treatment-unlogged').element) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('propose « Toutes données » et « Choisir les jours » à égalité', async () => {
    const [all, choose] = boutons(await monter(PANACUR))

    expect([texte(all!), texte(choose!)]).toEqual(['Toutes données', 'Choisir les jours'])
    expect(all!.attributes('aria-label')?.replace(NBSP, ' ')).toBe(
      'Noter les 25 doses comme données, du 3 au 27 sept.',
    )
    expect(choose!.attributes('aria-label')?.replace(NBSP, ' ')).toBe(
      'Choisir les jours où Métacam a été donné, du 3 au 27 sept.',
    )
    expect(all!.classes().filter((name) => !name.includes('--'))).toEqual(
      choose!.classes().filter((name) => !name.includes('--')),
    )
  })

  it('n’affiche aucun bandeau sans dose non renseignée', async () => {
    const view = await monter(
      treatment(
        [period({ startsOn: '2026-09-27', firstDueOn: '2026-09-27' })],
        [dose('2026-09-27', '2026-09-28')],
      ),
    )

    expect(view.findComponent(TreatmentUnloggedPrompt).exists()).toBe(false)
  })

  it.each([
    ['arrêté', period({ stoppedOn: '2026-09-20' }), '17 doses non renseignées'],
    ['fini', period({ endsOn: '2026-09-10' }), '8 doses non renseignées'],
  ])('garde le bandeau sur un traitement %s', async (_, closed, title) => {
    const view = await monter(
      treatment([closed], [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')]),
    )

    expect(texte(view.get('.treatment-unlogged__title'))).toBe(title)
  })

  it('dit où retrouver le traitement quand renseigner le termine (Q16)', async () => {
    const view = await monter(
      treatment(
        [period({ stoppedOn: '2026-09-06' })],
        [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
      ),
    )
    service.apply.mockResolvedValue({ ...APPLIED, finishes: true })

    await boutons(view)[0]!.trigger('click')
    await flushPromises()

    expect(gestes().map(({ due }) => due.dueOn)).toEqual(['2026-09-03', '2026-09-04', '2026-09-05'])
    expect(message()).toBe('Métacam : 3 prises notées, à retrouver dans Traitements terminés.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler les doses renseignées de Métacam')
  })

  it('« Toutes données » écrit toutes les doses en une fois, et « Annuler » défait tout', async () => {
    const view = await monter(PANACUR)
    const undo = Array.from({ length: 25 }, (_, index) => ({
      action: 'delete' as const,
      id: `dose-${index}`,
    }))
    service.apply.mockResolvedValue({ ...APPLIED, undo })

    await boutons(view)[0]!.trigger('click')
    await flushPromises()

    expect(service.apply).toHaveBeenCalledOnce()
    expect(gestes()).toHaveLength(25)
    expect(gestes().every(({ kind }) => kind === 'given')).toBe(true)
    expect(gestes()[0]).toEqual({
      kind: 'given',
      due: { periodId: 'p-1', dueOn: '2026-09-03', dueTime: null },
      givenOn: '2026-09-03',
    })
    expect(message()).toBe('Métacam : 25 prises notées')
    expect(toastAction.value?.ariaLabel).toBe('Annuler les doses renseignées de Métacam')

    runToastAction()
    await flushPromises()

    expect(service.undoBatch).toHaveBeenCalledExactlyOnceWith(METACAM.id, undo)
  })

  it('le bandeau reste tant que la relecture trouve des doses sans état', async () => {
    const view = await monter(PANACUR)

    await boutons(view)[0]!.trigger('click')
    await flushPromises()

    expect(read).toHaveBeenCalledTimes(2)
    expect(texte(view.get('.treatment-unlogged__title'))).toBe('25 doses non renseignées')
  })

  it('pour une seule dose, propose « Donnée » et « Oubliée »', async () => {
    const view = await monter(UNE_SEULE)

    expect(texte(view.get('.treatment-unlogged__title'))).toBe('1 dose non renseignée')
    expect(texte(view.get('.treatment-unlogged__subtitle'))).toBe('27 sept.')
    expect(boutons(view).map(texte)).toEqual(['Donnée', 'Oubliée'])

    await boutons(view)[1]!.trigger('click')
    await flushPromises()

    expect(gestes()).toEqual([
      { kind: 'missed', due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: null } },
    ])
    expect(message()).toBe('Métacam : 1 oubli noté')

    await boutons(view)[0]!.trigger('click')
    await flushPromises()

    expect(gestes()).toEqual([
      {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: null },
        givenOn: '2026-09-27',
      },
    ])
  })

  it('« Choisir les jours » s’ouvre tout coché ; 5 jours décochés, tout s’écrit en une fois', async () => {
    const view = await monter(PANACUR)

    await boutons(view)[1]!.trigger('click')
    await flushPromises()
    const screen = view.getComponent(TreatmentChooseDays)
    const jours = () => dansLaFeuille('.choose-days-month__day[role="checkbox"]')
    const valider = () => dansLaFeuille('.treatment-choose-days__submit')[0]!

    expect(screen.props()).toMatchObject({ subtitle: 'Métacam · Luna · du 3 au 27 sept.' })
    expect(jours()).toHaveLength(25)
    expect(jours().every((jour) => jour.getAttribute('aria-checked') === 'true')).toBe(true)
    expect(valider().textContent?.replace(NBSP, ' ').trim()).toBe('Valider : 25 données, 0 oubliée')

    for (const jour of jours().slice(0, 5)) jour.click()
    await flushPromises()

    expect(valider().textContent?.replace(NBSP, ' ').trim()).toBe(
      'Valider : 20 données, 5 oubliées',
    )
    expect(service.apply).not.toHaveBeenCalled()

    valider().click()
    await flushPromises()

    expect(service.apply).toHaveBeenCalledOnce()
    expect(
      gestes()
        .filter(({ kind }) => kind === 'missed')
        .map(({ due }) => due.dueOn),
    ).toEqual(['2026-09-03', '2026-09-04', '2026-09-05', '2026-09-06', '2026-09-07'])
    expect(gestes().filter(({ kind }) => kind === 'given')).toHaveLength(20)
    expect(message()).toBe('Métacam : 20 prises et 5 oublis notés')
    expect(screen.props('modelValue')).toBe(false)
  })

  it('revenir en arrière de « Choisir les jours » n’écrit rien', async () => {
    const view = await monter(PANACUR)
    await boutons(view)[1]!.trigger('click')
    await flushPromises()

    dansLaFeuille('.pushed-screen__back').at(-1)!.click()
    await flushPromises()

    expect(view.getComponent(TreatmentChooseDays).props('modelValue')).toBe(false)
    expect(service.apply).not.toHaveBeenCalled()
  })

  it('à plusieurs heures, un onglet par heure, et le bouton compte le total', async () => {
    const view = await monter(
      treatment([
        period({ startsOn: '2026-09-25', firstDueOn: '2026-09-25', times: ['08:00', '20:00'] }),
      ]),
    )

    await boutons(view)[1]!.trigger('click')
    await flushPromises()
    const onglets = () => dansLaFeuille('.treatment-choose-days__tab')
    const jours = () => dansLaFeuille('.choose-days-month__day[role="checkbox"]')

    expect(onglets().map((onglet) => onglet.textContent?.replace(NBSP, ' '))).toEqual([
      '8 htout coché',
      '20 htout coché',
    ])
    jours()[0]!.click()
    onglets()[1]!.click()
    await flushPromises()

    expect(onglets()[1]!.getAttribute('aria-selected')).toBe('true')
    expect(jours().every((jour) => jour.getAttribute('aria-checked') === 'true')).toBe(true)

    jours()[2]!.click()
    await flushPromises()
    dansLaFeuille('.treatment-choose-days__submit')[0]!.click()
    await flushPromises()

    expect(
      gestes()
        .filter(({ kind }) => kind === 'missed')
        .map(({ due }) => due),
    ).toEqual([
      { periodId: 'p-1', dueOn: '2026-09-25', dueTime: '08:00' },
      { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' },
    ])
    expect(gestes()).toHaveLength(6)
  })

  async function validerAvecDeuxOublis(view: VueWrapper) {
    await boutons(view)[1]!.trigger('click')
    await flushPromises()
    for (const jour of dansLaFeuille('.choose-days-month__day[role="checkbox"]').slice(0, 2)) {
      jour.click()
    }
    await flushPromises()
    dansLaFeuille('.treatment-choose-days__submit')[0]!.click()
    await flushPromises()
  }

  it('une dose déjà notée entre-temps : le calendrier, périmé, se ferme, et la fiche dit l’échec', async () => {
    const view = await monter(PANACUR)
    service.apply.mockRejectedValue(new DoseAlreadyLoggedError('Dose déjà notée'))

    await validerAvecDeuxOublis(view)

    expect(view.getComponent(TreatmentChooseDays).props('modelValue')).toBe(false)
    expect(message()).toBe('La modification n’a pas abouti. Réessaie.')
    expect(read).toHaveBeenCalledTimes(2)
  })

  it('tout autre échec : le calendrier reste ouvert, les cases telles que laissées', async () => {
    const view = await monter(PANACUR)
    service.apply.mockRejectedValue(new Error('base indisponible'))

    await validerAvecDeuxOublis(view)

    expect(view.getComponent(TreatmentChooseDays).props('modelValue')).toBe(true)
    expect(message()).toBe('La modification n’a pas abouti. Réessaie.')
    expect(
      dansLaFeuille('.choose-days-month__day[role="checkbox"]').map((jour) =>
        jour.getAttribute('aria-checked'),
      ),
    ).toEqual([...Array<string>(2).fill('false'), ...Array<string>(23).fill('true')])
    expect(
      dansLaFeuille('.treatment-choose-days__submit')[0]!.textContent?.replace(NBSP, ' ').trim(),
    ).toBe('Valider : 23 données, 2 oubliées')

    service.apply.mockResolvedValue(APPLIED)
    dansLaFeuille('.treatment-choose-days__submit')[0]!.click()
    await flushPromises()

    expect(gestes().filter(({ kind }) => kind === 'missed')).toHaveLength(2)
    expect(view.getComponent(TreatmentChooseDays).props('modelValue')).toBe(false)
  })

  it('un lot refusé dit l’échec, relit la fiche, et n’offre pas d’« Annuler »', async () => {
    const view = await monter(PANACUR)
    service.apply.mockRejectedValue(new Error('Échéance déjà notée'))

    await boutons(view)[0]!.trigger('click')
    await flushPromises()

    expect(message()).toBe('La modification n’a pas abouti. Réessaie.')
    expect(toastAction.value).toBeNull()
    expect(read).toHaveBeenCalledTimes(2)
    expect(view.findComponent(TreatmentUnloggedPrompt).exists()).toBe(true)
  })
})

describe('TreatmentDetailView — arrêter avec des doses à renseigner (TR-30, planche A · V6)', () => {
  /** Dernière prise le 2 sept., fiche ouverte le 28 : 25 doses non renseignées, dose du jour non notée. */
  const PANACUR = treatment(
    [period()],
    [dose('2026-09-01', '2026-09-02'), dose('2026-09-02', '2026-09-03')],
  )
  const UNDO = [{ action: 'delete' as const, id: 'renseignée' }]

  async function ouvrir(view: VueWrapper) {
    await view.get('.treatment-detail__stop').trigger('click')
    await flushPromises()
    return view.getComponent(TreatmentStopDialog)
  }

  function gestes(): { kind: string; due: { dueOn: string } }[] {
    return [...(stop.stop.mock.calls.at(-1)?.[1] ?? [])]
  }

  function focusSur(className: string): void {
    expect(document.activeElement?.classList).toContain(className)
  }

  function boutons(): string[] {
    return dansLaFeuille('.confirm-dialog__actions .v-btn').map((button) =>
      (button.textContent ?? '').trim(),
    )
  }

  beforeEach(() => {
    stop.stop.mockResolvedValue({ animalId: LUNA.id, stopped: true, finished: true, undo: UNDO })
  })

  it('annonce les doses et la dose du jour, avec quatre gestes empilés', async () => {
    const view = await monter(PANACUR)
    const arret = (await ouvrir(view)).getComponent(ConfirmDialog)

    expect(arret.props('text').replace(NBSP, ' ')).toBe(
      '25 doses, du 3 au 27 sept., ne sont pas renseignées. Tu peux les noter avant d’arrêter.',
    )
    expect(String(arret.props('note')).replace(NBSP, ' ')).toBe(
      'La dose d’aujourd’hui n’est pas notée : si tu l’as donnée, touche « C’est fait » avant d’arrêter.',
    )
    expect(boutons()).toEqual([
      'Toutes données',
      'Choisir les jours',
      'Arrêter sans renseigner',
      'Annuler',
    ])
  })

  it('« Toutes données » renseigne les 25 doses et arrête, en un geste qu’« Annuler » défait', async () => {
    const view = await monter(PANACUR)
    const arret = await ouvrir(view)

    arret.vm.$emit('act', 'all-given')
    await flushPromises()

    expect(service.apply).not.toHaveBeenCalled()
    expect(stop.stop).toHaveBeenCalledOnce()
    expect(gestes()).toHaveLength(25)
    expect(gestes()[0]).toEqual({
      kind: 'given',
      due: { periodId: 'p-1', dueOn: '2026-09-03', dueTime: null },
      givenOn: '2026-09-03',
    })
    expect(message()).toBe('Métacam arrêté, à retrouver dans Traitements terminés.')

    runToastAction()
    await flushPromises()

    expect(stop.undo).toHaveBeenCalledExactlyOnceWith(METACAM.id, UNDO)
  })

  it('donne le focus à la fin du traitement quand « Arrêter » disparaît', async () => {
    const view = await monter(PANACUR)
    stop.stop.mockImplementation(async () => {
      book = treatment([period({ stoppedOn: '2026-09-28' })], PANACUR.doses)
      return { animalId: LUNA.id, stopped: true, finished: false, undo: [] }
    })

    const arret = await ouvrir(view)
    await vi.waitFor(() => focusSur('confirm-dialog__cancel'), { interval: 5 })

    arret.vm.$emit('stop')
    await flushPromises()

    expect(view.find('.treatment-detail__stop').exists()).toBe(false)
    focusSur('treatment-dose-card__dose')
  })

  it('le calendrier ouvert depuis l’arrêt dit qu’il arrête aussi', async () => {
    const view = await monter(PANACUR)
    ;(await ouvrir(view)).vm.$emit('act', 'choose-days')
    await flushPromises()

    expect(view.getComponent(TreatmentChooseDays).props('stopping')).toBe(true)
  })

  it('« Arrêter sans renseigner » arrête seulement, et le traitement reste à renseigner', async () => {
    stop.stop.mockResolvedValue({ animalId: LUNA.id, stopped: true, finished: false, undo: [] })
    const view = await monter(PANACUR)

    ;(await ouvrir(view)).vm.$emit('stop')
    await flushPromises()

    expect(stop.stop).toHaveBeenCalledWith(METACAM.id, [])
    expect(message()).toBe('Métacam arrêté')
  })

  it('« Choisir les jours » ouvre le calendrier des doses, puis arrête avec le choix', async () => {
    const view = await monter(PANACUR)
    ;(await ouvrir(view)).vm.$emit('act', 'choose-days')
    await flushPromises()
    const calendrier = view.getComponent(TreatmentChooseDays)

    expect(calendrier.props()).toMatchObject({ modelValue: true, when: 'du 3 au 27 sept.' })
    expect(calendrier.props('dues')).toHaveLength(25)
    const [oubliee, ...donnees] = calendrier.props('dues')
    calendrier.vm.$emit('confirm', { given: donnees, missed: [oubliee] })
    await flushPromises()

    expect(service.apply).not.toHaveBeenCalled()
    expect(gestes().map(({ kind }) => kind)).toEqual([...Array(24).fill('given'), 'missed'])
    expect(calendrier.props('modelValue')).toBe(false)
  })

  it('compte la dose en retard parmi les doses à renseigner', async () => {
    const view = await monter(
      treatment(
        [
          period({
            frequency: { value: 1, unit: 'week' },
            startsOn: '2026-09-07',
            firstDueOn: '2026-09-07',
          }),
        ],
        [dose('2026-09-07', '2026-09-14')],
      ),
    )
    const arret = await ouvrir(view)

    expect(arret.getComponent(ConfirmDialog).props('text').replace(NBSP, ' ')).toBe(
      '2 doses, 14 et 21 sept., ne sont pas renseignées. Tu peux les noter avant d’arrêter.',
    )
    arret.vm.$emit('act', 'all-given')
    await flushPromises()

    expect(gestes().map(({ due }) => due.dueOn)).toEqual(['2026-09-14', '2026-09-21'])
  })

  it('arrêté ailleurs entre-temps : informe, sans « Annuler », et relit la fiche', async () => {
    stop.stop.mockResolvedValue({ animalId: LUNA.id, stopped: false, finished: false, undo: [] })
    const view = await monter(PANACUR)
    read.mockClear()

    ;(await ouvrir(view)).vm.$emit('act', 'all-given')
    await flushPromises()

    expect(message()).toBe('Métacam arrêté')
    expect(toastTone.value).toBe('info')
    expect(toastAction.value).toBeNull()
    expect(read).toHaveBeenCalled()
  })

  it('garde le calendrier ouvert quand l’arrêt échoue', async () => {
    stop.stop.mockRejectedValue(new Error('base verrouillée'))
    const view = await monter(PANACUR)
    ;(await ouvrir(view)).vm.$emit('act', 'choose-days')
    await flushPromises()
    const calendrier = view.getComponent(TreatmentChooseDays)

    calendrier.vm.$emit('confirm', { given: calendrier.props('dues'), missed: [] })
    await flushPromises()

    expect(calendrier.props('modelValue')).toBe(true)
    expect(message()).toBe('Le traitement n’a pas pu être arrêté. Réessaie.')
  })
})
