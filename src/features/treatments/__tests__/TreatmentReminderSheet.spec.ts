import { App, type BackButtonListenerEvent } from '@capacitor/app'
import { Capacitor, type PluginListenerHandle } from '@capacitor/core'
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

import { dose, period, plain, treatment } from './treatment-fixtures'
import TreatmentChooseDays from '../views/TreatmentChooseDays.vue'
import TreatmentReminderSheet from '../views/TreatmentReminderSheet.vue'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { Treatment } from '../schema/treatment.schema'
import type { AppliedDoseChange } from '../service/treatment-doses.service'
import { useTreatmentsStore } from '../store/treatments.store'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import router from '@/router'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { TodoDue } from '@/shared/domain/reminder-route'
import { dismissToast, runToastAction, toastAction, toastMessage } from '@/shared/utils/toast'

type BackListener = (event: BackButtonListenerEvent) => void

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn<(event: string, callback: BackListener) => Promise<PluginListenerHandle>>(
      async () => ({ remove: async () => {} }),
    ),
    minimizeApp: vi.fn<() => Promise<void>>(async () => {}),
    getState: vi.fn<() => Promise<{ isActive: boolean }>>(async () => ({ isActive: true })),
  },
}))

const TODAY = new Date('2026-09-23T10:00:00')

const BOREE: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Boree',
  species: 'dog',
  breed: null,
  birthDate: '2026-04-10',
  photoPath: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
  unfollowedOn: null,
}

const BRAVECTO: Treatment = {
  id: '44444444-4444-4444-8444-444444444444',
  animalId: BOREE.id,
  name: 'Bravecto',
  type: 'deworming',
  periodId: '44444444-4444-4444-8444-444444444444',
  frequency: { value: 1, unit: 'month' },
  lastDoseDate: '2026-08-28',
  nextDueDate: '2026-09-28',
  stoppedOn: null,
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

const AT = '2026-09-01T09:00:00.000Z'
const HISTORY: TreatmentWithHistory = {
  id: BRAVECTO.id,
  animalId: BRAVECTO.animalId,
  name: BRAVECTO.name,
  type: BRAVECTO.type,
  createdAt: AT,
  updatedAt: AT,
  periods: [
    {
      id: BRAVECTO.periodId,
      treatmentId: BRAVECTO.id,
      animalId: BRAVECTO.animalId,
      startsOn: '2026-08-28',
      firstDueOn: '2026-08-28',
      referenceOn: '2026-08-28',
      endsOn: null,
      stoppedOn: null,
      frequency: BRAVECTO.frequency,
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
    },
  ],
  doses: [
    {
      id: 'p0',
      periodId: BRAVECTO.periodId,
      treatmentId: BRAVECTO.id,
      animalId: BRAVECTO.animalId,
      dueOn: '2026-08-28',
      dueTime: null,
      givenOn: '2026-08-28',
      status: 'given',
      nextDueDate: '2026-09-28',
      createdAt: AT,
      updatedAt: AT,
      deletedAt: null,
    },
  ],
}
const APPLIED: AppliedDoseChange = {
  animalId: BOREE.id,
  undo: [{ action: 'delete', id: 'p1' }],
  alreadyGivenOn: null,
  postponement: null,
  finishes: false,
  moved: null,
  shiftKept: false,
}

let wrapper: VueWrapper | null = null
let apply: MockInstance<ReturnType<typeof useTreatmentsStore>['applyDoseAction']>
let undoDose: MockInstance
let stop: MockInstance
let undoStop: MockInstance
let push: MockInstance

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
  const treatments = useTreatmentsStore()
  vi.spyOn(treatments, 'getWithHistory').mockResolvedValue(HISTORY)
  apply = vi.spyOn(treatments, 'applyDoseAction').mockResolvedValue(APPLIED)
  undoDose = vi.spyOn(treatments, 'undoDoseAction').mockResolvedValue()
  stop = vi.spyOn(treatments, 'stop').mockResolvedValue({
    animalId: BOREE.id,
    stopped: true,
    finished: true,
    undo: [],
  })
  undoStop = vi.spyOn(treatments, 'undoStop').mockResolvedValue()
  await router.push({ name: 'home' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(due: TodoDue | null = null) {
  wrapper = mount(TreatmentReminderSheet, {
    props: {
      modelValue: true,
      treatmentId: BRAVECTO.id,
      due,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function feuille(): HTMLElement {
  const element = document.body.querySelector<HTMLElement>('.treatment-reminder-sheet')
  if (!element) throw new Error('Feuille absente du document')
  return element
}

function texte(selecteur: string): string | undefined {
  return document.body.querySelector(selecteur)?.textContent?.replace(/\s+/g, ' ').trim()
}

function bouton(selecteur: string): HTMLButtonElement {
  const element = document.body.querySelector<HTMLButtonElement>(selecteur)
  if (!element) throw new Error(`${selecteur} absent du document`)
  return element
}

// Pixel, Milbemax tous les vendredis depuis le 9 oct. (planche V29).
const VENDREDIS = {
  ...period({
    startsOn: '2026-10-09',
    firstDueOn: '2026-10-09',
    frequency: { value: 1, unit: 'week' },
  }),
  animalId: BOREE.id,
}
const HEBDO: TreatmentWithHistory = {
  ...treatment([VENDREDIS], [dose('2026-10-09', '2026-10-16', { animalId: BOREE.id })]),
  animalId: BOREE.id,
  name: 'Milbemax',
  type: 'deworming',
}
const DOSE_16 = { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null }
const LIGNE_16 = { dueOn: '2026-10-16', dueTime: null }

function lePlus(history: TreatmentWithHistory, aujourdhui: string) {
  vi.setSystemTime(new Date(`${aujourdhui}T10:00:00`))
  vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(history)
}

function geste() {
  return apply.mock.calls.at(-1)?.[1]
}

describe('TreatmentReminderSheet — F2, la feuille de l’échéance touchée', () => {
  it('présente le traitement, l’échéance de la ligne et ses actions', async () => {
    await monter({ dueOn: '2026-09-28', dueTime: null })

    expect(texte('.bottom-sheet__title')).toBe('Bravecto')
    expect(texte('.bottom-sheet__subtitle')).toBe('Vermifuge · Boree · tous les mois')
    expect(texte('.reminder-actions__due')).toBe('Prochaine dose le 28 sept.')
    expect(texte('.reminder-actions__done-today')).toBe('Fait aujourd’hui')
    expect(plain(bouton('.reminder-actions__done-today').getAttribute('aria-label'))).toBe(
      'Fait aujourd’hui : noter la prise de Bravecto pour Boree',
    )
    expect(texte('.reminder-actions__row--other-date')).toBe('Fait à une autre date')
    expect(texte('.reminder-actions__row--edit .reminder-actions__row-label')).toBe('Modifier')
    expect(texte('.reminder-actions__row--edit .reminder-actions__row-hint')).toBe(
      'Date ou fréquence',
    )
    expect(texte('.treatment-reminder-sheet__stop')).toBe('Arrêter ce traitement')
    expect(bouton('.treatment-reminder-sheet__stop').getAttribute('aria-label')).toBe(
      'Arrêter le traitement Bravecto. Demande confirmation.',
    )
    expect(feuille().querySelector('.bottom-sheet__icon')).not.toBeNull()
    expect(document.body.querySelector('.treatment-unlogged')).toBeNull()
  })

  it('la fréquence vient de la période, jamais de la projection du traitement', async () => {
    lePlus(HEBDO, '2026-10-19')
    await monter(LIGNE_16)

    expect(texte('.bottom-sheet__title')).toBe('Milbemax')
    expect(texte('.bottom-sheet__subtitle')).toBe('Vermifuge · Boree · toutes les semaines')
    expect(texte('.reminder-actions__due')).toBe('Prochaine dose le 16 oct.')
  })

  it('dit l’heure de la ligne d’un traitement à heures', async () => {
    lePlus(
      { ...HEBDO, periods: [{ ...VENDREDIS, times: ['08:00', '20:00'] }], doses: [] },
      '2026-10-09',
    )
    await monter({ dueOn: '2026-10-09', dueTime: '20:00' })

    expect(texte('.reminder-actions__due')).toBe('Prochaine dose le 9 oct. à 20 h')
  })

  it('dose du jour : un tap note l’échéance de la ligne, ferme la feuille et propose d’annuler', async () => {
    lePlus(HEBDO, '2026-10-16')
    const sheet = await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(apply).toHaveBeenCalledExactlyOnceWith(HEBDO.id, {
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-16' },
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(sheet.emitted('changed')).toHaveLength(1)
    expect(toastMessage.value).toBe('Prise de Milbemax notée pour Boree')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la prise de Milbemax')

    runToastAction()
    await flushPromises()

    expect(undoDose).toHaveBeenCalledWith(HEBDO.id, APPLIED.undo)
    expect(sheet.emitted('changed')).toHaveLength(2)
  })

  it('dit où retrouver le traitement quand la prise notée le termine (TR-31)', async () => {
    lePlus(HEBDO, '2026-10-16')
    apply.mockResolvedValue({ ...APPLIED, finishes: true })
    await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(toastMessage.value).toBe(
      'Dernière dose de Milbemax notée, à retrouver dans Traitements terminés.',
    )
  })

  it('ne note qu’une prise sur un double tap', async () => {
    lePlus(HEBDO, '2026-10-16')
    let terminer: () => void = () => {}
    apply.mockReturnValue(
      new Promise((resolve) => {
        terminer = () => resolve(APPLIED)
      }),
    )
    await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    bouton('.reminder-actions__done-today').click()
    terminer()
    await flushPromises()

    expect(apply).toHaveBeenCalledOnce()
  })

  it('dose en retard : la confirmation de la fiche, case cochée et dates, avant d’écrire (G20)', async () => {
    lePlus(HEBDO, '2026-10-19')
    const sheet = await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(document.body.querySelector('.treatment-reminder-sheet.v-overlay--active')).toBeNull()
    expect(texte('.treatment-done-confirm__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(document.body.querySelector<HTMLInputElement>('.treatment-shift__input')?.checked).toBe(
      true,
    )
    expect(texte('.treatment-shift__help')).toBe(
      'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
    )

    bouton('.treatment-done-confirm__save').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-19', shiftsFollowing: true },
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('case décochée : la prise seule, les doses suivantes restent le vendredi', async () => {
    lePlus(HEBDO, '2026-10-19')
    await monter(LIGNE_16)
    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    bouton('.treatment-shift__input').click()
    await flushPromises()
    expect(texte('.treatment-shift__help')).toBe(
      'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
    )
    bouton('.treatment-done-confirm__save').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-19', shiftsFollowing: false },
    })
  })

  it('« Annuler » de la confirmation n’écrit rien et ferme', async () => {
    lePlus(HEBDO, '2026-10-19')
    const sheet = await monter(LIGNE_16)
    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    bouton('.treatment-done-confirm__cancel').click()
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('dose donnée en avance : la confirmation aussi', async () => {
    lePlus(HEBDO, '2026-10-14')
    await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(texte('.treatment-done-confirm__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le mercredi 14 oct.',
    )
  })

  it('dose à venir après une prise du jour : « déjà notée », sans rien écrire (Q33)', async () => {
    lePlus(HEBDO, '2026-10-09')
    await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(toastMessage.value).toBe('Prise de Milbemax déjà notée aujourd’hui pour Boree')
    expect(toastAction.value).toBeNull()
  })

  it('échéance notée oubliée entre-temps : la feuille le dit, sans rien écrire (Q41)', async () => {
    lePlus(
      {
        ...HEBDO,
        doses: [
          ...HEBDO.doses,
          dose('2026-10-16', '2026-10-23', {
            animalId: BOREE.id,
            givenOn: null,
            status: 'missed',
          }),
        ],
      },
      '2026-10-19',
    )
    const sheet = await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(toastMessage.value).toBe('Cette dose est notée oubliée.')
    expect(toastAction.value).toBeNull()
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('garde la feuille ouverte quand la prise n’a pas pu être notée', async () => {
    lePlus(HEBDO, '2026-10-16')
    apply.mockRejectedValue(new Error('base verrouillée'))
    const sheet = await monter(LIGNE_16)

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(sheet.emitted('update:modelValue')).toBeUndefined()
    expect(toastMessage.value).toBe('La modification n’a pas abouti. Réessaie.')
  })

  it('ouvre « Modifier » en gardant l’écran d’origine, le rappel et l’échéance à rouvrir', async () => {
    const replace = vi.spyOn(router, 'replace').mockResolvedValue()
    const sheet = await monter({ dueOn: '2026-09-28', dueTime: null })

    bouton('.reminder-actions__row--edit').click()
    await flushPromises()

    const reminder = `treatment:${BRAVECTO.id}:2026-09-28`
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(replace).toHaveBeenCalledWith({ query: { reminder } })
    expect(push).toHaveBeenCalledWith({
      name: 'treatment-edit',
      params: { id: BRAVECTO.id },
      query: { from: 'home', reminder },
    })
  })
})

describe('TreatmentReminderSheet — plusieurs heures par jour : l’heure de la ligne', () => {
  const DEUX_HEURES: TreatmentWithHistory = {
    ...HEBDO,
    periods: [{ ...VENDREDIS, frequency: { value: 1, unit: 'day' }, times: ['08:00', '20:00'] }],
    doses: [],
  }
  const MATIN = { periodId: 'p-1', dueOn: '2026-10-09', dueTime: '08:00' }
  const SOIR = { periodId: 'p-1', dueOn: '2026-10-09', dueTime: '20:00' }

  it('la ligne de 20 h note 20 h d’un tap, sans demander l’heure', async () => {
    lePlus(DEUX_HEURES, '2026-10-09')
    await monter({ dueOn: '2026-10-09', dueTime: '20:00' })

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(document.body.querySelector('.treatment-hours__hour')).toBeNull()
    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: SOIR, givenOn: '2026-10-09' },
    })
    expect(plain(toastMessage.value)).toBe('Prise de 20 h de Milbemax notée pour Boree')
  })

  it('la ligne de 8 h note 8 h', async () => {
    lePlus(DEUX_HEURES, '2026-10-09')
    await monter({ dueOn: '2026-10-09', dueTime: '08:00' })

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: MATIN, givenOn: '2026-10-09' },
    })
  })
})

describe('TreatmentReminderSheet — fait à une autre date, avec la case (#527)', () => {
  async function ouvrirAutreDate(aujourdhui = '2026-10-19') {
    lePlus(HEBDO, aujourdhui)
    const sheet = await monter(LIGNE_16)
    bouton('.reminder-actions__row--other-date').click()
    await flushPromises()
    return sheet
  }

  function jour(date: string): HTMLButtonElement {
    return bouton(`.v-date-picker-month__day .v-btn[data-v-date^="${date}"]`)
  }

  it('ouvre le calendrier de la fiche, sur l’échéance de la ligne, case cochée (V29)', async () => {
    const sheet = await ouvrirAutreDate()

    expect(document.body.querySelector('.treatment-reminder-sheet.v-overlay--active')).toBeNull()
    expect(texte('.treatment-other-date .bottom-sheet__title')).toBe('Fait à une autre date')
    expect(bouton('.treatment-other-date .bottom-sheet__back').getAttribute('aria-label')).toBe(
      'Retour aux actions',
    )
    const calendrier = sheet.findComponent(DateCalendar)
    expect(calendrier.props('min')).toBe('2026-10-10')
    expect(calendrier.props('excluded')).toEqual(['2026-10-09'])
    expect(texte('.treatment-other-date__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(document.body.querySelector<HTMLInputElement>('.treatment-shift__input')?.checked).toBe(
      true,
    )
    expect(texte('.treatment-shift__help')).toBe(
      'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
    )

    bouton('.treatment-other-date__submit').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-19', shiftsFollowing: true },
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('un autre jour vise toujours l’échéance de la ligne', async () => {
    await ouvrirAutreDate()

    jour('2026-10-17').click()
    await flushPromises()
    expect(texte('.treatment-other-date__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le samedi 17 oct.',
    )
    bouton('.treatment-shift__input').click()
    await flushPromises()
    bouton('.treatment-other-date__submit').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-17', shiftsFollowing: false },
    })
  })

  it('le jour de l’échéance : ni case ni récapitulatif, la prise seule', async () => {
    await ouvrirAutreDate()

    jour('2026-10-16').click()
    await flushPromises()

    expect(document.body.querySelector('.treatment-shift__input')).toBeNull()
    expect(document.body.querySelector('.treatment-other-date__recap')).toBeNull()
    bouton('.treatment-other-date__submit').click()
    await flushPromises()

    expect(geste()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-16' },
    })
  })

  it('revient aux actions par la flèche et par le retour Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const desinstaller = installBackButton()
    const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
    const sheet = await ouvrirAutreDate()

    retour({ canGoBack: true })
    await flushPromises()

    expect(texte('.treatment-reminder-sheet .bottom-sheet__title')).toBe('Milbemax')
    expect(sheet.emitted('update:modelValue')).toBeUndefined()

    bouton('.reminder-actions__row--other-date').click()
    await flushPromises()
    bouton('.treatment-other-date .bottom-sheet__back').click()
    await flushPromises()

    expect(texte('.treatment-reminder-sheet .bottom-sheet__title')).toBe('Milbemax')
    expect(apply).not.toHaveBeenCalled()
    desinstaller()
  })
})

describe('TreatmentReminderSheet — doses non renseignées (AC-9, TR-15)', () => {
  /** Quotidien depuis le 20 sept., rien de noté : trois doses à renseigner, dose du jour le 23. */
  const QUOTIDIEN: TreatmentWithHistory = {
    ...HISTORY,
    periods: [
      {
        ...HISTORY.periods[0]!,
        frequency: { value: 1, unit: 'day' },
        startsOn: '2026-09-20',
        firstDueOn: '2026-09-20',
      },
    ],
    doses: [],
  }

  it('la ligne « À renseigner » propose directement « Toutes données » et « Choisir les jours »', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(QUOTIDIEN)
    const sheet = await monter('unlogged')

    expect(texte('.bottom-sheet__title')).toBe('Bravecto')
    expect(texte('.bottom-sheet__subtitle')).toBe('Vermifuge · Boree · tous les jours')
    expect(texte('.treatment-unlogged__title')).toBe('3 doses non renseignées')
    expect(document.body.querySelector('.treatment-unlogged__note')).not.toBeNull()
    expect(
      [...document.body.querySelectorAll('.treatment-unlogged__action')].map((action) =>
        action.textContent?.trim(),
      ),
    ).toEqual(['Toutes données', 'Choisir les jours'])
    expect(document.body.querySelector('.reminder-actions')).toBeNull()

    bouton('.treatment-unlogged__action--all-given').click()
    await flushPromises()

    const action = geste() as unknown as { kind: string; gestures: { due: { dueOn: string } }[] }
    expect(action.kind).toBe('log')
    expect(action.gestures.map(({ due }) => due.dueOn)).toEqual([
      '2026-09-20',
      '2026-09-21',
      '2026-09-22',
    ])
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('« Choisir les jours » ouvre le calendrier des doses à renseigner', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(QUOTIDIEN)
    const sheet = await monter('unlogged')

    bouton('.treatment-unlogged__action--choose-days').click()
    await flushPromises()
    const calendrier = sheet.getComponent(TreatmentChooseDays)

    expect(calendrier.props()).toMatchObject({ modelValue: true, stopping: false })
    expect(calendrier.props('dues')).toHaveLength(3)
    const [oubliee, ...donnees] = calendrier.props('dues')
    calendrier.vm.$emit('confirm', { given: donnees, missed: [oubliee] })
    await flushPromises()

    expect((geste() as unknown as { gestures: unknown[] }).gestures).toHaveLength(3)
    expect(calendrier.props('modelValue')).toBe(false)
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('une seule dose : « Donnée » et « Oubliée »', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue({
      ...QUOTIDIEN,
      periods: [{ ...QUOTIDIEN.periods[0]!, startsOn: '2026-09-22', firstDueOn: '2026-09-22' }],
    })
    await monter('unlogged')

    expect(
      [...document.body.querySelectorAll('.treatment-unlogged__action')].map((action) =>
        action.textContent?.trim(),
      ),
    ).toEqual(['Donnée', 'Oubliée'])
  })

  it('la feuille d’une dose montre le bandeau compact, sans sa note', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(QUOTIDIEN)
    await monter({ dueOn: '2026-09-23', dueTime: null })

    expect(texte('.reminder-actions__due')).toBe('Prochaine dose le 23 sept.')
    expect(texte('.treatment-unlogged__title')).toBe('3 doses non renseignées')
    expect(document.body.querySelector('.treatment-unlogged__note')).toBeNull()

    bouton('.treatment-unlogged__action--all-given').click()
    await flushPromises()

    expect((geste() as unknown as { gestures: unknown[] }).gestures).toHaveLength(3)
  })
})

describe('TreatmentReminderSheet — F6, arrêter', () => {
  it('demande confirmation, puis arrête le traitement et propose d’annuler l’arrêt', async () => {
    const sheet = await monter()

    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()

    expect(texte('.confirm-dialog__title')).toBe('Arrêter Bravecto ?')
    expect(texte('.confirm-dialog__text')).toBe(
      'Plus aucun rappel pour Bravecto. Ses prises restent dans le carnet.',
    )
    expect(bouton('.confirm-dialog__cancel').getAttribute('aria-label')).toBe(
      'Annuler, garder Bravecto',
    )
    expect(bouton('.confirm-dialog__confirm').getAttribute('aria-label')).toBe(
      'Arrêter le traitement Bravecto',
    )
    expect(bouton('.confirm-dialog__confirm').classList).toContain('text-error')

    bouton('.confirm-dialog__confirm').click()
    await flushPromises()

    expect(stop).toHaveBeenCalledWith(BRAVECTO.id, [])
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Bravecto arrêté, à retrouver dans Traitements terminés.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler l’arrêt de Bravecto')

    runToastAction()
    await flushPromises()

    expect(undoStop).toHaveBeenCalledWith(BRAVECTO.id, [])
  })

  it('n’arrête rien quand on annule le dialogue', async () => {
    const sheet = await monter()

    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()
    bouton('.confirm-dialog__cancel').click()
    await flushPromises()

    expect(stop).not.toHaveBeenCalled()
    expect(sheet.emitted('update:modelValue')).toBeUndefined()
  })

  it('rend le focus à « Arrêter ce traitement » après « Annuler »', async () => {
    await monter()
    const arreter = bouton('.treatment-reminder-sheet__stop')
    arreter.focus()

    arreter.click()
    await vi.waitFor(() => expect(document.activeElement).toBe(bouton('.confirm-dialog__cancel')))
    bouton('.confirm-dialog__cancel').click()

    await vi.waitFor(() => expect(document.activeElement).toBe(arreter))
  })

  it('confirme sans « Annuler » quand le traitement était déjà arrêté', async () => {
    stop.mockResolvedValue({ animalId: BOREE.id, stopped: false, finished: true, undo: [] })
    const sheet = await monter()

    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()
    bouton('.confirm-dialog__confirm').click()
    await flushPromises()

    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Bravecto arrêté, à retrouver dans Traitements terminés.')
    expect(toastAction.value).toBeNull()
  })
})

describe('TreatmentReminderSheet — arrêter avec des doses à renseigner (TR-30)', () => {
  /** Quotidien depuis le 20 sept., rien de noté : trois doses à renseigner, dose du jour le 23. */
  const QUOTIDIEN: TreatmentWithHistory = {
    ...HISTORY,
    periods: [
      {
        ...HISTORY.periods[0]!,
        frequency: { value: 1, unit: 'day' },
        startsOn: '2026-09-20',
        firstDueOn: '2026-09-20',
      },
    ],
    doses: [],
  }

  function boutons(): string[] {
    return [...document.body.querySelectorAll('.confirm-dialog__actions .v-btn')].map((button) =>
      (button.textContent ?? '').trim(),
    )
  }

  function gestes(): { due: { dueOn: string } }[] {
    return [...(stop.mock.calls.at(-1)?.[1] ?? [])]
  }

  beforeEach(() => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(QUOTIDIEN)
  })

  it('propose de renseigner les doses, puis arrête en un geste', async () => {
    const sheet = await monter()

    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()

    expect(texte('.confirm-dialog__text')).toBe(
      '3 doses, 20, 21 et 22 sept., ne sont pas renseignées. Tu peux les noter avant d’arrêter.',
    )
    expect(texte('.confirm-dialog__note')).toContain('La dose d’aujourd’hui n’est pas notée')
    expect(boutons()).toEqual([
      'Toutes données',
      'Choisir les jours',
      'Arrêter sans renseigner',
      'Annuler',
    ])

    ;[...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions .v-btn')]
      .find((button) => button.textContent?.includes('Toutes données'))!
      .click()
    await flushPromises()

    expect(stop).toHaveBeenCalledOnce()
    expect(gestes().map(({ due }) => due.dueOn)).toEqual(['2026-09-20', '2026-09-21', '2026-09-22'])
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Bravecto arrêté, à retrouver dans Traitements terminés.')
  })

  it('« Choisir les jours » ouvre le calendrier, dont le bouton dit qu’il arrête aussi', async () => {
    const sheet = await monter()
    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()

    ;[...document.body.querySelectorAll<HTMLButtonElement>('.confirm-dialog__actions .v-btn')]
      .find((button) => button.textContent?.includes('Choisir les jours'))!
      .click()
    await flushPromises()
    const calendrier = sheet.getComponent(TreatmentChooseDays)

    expect(calendrier.props()).toMatchObject({ modelValue: true, stopping: true })
    expect(calendrier.props('dues')).toHaveLength(3)
    const [oubliee, ...donnees] = calendrier.props('dues')
    calendrier.vm.$emit('confirm', { given: donnees, missed: [oubliee] })
    await flushPromises()

    expect(gestes()).toHaveLength(3)
    expect(calendrier.props('modelValue')).toBe(false)
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })
})

describe('TreatmentReminderSheet — traitement fini par sa date de fin', () => {
  it('ne propose pas d’arrêter', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue({
      ...HISTORY,
      periods: [{ ...HISTORY.periods[0]!, endsOn: '2026-09-21' }],
    })

    await monter()

    expect(document.body.querySelector('.treatment-reminder-sheet__stop')).toBeNull()
  })
})

describe('TreatmentReminderSheet — confirmation simple de l’arrêt', () => {
  function boutons(): string[] {
    return [...document.body.querySelectorAll('.confirm-dialog__actions .v-btn')].map((button) =>
      (button.textContent ?? '').trim(),
    )
  }

  async function ouvrirArret(): Promise<void> {
    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()
  }

  it('rien à renseigner : confirmation simple, sans phrase sur la dose du jour (V6 bis)', async () => {
    await monter()
    await ouvrirArret()

    expect(texte('.confirm-dialog__text')).toBe(
      'Plus aucun rappel pour Bravecto. Ses prises restent dans le carnet.',
    )
    expect(document.body.querySelector('.confirm-dialog__note')).toBeNull()
    expect(boutons()).toEqual(['Annuler', 'Arrêter'])
  })

  it('dit que la dose du jour n’est pas notée, même sans dose à renseigner (Q9)', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue({
      ...HISTORY,
      periods: [
        {
          ...HISTORY.periods[0]!,
          frequency: { value: 1, unit: 'day' },
          startsOn: '2026-09-23',
          firstDueOn: '2026-09-23',
        },
      ],
      doses: [],
    })
    await monter()
    await ouvrirArret()

    expect(boutons()).toEqual(['Annuler', 'Arrêter'])
    expect(texte('.confirm-dialog__note')?.replace(/\u00a0/g, ' ')).toBe(
      'La dose d’aujourd’hui n’est pas notée : si tu l’as donnée, touche « C’est fait » avant d’arrêter.',
    )
  })

  it('traitement illisible : confirmation simple, et l’arrêt marche', async () => {
    vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue({
      ...HISTORY,
      periods: [{ ...HISTORY.periods[0]!, times: ['8h'] }],
    })
    const sheet = await monter()
    await ouvrirArret()

    expect(texte('.confirm-dialog__text')).toBe(
      'Plus aucun rappel pour Bravecto. Ses prises restent dans le carnet.',
    )
    expect(boutons()).toEqual(['Annuler', 'Arrêter'])
    bouton('.confirm-dialog__confirm').click()
    await flushPromises()

    expect(stop).toHaveBeenCalledWith(BRAVECTO.id, [])
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })
})
