import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { AppliedDoseChange } from '../service/treatment-doses.service'
import { useTreatmentsStore } from '../store/treatments.store'
import TreatmentGivenWhenSheet from '../views/TreatmentGivenWhenSheet.vue'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import type { NotifiedDue } from '@/shared/domain/reminder-route'
import { dismissToast, toastMessage } from '@/shared/utils/toast'

const AT = '2026-09-01T09:00:00.000Z'

const LUNA: Animal = {
  id: 'luna',
  name: 'Luna',
  species: 'cat',
  breed: null,
  birthDate: null,
  photoPath: null,
  createdAt: AT,
  updatedAt: AT,
  deletedAt: null,
}

const VENDREDIS = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const QUOTIDIEN_20H = period({ startsOn: '2026-10-01', firstDueOn: '2026-10-01', times: ['20:00'] })
const TOUS_LES_3_JOURS = period({
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  frequency: { value: 3, unit: 'day' },
  times: ['08:00', '20:00'],
})

const APPLIED: AppliedDoseChange = {
  animalId: LUNA.id,
  finishes: false,
  undo: [{ action: 'delete', id: 'prise' }],
  alreadyGivenOn: null,
  postponement: null,
  moved: null,
  shiftKept: false,
}

let wrapper: VueWrapper | null = null
let apply: MockInstance<ReturnType<typeof useTreatmentsStore>['applyDoseAction']>

beforeEach(() => {
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
  apply = vi.spyOn(useTreatmentsStore(), 'applyDoseAction').mockResolvedValue(APPLIED)
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

async function ouvrir(book: TreatmentWithHistory, today: string, due: NotifiedDue) {
  vi.useFakeTimers({ now: new Date(`${today}T10:00:00`), toFake: ['Date'] })
  vi.spyOn(useTreatmentsStore(), 'getWithHistory').mockResolvedValue(book)
  wrapper = mount(TreatmentGivenWhenSheet, {
    props: {
      modelValue: true,
      treatmentId: book.id,
      due,
      'onUpdate:modelValue': (value: boolean) => wrapper?.setProps({ modelValue: value }),
    },
    global: { plugins: [vuetify, i18n], stubs: { transition: false } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

function texte(selector: string): string {
  return plain(document.body.querySelector(selector)?.textContent ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function choix(): string[] {
  return [...document.body.querySelectorAll('.treatment-given-when__choice')].map((button) =>
    [...button.querySelectorAll('.treatment-given-when__label, .treatment-given-when__detail')]
      .map((part) => plain(part.textContent ?? '').trim())
      .join(' · '),
  )
}

function toucher(selector: string, index = 0): void {
  const element = document.body.querySelectorAll<HTMLElement>(selector)[index]
  if (!element) throw new Error(`${selector} absent du document`)
  element.click()
}

function noteDemandee() {
  return apply.mock.calls.at(-1)?.[1]
}

const HEBDO = () => treatment([VENDREDIS], [dose('2026-10-09', '2026-10-16')])
const DOSE_16 = { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null }

describe('TreatmentGivenWhenSheet — « Donnée quand ? » (V5)', () => {
  it('propose le jour prévu, aujourd’hui et une autre date, sans rien présélectionner', async () => {
    await ouvrir(HEBDO(), '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    expect(texte('.bottom-sheet__title')).toBe('Donnée quand ?')
    expect(texte('.bottom-sheet__subtitle')).toBe('Métacam · Luna')
    expect(texte('.treatment-given-when__due')).toBe('Prévue vendredi 16 oct.')
    expect(choix()).toEqual([
      'Vendredi 16 oct. · Le jour prévu',
      'Aujourd’hui · Lundi 19 oct.',
      'Une autre date',
    ])
    expect(apply).not.toHaveBeenCalled()
  })

  it('« Le jour prévu » note la date de l’échéance, sans rien décaler', async () => {
    const sheet = await ouvrir(HEBDO(), '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    toucher('.treatment-given-when__choice', 0)
    await flushPromises()

    expect(noteDemandee()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-16', shiftsFollowing: false },
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(sheet.emitted('changed')).toHaveLength(1)
    expect(toastMessage.value).toBe('Prise de Métacam du 16 oct. notée pour Luna')
  })

  it('« Aujourd’hui » montre la case cochée et les dates, puis enregistre le décalage', async () => {
    await ouvrir(HEBDO(), '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    toucher('.treatment-given-when__choice', 1)
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(texte('.treatment-done-confirm__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    const caseDecaler = document.body.querySelector<HTMLInputElement>('.treatment-shift__input')
    expect(caseDecaler?.checked).toBe(true)
    expect(texte('.treatment-shift__help')).toBe(
      'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
    )

    toucher('.treatment-done-confirm__save')
    await flushPromises()

    expect(noteDemandee()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-19', shiftsFollowing: true },
    })
  })

  it('V5 : la posologie suit le nom, avant l’échéance', async () => {
    const book = treatment(
      [{ ...VENDREDIS, doseQuantity: 0.5, doseUnit: 'tablet' }],
      [dose('2026-10-09', '2026-10-16')],
    )
    await ouvrir(book, '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    expect(texte('.treatment-given-when__due')).toBe('½ comprimé · prévue vendredi 16 oct.')
  })

  it('« Une autre date » ouvre le calendrier de « Fait à une autre date », avec la case', async () => {
    const sheet = await ouvrir(HEBDO(), '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    toucher('.treatment-given-when__choice', 2)
    await flushPromises()

    const calendrier = sheet.findComponent(DateCalendar)
    expect(calendrier.props('excluded')).toEqual(['2026-10-09'])
    expect(calendrier.props('min')).toBe('2026-10-10')

    expect(document.body.querySelector('.treatment-other-date__calendar')).not.toBeNull()
    expect(texte('.treatment-other-date__recap')).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(document.body.querySelector<HTMLInputElement>('.treatment-shift__input')?.checked).toBe(
      true,
    )

    toucher('.treatment-other-date__submit')
    await flushPromises()

    expect(noteDemandee()).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DOSE_16, givenOn: '2026-10-19', shiftsFollowing: true },
    })
  })

  it('Q3 : tous les jours, seulement « Donnée le {jour prévu} » et « Annuler »', async () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-05', '2026-10-06', { dueTime: '20:00' })],
    )
    const sheet = await ouvrir(book, '2026-10-07', { dueOn: '2026-10-06', dueTime: '20:00' })

    expect(choix()).toEqual(['Donnée le mardi 6 oct. à 20 h'])
    expect(texte('.treatment-given-when__cancel')).toBe('Annuler')

    toucher('.treatment-given-when__choice', 0)
    await flushPromises()

    expect(noteDemandee()).toEqual({
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-10-06', dueTime: '20:00' },
        givenOn: '2026-10-06',
        shiftsFollowing: false,
      },
    })
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('« Annuler » ferme sans rien noter', async () => {
    const book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-05', '2026-10-06', { dueTime: '20:00' })],
    )
    const sheet = await ouvrir(book, '2026-10-07', { dueOn: '2026-10-06', dueTime: '20:00' })

    toucher('.treatment-given-when__cancel')
    await flushPromises()

    expect(apply).not.toHaveBeenCalled()
    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
  })

  it('se ferme sur « déjà notée » quand l’échéance a été notée entre-temps', async () => {
    const book = treatment(
      [VENDREDIS],
      [
        dose('2026-10-09', '2026-10-16'),
        dose('2026-10-16', '2026-10-23', { givenOn: '2026-10-17' }),
      ],
    )
    const sheet = await ouvrir(book, '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(toastMessage.value).toBe('Prise de Métacam du 17 oct. déjà notée pour Luna')
  })

  it('Q41 : un oubli noté entre-temps laisse l’accueil ouvrir la feuille du soin', async () => {
    const book = treatment(
      [VENDREDIS],
      [dose('2026-10-09', '2026-10-16'), missed('2026-10-16', '2026-10-23')],
    )
    const sheet = await ouvrir(book, '2026-10-19', { dueOn: '2026-10-16', dueTime: null })

    expect(sheet.emitted('update:modelValue')).toEqual([[false]])
    expect(sheet.emitted('unavailable')).toHaveLength(1)
    expect(apply).not.toHaveBeenCalled()
  })

  it('TR-23 bis : la relance d’un jour à plusieurs heures demande ensuite l’heure', async () => {
    const book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-01', '2026-10-01', { dueTime: '08:00' }),
        dose('2026-10-01', '2026-10-04', { dueTime: '20:00' }),
        missed('2026-10-04', '2026-10-04', { dueTime: '08:00' }),
      ],
    )
    await ouvrir(book, '2026-10-07', { dueOn: '2026-10-04', dueTime: null })

    toucher('.treatment-given-when__choice', 0)
    await flushPromises()

    expect(texte('.bottom-sheet__title')).toBe('À quelle heure ?')
    const heures = document.body.querySelectorAll<HTMLButtonElement>('.treatment-hours__hour')
    expect(heures).toHaveLength(2)
    expect(heures[0]!.disabled).toBe(true)

    heures[1]!.click()
    await flushPromises()

    expect(noteDemandee()).toEqual({
      kind: 'note',
      gesture: {
        kind: 'given',
        due: { periodId: 'p-1', dueOn: '2026-10-04', dueTime: '20:00' },
        givenOn: '2026-10-04',
        shiftsFollowing: false,
      },
    })
  })
})
