import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import i18n from '@/core/i18n'
import type { ReminderAction } from '@/core/notifications'
import type { Animal } from '@/features/animals/schema/animal.schema'
import {
  dose,
  extra,
  missed,
  period,
  treatment,
  written,
} from '@/features/treatments/__tests__/treatment-fixtures'
import type { DoseWrite } from '@/features/treatments/repository/treatment-doses.repository'
import type { TreatmentWithHistory } from '@/features/treatments/repository/treatments.repository'
import { createTreatmentDosesService } from '@/features/treatments/service/treatment-doses.service'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastMessage,
  toastTone,
} from '@/shared/utils/toast'
import { createReminderActions, installReminderActions } from '../reminder-actions'
import { plain } from '@/shared/__tests__/plain'

const TODAY = '2026-10-07'
const STAMP = '2026-08-01T09:00:00.000Z'

function animal(id: string, name: string): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    photoPath: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
    unfollowedOn: null,
    departureReason: null,
    departureDate: null,
  }
}

const LUNA = animal('luna', 'Luna')
const BOREE = animal('11111111-1111-4111-8111-111111111111', 'Boree')

const CARRE: Vaccination = {
  id: '33333333-3333-4333-8333-333333333333',
  animalId: BOREE.id,
  name: 'Carré',
  lastInjectionDate: '2025-10-07',
  dueDate: TODAY,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
}

const QUOTIDIEN_20H = period({ startsOn: '2026-10-01', firstDueOn: '2026-10-01', times: ['20:00'] })
const MATIN_ET_SOIR = period({
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  times: ['08:00', '20:00'],
})
const VENDREDIS = period({
  startsOn: '2026-10-02',
  firstDueOn: '2026-10-02',
  frequency: { value: 1, unit: 'week' },
})
const TOUS_LES_3_JOURS = period({
  startsOn: '2026-10-01',
  firstDueOn: '2026-10-01',
  frequency: { value: 3, unit: 'day' },
  times: ['08:00', '20:00'],
})

const SOIR = { dueTime: '20:00' }
const METACAM = 'metacam'

function done(key: string): ReminderAction {
  return { key, action: 'done' }
}

const Vide = { render: () => null }

let router: Router
let today: string
let book: TreatmentWithHistory | null
let vaccination: Vaccination | null
let replacedDues: string[]
let applyBatch: Mock<(writes: readonly DoseWrite[], at: string) => Promise<DoseWrite[]>>
let refreshHome: ReturnType<typeof vi.fn<() => Promise<boolean>>>

function inverseOf(writes: readonly DoseWrite[]): DoseWrite[] {
  return writes.flatMap((write): DoseWrite[] =>
    write.action === 'create' ? [{ action: 'delete', id: write.id }] : [],
  )
}

function handler() {
  const doses = createTreatmentDosesService({
    treatments: () => ({ getWithHistory: async (id) => (book?.id === id ? book : null) }),
    doses: () => ({ applyBatch }),
    reminders: { reschedule: async () => {} },
    now: () => new Date(`${today}T10:00:00.000Z`),
    today: () => today,
  })
  return createReminderActions({
    router,
    animals: () => ({
      getById: async (id) => [LUNA, BOREE].find((candidate) => candidate.id === id) ?? null,
    }),
    treatments: () => ({ getWithHistory: async (id) => (book?.id === id ? book : null) }),
    vaccinations: () => ({
      getById: async (id) => (vaccination?.id === id ? vaccination : null),
      listReplacedDues: async () => replacedDues,
    }),
    doses,
    refreshHome,
    t: i18n.global.t,
    today: () => today,
  })
}

beforeEach(async () => {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/animals', name: 'animals', component: Vide },
    ],
  })
  await router.push({ name: 'animals' })
  today = TODAY
  book = null
  vaccination = CARRE
  replacedDues = []
  applyBatch = vi.fn<(writes: readonly DoseWrite[], at: string) => Promise<DoseWrite[]>>(
    async (writes) => {
      book = written(book!, writes)
      return inverseOf(writes)
    },
  )
  refreshHome = vi.fn<() => Promise<boolean>>(async () => true)
})

afterEach(() => {
  dismissToast()
  i18n.global.locale.value = 'fr'
})

function currentPlace() {
  const { name, query } = router.currentRoute.value
  return { name, query }
}

function givenLines() {
  return (book?.doses ?? [])
    .filter(({ status }) => status === 'given')
    .map(({ dueOn, dueTime, givenOn }) => ({ dueOn, dueTime, givenOn }))
}

function sheetOf(id: string) {
  return { name: 'home', query: { reminder: `treatment:${id}`, step: 'actions' } }
}

describe('« C’est fait » d’une notification du jour (RA-18, TR-20, T5)', () => {
  beforeEach(() => {
    book = treatment([QUOTIDIEN_20H], [dose('2026-10-06', '2026-10-07', SOIR)])
  })

  it('note son échéance, jour et heure, datée d’aujourd’hui, puis relit « À faire »', async () => {
    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(givenLines()).toContainEqual({ dueOn: TODAY, dueTime: '20:00', givenOn: TODAY })
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
    expect(refreshHome).toHaveBeenCalledOnce()
    expect(refreshHome.mock.invocationCallOrder[0]).toBeGreaterThan(
      applyBatch.mock.invocationCallOrder[0]!,
    )
  })

  it('confirme la prise par un toast avec « Annuler »', async () => {
    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(toastMessage.value).toBe('Prise de Métacam notée pour Luna')
    expect(toastAction.value).toMatchObject({
      label: 'Annuler',
      ariaLabel: 'Annuler la prise de Métacam',
    })
  })

  it('« Annuler » retire la prise et relit « À faire »', async () => {
    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    refreshHome.mockClear()

    runToastAction()

    await vi.waitFor(() => expect(refreshHome).toHaveBeenCalledOnce())
    expect(givenLines()).not.toContainEqual(expect.objectContaining({ dueOn: TODAY }))
  })

  it('« Annuler » qui échoue relit « À faire », avec le toast d’échec', async () => {
    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    refreshHome.mockClear()
    applyBatch.mockRejectedValue(new Error('prise modifiée depuis'))

    runToastAction()

    await vi.waitFor(() => expect(refreshHome).toHaveBeenCalledOnce())
    expect(toastMessage.value).toBe('L’annulation n’a pas abouti.')
  })

  it('TR-21, Q33 : la même notification traitée deux fois ne note qu’une prise', async () => {
    const act = handler()

    await act(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    await act(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(applyBatch).toHaveBeenCalledOnce()
    expect(toastMessage.value).toBe('Prise de Métacam déjà notée aujourd’hui pour Luna')
    expect(toastTone.value).toBe('info')
    expect(toastAction.value).toBeNull()
  })

  it('Q32 levée : la notification de 20 h note 20 h même quand 8 h est notée', async () => {
    book = treatment([MATIN_ET_SOIR], [dose(TODAY, TODAY, { dueTime: '08:00' })])

    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(givenLines()).toContainEqual({ dueOn: TODAY, dueTime: '20:00', givenOn: TODAY })
    expect(toastMessage.value?.replaceAll(' ', ' ')).toBe(
      'Prise de 20 h de Métacam notée pour Luna',
    )
  })

  it('Q33 : une dose donnée en avance couvre son échéance, « déjà notée »', async () => {
    today = '2026-10-09'
    book = treatment(
      [VENDREDIS],
      [dose('2026-10-02', '2026-10-09'), dose('2026-10-09', '2026-10-16', { givenOn: TODAY })],
    )

    await handler()(done(`treatment:${METACAM}:2026-10-09::due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(plain(toastMessage.value)).toBe('Prise de Métacam du 7 oct. déjà notée pour Luna')
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })

  it('G11 : une prise en plus ne couvre pas l’échéance, qui se note', async () => {
    today = '2026-10-16'
    book = treatment(
      [VENDREDIS],
      [
        dose('2026-10-02', '2026-10-09'),
        dose('2026-10-09', '2026-10-16'),
        extra('2026-10-14', '2026-10-16'),
      ],
    )

    await handler()(done(`treatment:${METACAM}:2026-10-16::due`))

    expect(givenLines()).toContainEqual({
      dueOn: '2026-10-16',
      dueTime: null,
      givenOn: '2026-10-16',
    })
  })

  it('Q41 : un oubli ne redevient pas donné, la feuille s’ouvre', async () => {
    book = treatment([QUOTIDIEN_20H], [missed(TODAY, '2026-10-08', SOIR)])

    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual(sheetOf(METACAM))
  })

  it('ouvre la feuille et dit l’échec quand la prise n’a pas pu être notée', async () => {
    applyBatch.mockRejectedValue(new Error('base verrouillée'))

    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(toastMessage.value).toBe('La prise n’a pas pu être notée. Réessaie.')
    expect(toastTone.value).toBe('error')
    expect(currentPlace()).toEqual(sheetOf(METACAM))
  })

  it('dit qu’un traitement arrêté n’a plus de dose à noter, sans rien écrire', async () => {
    const stopped = { startsOn: '2026-10-06', firstDueOn: '2026-10-06', stoppedOn: '2026-10-06' }
    book = treatment([{ ...QUOTIDIEN_20H, ...stopped }], book!.doses)

    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(toastMessage.value).toBe('Ce traitement n’a plus de dose à noter.')
    expect(toastTone.value).toBe('info')
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })

  it('reste muet pour un traitement supprimé', async () => {
    book = null

    await handler()(done(`treatment:${METACAM}:${TODAY}:2000:due`))

    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })
})

describe('« C’est fait » d’une notification d’un jour passé : « Donnée quand ? » (V5)', () => {
  it('critère 6 des Rappels, 11 des Traitements : la veille, demande la date sans rien noter', async () => {
    book = treatment([QUOTIDIEN_20H], [dose('2026-10-05', '2026-10-06', SOIR)])

    await handler()(done(`treatment:${METACAM}:2026-10-06:2000:due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: {
        reminder: `treatment:${METACAM}`,
        step: 'given-when',
        due: '2026-10-06',
        time: '20:00',
      },
    })
  })

  it('relance d’un hebdomadaire sans heure', async () => {
    today = '2026-10-12'
    book = treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')])

    await handler()(done(`treatment:${METACAM}:2026-10-09::overdue`))

    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `treatment:${METACAM}`, step: 'given-when', due: '2026-10-09' },
    })
  })

  it('TR-23 bis : la relance d’un jour à plusieurs heures vise toute la journée', async () => {
    book = treatment(
      [TOUS_LES_3_JOURS],
      [
        dose('2026-10-01', '2026-10-01', { dueTime: '08:00' }),
        dose('2026-10-01', '2026-10-04', { dueTime: '20:00' }),
      ],
    )

    await handler()(done(`treatment:${METACAM}:2026-10-04:0800:overdue`))

    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `treatment:${METACAM}`, step: 'given-when', due: '2026-10-04' },
    })
  })

  it('dit « déjà notée » quand l’échéance a été notée depuis dans l’app', async () => {
    book = treatment(
      [QUOTIDIEN_20H],
      [dose('2026-10-06', '2026-10-07', { dueTime: '20:00', givenOn: '2026-10-06' })],
    )

    await handler()(done(`treatment:${METACAM}:2026-10-06:2000:due`))

    expect(plain(toastMessage.value)).toBe('Prise de Métacam du 6 oct. déjà notée pour Luna')
  })
})

describe('notification à l’ancienne clé, sans heure (Q32)', () => {
  it('note la dose du moment d’une notification du jour', async () => {
    book = treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')])
    today = '2026-10-09'

    await handler()(done(`treatment:${METACAM}:2026-10-09:due`))

    expect(givenLines()).toContainEqual({
      dueOn: '2026-10-09',
      dueTime: null,
      givenOn: '2026-10-09',
    })
    expect(toastMessage.value).toBe('Prise de Métacam notée pour Luna')
  })

  it('jour passé : « Donnée quand ? » sur la journée, sans rien noter ni décaler', async () => {
    today = '2026-10-12'
    book = treatment([VENDREDIS], [dose('2026-10-02', '2026-10-09')])

    await handler()(done(`treatment:${METACAM}:2026-10-09:overdue`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `treatment:${METACAM}`, step: 'given-when', due: '2026-10-09' },
    })
  })

  it('ouvre la feuille quand une prise de la journée est déjà notée', async () => {
    book = treatment([MATIN_ET_SOIR], [dose(TODAY, TODAY, { dueTime: '08:00' })])

    await handler()(done(`treatment:${METACAM}:${TODAY}:due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(currentPlace()).toEqual(sheetOf(METACAM))
  })

  it('dit « déjà notée » quand toute la journée est notée', async () => {
    book = treatment([QUOTIDIEN_20H], [dose(TODAY, '2026-10-08', SOIR)])

    await handler()(done(`treatment:${METACAM}:${TODAY}:due`))

    expect(applyBatch).not.toHaveBeenCalled()
    expect(toastMessage.value).toBe('Prise de Métacam déjà notée aujourd’hui pour Luna')
  })
})

describe('« C’est fait » d’un vaccin', () => {
  it('ouvre la feuille « Fait » du vaccin (F5), sans rien écrire', async () => {
    await handler()(done(`vaccination:${CARRE.id}:${TODAY}:due`))

    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `vaccination:${CARRE.id}`, step: 'done' },
    })
  })

  it('dit « déjà noté » quand l’injection de cette échéance est déjà notée', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2026-10-06', dueDate: '2027-10-06' }
    replacedDues = ['2026-10-04']

    await handler()(done(`vaccination:${CARRE.id}:2026-10-04:overdue`))

    expect(plain(toastMessage.value)).toBe('Injection de Carré du 6 oct. déjà notée pour Boree')
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })

  it('VA-8 : tient pour notée une échéance remplacée plus de 3 jours avant, sans écrire', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2026-09-20', dueDate: '2027-09-20' }
    replacedDues = ['2026-10-04']

    await handler()(done(`vaccination:${CARRE.id}:2026-10-04:overdue`))

    expect(plain(toastMessage.value)).toBe('Injection de Carré du 20 sept. déjà notée pour Boree')
  })

  it('ouvre F5 pour une échéance déplacée sans injection', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2025-10-04', dueDate: '2026-11-04' }

    await handler()(done(`vaccination:${CARRE.id}:2026-10-04:overdue`))

    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `vaccination:${CARRE.id}`, step: 'done' },
    })
  })

  it('ouvre F5 quand l’échéance de la notification est toujours celle du vaccin, malgré une injection récente', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2026-10-06', dueDate: TODAY }

    await handler()(done(`vaccination:${CARRE.id}:${TODAY}:due`))

    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `vaccination:${CARRE.id}`, step: 'done' },
    })
  })

  it.each([
    ['fr', 'today', 'Injection de Carré déjà notée aujourd’hui pour Boree'],
    ['fr', 'earlier', 'Injection de Carré du 5 oct. déjà notée pour Boree'],
    ['en', 'today', 'Carré injection already logged today for Boree'],
    ['en', 'earlier', 'Carré injection on Oct 5 already logged for Boree'],
  ] as const)('%s, injection notée %s', async (locale, day, expected) => {
    i18n.global.locale.value = locale
    const lastInjectionDate = day === 'today' ? TODAY : '2026-10-05'
    vaccination = { ...CARRE, lastInjectionDate, dueDate: '2027-10-05' }
    replacedDues = ['2026-10-04']

    await handler()(done(`vaccination:${CARRE.id}:2026-10-04:overdue`))

    expect(plain(toastMessage.value)).toBe(expected)
  })
})

describe('texte « déjà notée » d’une prise', () => {
  it.each([
    ['fr', TODAY, 'Prise de Métacam déjà notée aujourd’hui pour Luna'],
    ['fr', '2026-10-06', 'Prise de Métacam du 6 oct. déjà notée pour Luna'],
    ['en', TODAY, 'Métacam dose already logged today for Luna'],
    ['en', '2026-10-06', 'Métacam dose on Oct 6 already logged for Luna'],
  ] as const)('%s, prise notée le %s', async (locale, givenOn, expected) => {
    i18n.global.locale.value = locale
    book = treatment([QUOTIDIEN_20H], [dose('2026-10-06', '2026-10-07', { ...SOIR, givenOn })])

    await handler()(done(`treatment:${METACAM}:2026-10-06:2000:due`))

    expect(plain(toastMessage.value)).toBe(expected)
  })
})

describe('notification touchée hors du bouton (RA-17)', () => {
  it.each([
    ['du traitement', `treatment:${METACAM}:2026-10-09::before`, `treatment:${METACAM}`],
    ['du vaccin', `vaccination:${CARRE.id}:${TODAY}:due`, `vaccination:${CARRE.id}`],
  ])('ouvre la feuille %s sur l’accueil', async (_label, key, reminder) => {
    await handler()({ key, action: 'open' })

    expect(currentPlace()).toEqual({ name: 'home', query: { reminder, step: 'actions' } })
    expect(applyBatch).not.toHaveBeenCalled()
  })

  it('remplace l’accueil déjà affiché au lieu de l’empiler', async () => {
    await router.push({ name: 'home' })

    await handler()({ key: `vaccination:${CARRE.id}:${TODAY}:due`, action: 'open' })
    expect(currentPlace().query).toEqual({ reminder: `vaccination:${CARRE.id}`, step: 'actions' })
    const arrive = new Promise<void>((resolve) => router.afterEach(() => resolve()))
    router.back()
    await arrive

    expect(currentPlace().name).toBe('animals')
  })

  it('ouvre simplement l’accueil pour une clé illisible', async () => {
    await handler()({ key: 'weight:3', action: 'open' })

    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })
})

describe('installReminderActions', () => {
  function listenerOf(action?: ReminderAction) {
    let deliver: (action: ReminderAction) => void = () => {}
    const stop = vi.fn<() => void>()
    const listen = vi.fn<(listener: (action: ReminderAction) => void) => () => void>((listener) => {
      deliver = listener
      if (action) listener(action)
      return stop
    })
    return { listen, stop, deliver: (next: ReminderAction) => deliver(next) }
  }

  it('traite après le démarrage l’action retenue par le plugin pendant que l’app était fermée', async () => {
    let ready: () => void = () => {}
    const isReady = () => new Promise<void>((resolve) => (ready = resolve))
    const handle = vi.fn<(action: ReminderAction) => Promise<void>>().mockResolvedValue()
    const action = done(`treatment:${METACAM}:${TODAY}:2000:due`)
    const { listen } = listenerOf(action)

    installReminderActions({ isReady }, handle, listen)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle).not.toHaveBeenCalled()

    ready()

    await vi.waitFor(() => expect(handle).toHaveBeenCalledExactlyOnceWith(action))
  })

  it('traite aussitôt une action reçue app ouverte', async () => {
    const handle = vi.fn<(action: ReminderAction) => Promise<void>>().mockResolvedValue()
    const { listen, deliver } = listenerOf()
    installReminderActions({ isReady: async () => {} }, handle, listen)

    deliver({ key: `vaccination:${CARRE.id}:${TODAY}:due`, action: 'open' })

    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce())
  })

  it('traite les actions l’une après l’autre, même après un échec', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    let finishFirst: () => void = () => {}
    const handle = vi
      .fn<(action: ReminderAction) => Promise<void>>()
      .mockImplementationOnce(
        () => new Promise((_resolve, reject) => (finishFirst = () => reject(new Error('base')))),
      )
      .mockResolvedValue()
    const { listen, deliver } = listenerOf()
    installReminderActions({ isReady: async () => {} }, handle, listen)

    deliver(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    deliver(done(`treatment:${METACAM}:${TODAY}:2000:due`))
    await vi.waitFor(() => expect(handle).toHaveBeenCalledOnce())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(handle).toHaveBeenCalledOnce()

    finishFirst()

    await vi.waitFor(() => expect(handle).toHaveBeenCalledTimes(2))
  })

  it('se désinscrit du plugin', () => {
    const { listen, stop } = listenerOf()

    installReminderActions({ isReady: async () => {} }, vi.fn(), listen)()

    expect(stop).toHaveBeenCalledOnce()
  })
})
