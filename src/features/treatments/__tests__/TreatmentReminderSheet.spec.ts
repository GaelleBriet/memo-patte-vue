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

import TreatmentReminderSheet from '../views/TreatmentReminderSheet.vue'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import router from '@/router'
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
  initialWeightKg: null,
  photoPath: null,
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
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

let wrapper: VueWrapper | null = null
let recordDose: MockInstance
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
  vi.spyOn(treatments, 'getById').mockResolvedValue(BRAVECTO)
  recordDose = vi
    .spyOn(treatments, 'recordDose')
    .mockResolvedValue({ animalId: BOREE.id, doseId: 'p1' })
  undoDose = vi.spyOn(treatments, 'undoDose').mockResolvedValue()
  stop = vi.spyOn(treatments, 'stop').mockResolvedValue({ animalId: BOREE.id, stopped: true })
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

async function monter() {
  wrapper = mount(TreatmentReminderSheet, {
    props: {
      modelValue: true,
      treatmentId: BRAVECTO.id,
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
  return document.body
    .querySelector(selecteur)
    ?.textContent?.replace(/[ \n]+/g, ' ')
    .trim()
}

function bouton(selecteur: string): HTMLButtonElement {
  const element = document.body.querySelector<HTMLButtonElement>(selecteur)
  if (!element) throw new Error(`${selecteur} absent du document`)
  return element
}

describe('TreatmentReminderSheet — F2', () => {
  it('présente le traitement, sa prochaine dose et ses actions', async () => {
    await monter()

    expect(texte('.bottom-sheet__title')).toBe('Bravecto')
    expect(texte('.bottom-sheet__subtitle')).toBe('Vermifuge · Boree · tous les mois')
    expect(texte('.reminder-actions__due')).toBe('Prochaine dose le 28 sept.')
    expect(texte('.reminder-actions__done-today')).toBe('Fait aujourd’hui')
    expect(bouton('.reminder-actions__done-today').getAttribute('aria-label')).toBe(
      'Fait aujourd’hui : noter la prise de Bravecto pour Boree',
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
  })

  it('note la prise du jour, se ferme et propose d’annuler la prise', async () => {
    const sheet = await monter()

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(recordDose).toHaveBeenCalledWith(BRAVECTO.id, '2026-09-23')
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(sheet.emitted('changed')).toHaveLength(1)
    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    expect(toastAction.value?.label).toBe('Annuler')
    expect(toastAction.value?.ariaLabel).toBe('Annuler la prise de Bravecto')

    runToastAction()
    await flushPromises()

    expect(undoDose).toHaveBeenCalledWith(BRAVECTO.id, 'p1')
    expect(sheet.emitted('changed')).toHaveLength(2)
  })

  it('ne note qu’une prise sur un double tap', async () => {
    let terminer: () => void = () => {}
    recordDose.mockReturnValue(
      new Promise((resolve) => {
        terminer = () => resolve({ animalId: BOREE.id, doseId: 'p1' })
      }),
    )
    await monter()

    bouton('.reminder-actions__done-today').click()
    bouton('.reminder-actions__done-today').click()
    terminer()
    await flushPromises()

    expect(recordDose).toHaveBeenCalledOnce()
  })

  it('confirme sans « Annuler » quand la prise du jour était déjà notée', async () => {
    recordDose.mockResolvedValue({ animalId: BOREE.id, doseId: null })
    await monter()

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    expect(toastAction.value).toBeNull()
  })

  it('garde la feuille ouverte et dit l’échec quand la prise n’a pas pu être notée', async () => {
    recordDose.mockRejectedValue(new Error('base verrouillée'))
    const sheet = await monter()

    bouton('.reminder-actions__done-today').click()
    await flushPromises()

    expect(sheet.emitted('update:modelValue')).toBeUndefined()
    expect(texte('[role="alert"]')).toBe('La prise n’a pas pu être notée. Réessaie.')
  })

  it('ouvre l’écran de modification en gardant l’écran d’origine', async () => {
    const sheet = await monter()

    bouton('.reminder-actions__row--edit').click()
    await flushPromises()

    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(push).toHaveBeenCalledWith({
      name: 'treatment-edit',
      params: { id: BRAVECTO.id },
      query: { from: 'home' },
    })
  })
})

describe('TreatmentReminderSheet — F3, fait à une autre date', () => {
  async function ouvrirF3() {
    const sheet = await monter()
    bouton('.reminder-actions__row--other-date').click()
    await flushPromises()
    return sheet
  }

  function jour(date: string): HTMLButtonElement {
    return bouton(`.v-date-picker-month__day .v-btn[data-v-date^="${date}"]`)
  }

  it('propose aujourd’hui, jamais une date future, jamais avant la naissance', async () => {
    await ouvrirF3()

    expect(texte('.bottom-sheet__title')).toBe('Fait à une autre date')
    expect(texte('.bottom-sheet__subtitle')).toBe('Bravecto · Boree')
    expect(bouton('.bottom-sheet__back').getAttribute('aria-label')).toBe('Retour aux actions')
    expect(texte('.treatment-reminder-sheet__dose-on')).toBe('Prise du mer. 23 sept. 2026')
    expect(texte('.treatment-reminder-sheet__next-dose')).toBe('Prochaine dose : 23 oct. 2026')
    expect(texte('.treatment-reminder-sheet__submit')).toBe('Noter la prise d’aujourd’hui')
    expect(document.body.querySelector('[data-v-date^="2026-09-23"]')).not.toBeNull()
    expect(document.body.querySelector('[data-v-date^="2026-09-24"]')).toBeNull()
    expect(bouton('.date-calendar__nav--next').disabled).toBe(true)
  })

  it('recalcule la prochaine dose depuis la date choisie, puis note cette prise', async () => {
    const sheet = await ouvrirF3()

    jour('2026-09-20').click()
    await flushPromises()

    expect(texte('.treatment-reminder-sheet__dose-on')).toBe('Prise du dim. 20 sept. 2026')
    expect(texte('.treatment-reminder-sheet__next-dose')).toBe('Prochaine dose : 20 oct. 2026')
    expect(texte('.treatment-reminder-sheet__submit')).toBe('Noter la prise du 20 sept.')

    bouton('.treatment-reminder-sheet__submit').click()
    await flushPromises()

    expect(recordDose).toHaveBeenCalledWith(BRAVECTO.id, '2026-09-20')
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Prise de Bravecto du 20 sept. notée pour Boree')
  })

  it('revient aux actions par la flèche et par le retour Android', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const desinstaller = installBackButton()
    const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
    const sheet = await ouvrirF3()

    retour({ canGoBack: true })
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('Bravecto')
    expect(sheet.emitted('update:modelValue')).toBeUndefined()

    bouton('.reminder-actions__row--other-date').click()
    await flushPromises()
    bouton('.bottom-sheet__back').click()
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('Bravecto')
    desinstaller()
  })
})

describe('TreatmentReminderSheet — F6, arrêter', () => {
  it('demande confirmation, puis arrête le traitement et propose d’annuler l’arrêt', async () => {
    const sheet = await monter()

    bouton('.treatment-reminder-sheet__stop').click()
    await flushPromises()

    expect(texte('.confirm-dialog__title')).toBe('Arrêter Bravecto ?')
    expect(texte('.confirm-dialog__text')).toBe(
      'Plus aucun rappel pour ce traitement. Ses prises passées restent dans le carnet.',
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

    expect(stop).toHaveBeenCalledWith(BRAVECTO.id)
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Bravecto arrêté. Il est dans Traitements terminés.')
    expect(toastAction.value?.ariaLabel).toBe('Annuler l’arrêt de Bravecto')

    runToastAction()
    await flushPromises()

    expect(undoStop).toHaveBeenCalledWith(BRAVECTO.id)
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
})
