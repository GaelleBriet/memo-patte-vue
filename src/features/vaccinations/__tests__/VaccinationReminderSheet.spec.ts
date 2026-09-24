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

import VaccinationReminderSheet from '../views/VaccinationReminderSheet.vue'
import type { Vaccination } from '../schema/vaccination.schema'
import { useVaccinationsStore } from '../store/vaccinations.store'
import { installBackButton } from '@/core/app-lifecycle/back-button'
import i18n from '@/core/i18n'
import { shouldShowPriming } from '@/core/notifications/permission'
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

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
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

const CARRE: Vaccination = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: BOREE.id,
  name: 'Carré',
  lastInjectionDate: '2025-09-26',
  dueDate: '2026-09-26',
  createdAt: '2026-09-01T09:00:00.000Z',
  updatedAt: '2026-09-01T09:00:00.000Z',
  deletedAt: null,
}

let wrapper: VueWrapper | null = null
let recordInjection: MockInstance
let undoInjection: MockInstance
let push: MockInstance
let replace: MockInstance

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
  const vaccinations = useVaccinationsStore()
  vi.spyOn(vaccinations, 'getById').mockResolvedValue(CARRE)
  recordInjection = vi
    .spyOn(vaccinations, 'recordInjection')
    .mockResolvedValue({ animalId: BOREE.id, injectionId: 'i1' })
  undoInjection = vi.spyOn(vaccinations, 'undoInjection').mockResolvedValue()
  await router.push({ name: 'home' })
  push = vi.spyOn(router, 'push').mockResolvedValue()
  replace = vi.spyOn(router, 'replace').mockResolvedValue()
})

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  dismissToast()
  document.body.innerHTML = ''
  vi.restoreAllMocks()
  vi.mocked(shouldShowPriming).mockResolvedValue(false)
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function monter(props: Record<string, unknown> = {}) {
  wrapper = mount(VaccinationReminderSheet, {
    props: {
      modelValue: true,
      vaccinationId: CARRE.id,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
      ...props,
    },
    global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
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

function choix(): HTMLButtonElement[] {
  return [...document.body.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
}

function jour(date: string): HTMLButtonElement {
  return bouton(`.v-date-picker-month__day .v-btn[data-v-date^="${date}"]`)
}

async function ouvrirF5() {
  const sheet = await monter()
  bouton('.reminder-actions__done-today').click()
  await flushPromises()
  return sheet
}

describe('VaccinationReminderSheet — feuille d’un vaccin', () => {
  it('reprend la feuille d’un traitement, sans « Arrêter »', async () => {
    await monter()

    expect(texte('.bottom-sheet__title')).toBe('Carré')
    expect(texte('.bottom-sheet__subtitle')).toBe('Vaccin · Boree')
    expect(texte('.reminder-actions__due')).toBe('Prochain rappel le 26 sept.')
    expect(bouton('.reminder-actions__done-today').getAttribute('aria-label')).toBe(
      'Fait aujourd’hui : noter l’injection de Carré pour Boree et choisir le prochain rappel',
    )
    expect(document.body.querySelector('.reminder-actions__footer')).toBeNull()
  })

  it('donne l’année d’un rappel en retard d’une autre année', async () => {
    vi.spyOn(useVaccinationsStore(), 'getById').mockResolvedValue({
      ...CARRE,
      dueDate: '2025-08-10',
    })
    await monter()

    expect(texte('.reminder-actions__due')).toBe('Prochain rappel le 10 août 2025')
  })

  it('ouvre l’écran de modification du vaccin', async () => {
    await monter()

    bouton('.reminder-actions__row--edit').click()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ query: { reminder: `vaccination:${CARRE.id}` } })
    expect(push).toHaveBeenCalledWith({
      name: 'vaccination-edit',
      params: { id: CARRE.id },
      query: { from: 'home', reminder: `vaccination:${CARRE.id}` },
    })
  })
})

describe('VaccinationReminderSheet — F5, vaccin fait', () => {
  it('propose l’injection du jour et les quatre rappels, rien de présélectionné', async () => {
    await ouvrirF5()

    expect(texte('.vaccination-reminder-sheet__injection-date')).toBe('Injection le 23 sept. 2026')
    expect(texte('.vaccination-reminder-sheet__heading')).toBe('Prochain rappel')
    expect(choix().map((element) => element.textContent?.trim())).toEqual([
      'Dans 1 an',
      'Dans 3 ans',
      'Autre date',
      'Pas de rappel',
    ])
    expect(choix().every((element) => element.getAttribute('aria-checked') === 'false')).toBe(true)
    expect(
      document.body.querySelector('[role="radiogroup"]')?.getAttribute('aria-labelledby'),
    ).toBe(document.body.querySelector('.vaccination-reminder-sheet__heading')?.id)
    expect(texte('.vaccination-reminder-sheet__summary')).toBe(
      'Choisis le prochain rappel pour enregistrer.',
    )
    expect(bouton('.vaccination-reminder-sheet__submit').disabled).toBe(true)
  })

  it('compte « Dans 1 an » et « Dans 3 ans » depuis l’injection, puis enregistre', async () => {
    const sheet = await ouvrirF5()

    choix()[1]!.click()
    await flushPromises()
    expect(texte('.vaccination-reminder-sheet__summary')).toBe('Prochain rappel le 23 sept. 2029')

    choix()[0]!.click()
    await flushPromises()
    expect(choix()[0]!.getAttribute('aria-checked')).toBe('true')
    expect(texte('.vaccination-reminder-sheet__summary')).toBe('Prochain rappel le 23 sept. 2027')

    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(recordInjection).toHaveBeenCalledWith(CARRE.id, {
      injectedOn: '2026-09-23',
      nextDueDate: '2027-09-23',
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(sheet.emitted('changed')).toHaveLength(1)
    expect(toastMessage.value).toBe('Injection de Carré notée pour Boree')
    expect(toastAction.value?.ariaLabel).toBe('Annuler l’injection de Carré')

    runToastAction()
    await flushPromises()

    expect(undoInjection).toHaveBeenCalledWith(CARRE.id, 'i1')
    expect(sheet.emitted('changed')).toHaveLength(2)
  })

  it('n’enregistre aucun rappel pour « Pas de rappel »', async () => {
    await ouvrirF5()

    choix()[3]!.click()
    await flushPromises()
    expect(texte('.vaccination-reminder-sheet__summary')).toBe('Aucun rappel ne sera programmé.')

    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(recordInjection).toHaveBeenCalledWith(CARRE.id, {
      injectedOn: '2026-09-23',
      nextDueDate: null,
    })
  })

  it('choisit une autre date, future seulement, puis revient à la feuille', async () => {
    await ouvrirF5()

    choix()[2]!.click()
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('Prochain rappel')
    expect(document.body.querySelector('[data-v-date^="2026-09-23"]')).toBeNull()

    jour('2026-09-30').click()
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('Carré')
    expect(choix()[2]!.getAttribute('aria-checked')).toBe('true')
    expect(texte('.vaccination-reminder-sheet__summary-text')).toBe(
      'Prochain rappel le 30 sept. 2026',
    )
  })

  it('change la date d’injection, passée ou du jour, et en compte le rappel', async () => {
    await ouvrirF5()

    bouton('.vaccination-reminder-sheet__change').click()
    await flushPromises()
    expect(texte('.bottom-sheet__title')).toBe('Date d’injection')
    expect(document.body.querySelector('[data-v-date^="2026-09-24"]')).toBeNull()

    jour('2026-09-20').click()
    await flushPromises()
    choix()[0]!.click()
    await flushPromises()

    expect(texte('.vaccination-reminder-sheet__injection-date')).toBe('Injection le 20 sept. 2026')
    expect(texte('.vaccination-reminder-sheet__summary')).toBe('Prochain rappel le 20 sept. 2027')
  })

  it('ouvre le calendrier de l’injection depuis « Fait à une autre date »', async () => {
    await monter()

    bouton('.reminder-actions__row--other-date').click()
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('Date d’injection')
  })

  it('revient à l’étape précédente au retour Android, puis ferme la feuille', async () => {
    vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true)
    const desinstaller = installBackButton()
    const retour = (vi.mocked(App.addListener) as Mock).mock.calls.at(-1)![1] as BackListener
    const sheet = await ouvrirF5()
    choix()[2]!.click()
    await flushPromises()

    retour({ canGoBack: true })
    await flushPromises()
    expect(texte('.bottom-sheet__title')).toBe('Carré')
    expect(document.body.querySelector('[role="radiogroup"]')).not.toBeNull()

    retour({ canGoBack: true })
    await flushPromises()
    expect(document.body.querySelector('.reminder-actions')).not.toBeNull()

    retour({ canGoBack: true })
    await flushPromises()
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    desinstaller()
  })

  it('passe par l’écran d’explication quand l’injection pose le premier rappel', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValue(true)
    await ouvrirF5()

    choix()[0]!.click()
    await flushPromises()
    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({
      name: 'notifications-priming',
      query: { animalName: 'Boree', kind: 'vaccination', from: 'home' },
    })
  })

  it('ne propose pas l’écran d’explication sans rappel', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValue(true)
    await ouvrirF5()

    choix()[3]!.click()
    await flushPromises()
    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(replace).not.toHaveBeenCalled()
  })

  it('revient à l’écran demandé une fois l’injection notée', async () => {
    await monter({ startAt: 'done', returnTo: 'animals' })

    choix()[0]!.click()
    await flushPromises()
    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({ name: 'animals' })
  })

  it('passe par l’écran d’explication avant l’écran demandé, au premier rappel', async () => {
    vi.mocked(shouldShowPriming).mockResolvedValue(true)
    await monter({ startAt: 'done', returnTo: 'home' })

    choix()[0]!.click()
    await flushPromises()
    bouton('.vaccination-reminder-sheet__submit').click()
    await flushPromises()

    expect(replace).toHaveBeenCalledWith({
      name: 'notifications-priming',
      query: { animalName: 'Boree', kind: 'vaccination', from: 'home' },
    })
  })

  it('s’ouvre directement sur F5 avec la date d’injection donnée', async () => {
    await monter({ startAt: 'done', initialInjectedOn: '2026-09-21' })

    expect(texte('.vaccination-reminder-sheet__injection-date')).toBe('Injection le 21 sept. 2026')
  })
})
