import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import i18n from '@/core/i18n'
import type { ReminderAction } from '@/core/notifications'
import type { Animal } from '@/features/animals/schema/animal.schema'
import type { RecordedDose } from '@/features/treatments/service/treatment-doses.service'
import type { Treatment } from '@/features/treatments/schema/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  dismissToast,
  runToastAction,
  toastAction,
  toastMessage,
  toastTone,
} from '@/shared/utils/toast'
import { createReminderActions, installReminderActions } from '../reminder-actions'

const TODAY = '2026-09-25'
const STAMP = '2026-08-01T09:00:00.000Z'

const BOREE: Animal = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Boree',
  species: 'dog',
  breed: null,
  birthDate: null,
  initialWeightKg: null,
  photoPath: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
}

const BRAVECTO: Treatment = {
  id: '22222222-2222-4222-8222-222222222222',
  animalId: BOREE.id,
  name: 'Bravecto',
  type: 'deworming',
  frequency: { value: 1, unit: 'month' },
  lastDoseDate: '2026-08-25',
  nextDueDate: TODAY,
  stoppedOn: null,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
}

const CARRE: Vaccination = {
  id: '33333333-3333-4333-8333-333333333333',
  animalId: BOREE.id,
  name: 'Carré',
  lastInjectionDate: '2025-09-25',
  dueDate: TODAY,
  createdAt: STAMP,
  updatedAt: STAMP,
  deletedAt: null,
}

const DOSE_ID = '44444444-4444-4444-8444-444444444444'

function done(key: string): ReminderAction {
  return { key, action: 'done' }
}

const Vide = { render: () => null }

let router: Router
let treatment: Treatment | null
let vaccination: Vaccination | null
let record: ReturnType<typeof vi.fn<(id: string, givenOn: string) => Promise<RecordedDose>>>
let undo: ReturnType<typeof vi.fn<(id: string, doseId: string) => Promise<void>>>
let refreshHome: ReturnType<typeof vi.fn<() => Promise<boolean>>>

function handler() {
  return createReminderActions({
    router,
    animals: () => ({ getById: async (id) => (id === BOREE.id ? BOREE : null) }),
    treatments: () => ({ getById: async (id) => (treatment?.id === id ? treatment : null) }),
    vaccinations: () => ({ getById: async (id) => (vaccination?.id === id ? vaccination : null) }),
    doses: { record, undo },
    refreshHome,
    t: i18n.global.t,
    today: () => TODAY,
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
  treatment = BRAVECTO
  vaccination = CARRE
  record = vi.fn<(id: string, givenOn: string) => Promise<RecordedDose>>(async (_id, givenOn) => {
    treatment = { ...BRAVECTO, lastDoseDate: givenOn, nextDueDate: '2026-10-25' }
    return { animalId: BOREE.id, doseId: DOSE_ID }
  })
  undo = vi.fn<(id: string, doseId: string) => Promise<void>>(async () => {})
  refreshHome = vi.fn<() => Promise<boolean>>(async () => true)
})

afterEach(() => {
  dismissToast()
})

function currentPlace() {
  const { name, query } = router.currentRoute.value
  return { name, query }
}

describe('« C’est fait » d’un vermifuge ou d’un antiparasitaire', () => {
  it('ouvre l’accueil, note la prise du jour et relit « À faire »', async () => {
    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(record).toHaveBeenCalledExactlyOnceWith(BRAVECTO.id, TODAY)
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
    expect(refreshHome).toHaveBeenCalledOnce()
    expect(refreshHome.mock.invocationCallOrder[0]).toBeGreaterThan(
      record.mock.invocationCallOrder[0]!,
    )
  })

  it('confirme la prise par le toast de F4, avec « Annuler »', async () => {
    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(toastMessage.value).toBe('Prise de Bravecto notée pour Boree')
    expect(toastAction.value).toMatchObject({
      label: 'Annuler',
      ariaLabel: 'Annuler la prise de Bravecto',
    })
  })

  it('« Annuler » retire la prise et relit « À faire »', async () => {
    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))
    refreshHome.mockClear()

    runToastAction()

    await vi.waitFor(() => expect(refreshHome).toHaveBeenCalledOnce())
    expect(undo).toHaveBeenCalledExactlyOnceWith(BRAVECTO.id, DOSE_ID)
  })

  it('note la prise depuis la relance à J+3', async () => {
    treatment = { ...BRAVECTO, lastDoseDate: '2026-08-22', nextDueDate: '2026-09-22' }

    await handler()(done(`treatment:${BRAVECTO.id}:2026-09-22:overdue`))

    expect(record).toHaveBeenCalledExactlyOnceWith(BRAVECTO.id, TODAY)
  })

  it('note la prise depuis un cycle manqué, qui porte échéance + k × fréquence', async () => {
    treatment = { ...BRAVECTO, lastDoseDate: '2026-07-25', nextDueDate: '2026-08-25' }

    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(record).toHaveBeenCalledExactlyOnceWith(BRAVECTO.id, TODAY)
  })

  it('ne note qu’une prise quand la même notification est traitée deux fois', async () => {
    const act = handler()

    await act(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))
    await act(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(record).toHaveBeenCalledOnce()
    expect(toastMessage.value).toBe('Prise de Bravecto déjà notée aujourd’hui pour Boree')
    expect(toastTone.value).toBe('info')
    expect(toastAction.value).toBeNull()
  })

  it('dit « déjà noté » pour une notification restée dans le volet après « Fait » dans l’app', async () => {
    treatment = { ...BRAVECTO, lastDoseDate: '2026-09-23', nextDueDate: '2026-10-23' }

    await handler()(done(`treatment:${BRAVECTO.id}:2026-09-22:overdue`))

    expect(record).not.toHaveBeenCalled()
    expect(toastMessage.value).toBe('Prise de Bravecto du 23 sept. déjà notée pour Boree')
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })

  it('ouvre la feuille au lieu d’écrire quand l’échéance a été reportée sans prise', async () => {
    treatment = { ...BRAVECTO, nextDueDate: '2026-10-05' }

    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(record).not.toHaveBeenCalled()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `treatment:${BRAVECTO.id}`, step: 'actions' },
    })
  })

  it('ouvre la feuille et dit l’échec quand la prise n’a pas pu être notée', async () => {
    record.mockRejectedValue(new Error('base verrouillée'))

    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(toastMessage.value).toBe('La prise n’a pas pu être notée. Réessaie.')
    expect(toastTone.value).toBe('error')
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `treatment:${BRAVECTO.id}`, step: 'actions' },
    })
  })

  it('n’écrit rien pour un traitement arrêté ou supprimé', async () => {
    treatment = { ...BRAVECTO, stoppedOn: '2026-09-20' }
    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    treatment = null
    await handler()(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))

    expect(record).not.toHaveBeenCalled()
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })
})

describe('« C’est fait » d’un vaccin', () => {
  it('ouvre la feuille « Fait » du vaccin (F5), sans rien écrire', async () => {
    await handler()(done(`vaccination:${CARRE.id}:${TODAY}:due`))

    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `vaccination:${CARRE.id}`, step: 'done' },
    })
    expect(record).not.toHaveBeenCalled()
  })

  it('dit « déjà noté » quand l’injection de cette échéance est déjà notée', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2026-09-24', dueDate: '2027-09-24' }

    await handler()(done(`vaccination:${CARRE.id}:2026-09-22:overdue`))

    expect(toastMessage.value).toBe('Injection de Carré du 24 sept. déjà notée pour Boree')
    expect(currentPlace()).toEqual({ name: 'home', query: {} })
  })

  it('ouvre F5 quand l’échéance de la notification est toujours celle du vaccin, malgré une injection récente', async () => {
    vaccination = { ...CARRE, lastInjectionDate: '2026-09-24', dueDate: TODAY }

    await handler()(done(`vaccination:${CARRE.id}:${TODAY}:due`))

    expect(toastMessage.value).toBeNull()
    expect(currentPlace()).toEqual({
      name: 'home',
      query: { reminder: `vaccination:${CARRE.id}`, step: 'done' },
    })
  })
})

describe('texte « déjà noté »', () => {
  afterEach(() => {
    i18n.global.locale.value = 'fr'
  })

  const noted = {
    dose: {
      today: { ...BRAVECTO, lastDoseDate: TODAY, nextDueDate: '2026-10-25' },
      earlier: { ...BRAVECTO, lastDoseDate: '2026-09-23', nextDueDate: '2026-10-23' },
    },
    injection: {
      today: { ...CARRE, lastInjectionDate: TODAY, dueDate: '2027-09-25' },
      earlier: { ...CARRE, lastInjectionDate: '2026-09-23', dueDate: '2027-09-23' },
    },
  }

  async function alreadyNotedToast(
    kind: 'dose' | 'injection',
    day: 'today' | 'earlier',
  ): Promise<string | null> {
    if (kind === 'dose') treatment = noted.dose[day]
    else vaccination = noted.injection[day]
    const entry = kind === 'dose' ? `treatment:${BRAVECTO.id}` : `vaccination:${CARRE.id}`
    await handler()(done(`${entry}:2026-09-22:overdue`))
    return toastMessage.value
  }

  it.each([
    ['fr', 'dose', 'today', 'Prise de Bravecto déjà notée aujourd’hui pour Boree'],
    ['fr', 'dose', 'earlier', 'Prise de Bravecto du 23 sept. déjà notée pour Boree'],
    ['fr', 'injection', 'today', 'Injection de Carré déjà notée aujourd’hui pour Boree'],
    ['fr', 'injection', 'earlier', 'Injection de Carré du 23 sept. déjà notée pour Boree'],
    ['en', 'dose', 'today', 'Bravecto dose already logged today for Boree'],
    ['en', 'dose', 'earlier', 'Bravecto dose on Sep 23 already logged for Boree'],
    ['en', 'injection', 'today', 'Carré injection already logged today for Boree'],
    ['en', 'injection', 'earlier', 'Carré injection on Sep 23 already logged for Boree'],
  ] as const)('%s, %s notée %s', async (locale, kind, day, expected) => {
    i18n.global.locale.value = locale

    await expect(alreadyNotedToast(kind, day)).resolves.toBe(expected)
  })
})

describe('notification touchée hors du bouton', () => {
  it.each([
    [
      'du traitement (F2)',
      `treatment:${BRAVECTO.id}:2026-09-28:before`,
      `treatment:${BRAVECTO.id}`,
    ],
    ['du vaccin', `vaccination:${CARRE.id}:${TODAY}:due`, `vaccination:${CARRE.id}`],
  ])('ouvre la feuille %s sur l’accueil', async (_label, key, reminder) => {
    await handler()({ key, action: 'open' })

    expect(currentPlace()).toEqual({ name: 'home', query: { reminder, step: 'actions' } })
    expect(record).not.toHaveBeenCalled()
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
    const action = done(`treatment:${BRAVECTO.id}:${TODAY}:due`)
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

    deliver(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))
    deliver(done(`treatment:${BRAVECTO.id}:${TODAY}:due`))
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
