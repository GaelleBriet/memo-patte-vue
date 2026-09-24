import { flushPromises } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import type { Animal } from '@/features/animals/schema/animal.schema'
import type { Treatment } from '@/features/treatments/schema/treatment.schema'
import type { Vaccination } from '@/features/vaccinations/schema/vaccination.schema'
import {
  createRemindersPriming,
  hasUpcomingDueDates,
  installLaunchPriming,
} from '../reminders-priming'

const STAMP = '2026-09-01T09:00:00.000Z'
const TODAY = '2026-09-15'

function animal(id: string, deletedAt: string | null = null): Animal {
  return {
    id,
    name: 'Milo',
    species: 'dog',
    breed: null,
    birthDate: null,
    initialWeightKg: null,
    photoPath: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt,
  }
}

const MILO = animal('11111111-1111-4111-8111-111111111111')
const GONE = '99999999-9999-4999-8999-999999999999'

function vaccination(dueDate: string | null, animalId = MILO.id): Vaccination {
  return {
    id: '22222222-2222-4222-8222-222222222222',
    animalId,
    name: 'CHPPi',
    lastInjectionDate: '2025-09-15',
    dueDate,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

function treatment(nextDueDate: string, animalId = MILO.id): Treatment {
  return {
    id: '44444444-4444-4444-8444-444444444444',
    animalId,
    name: 'Milbemax',
    type: 'deworming',
    frequency: { value: 3, unit: 'month' },
    lastDoseDate: '2026-03-01',
    nextDueDate,
    stoppedOn: null,
    createdAt: STAMP,
    updatedAt: STAMP,
    deletedAt: null,
  }
}

describe('hasUpcomingDueDates', () => {
  it('est vrai pour un vaccin dont l’échéance est aujourd’hui ou plus tard', () => {
    expect(
      hasUpcomingDueDates(
        { animals: [MILO], vaccinations: [vaccination(TODAY)], treatments: [] },
        TODAY,
      ),
    ).toBe(true)
  })

  it('est faux pour une installation vide', () => {
    expect(hasUpcomingDueDates({ animals: [], vaccinations: [], treatments: [] }, TODAY)).toBe(
      false,
    )
  })

  it('est vrai pour un vaccin en retard dont la relance est encore programmée', () => {
    expect(
      hasUpcomingDueDates(
        { animals: [MILO], vaccinations: [vaccination('2026-09-12')], treatments: [] },
        TODAY,
      ),
    ).toBe(true)
  })

  it('est faux quand les vaccins n’ont qu’une échéance dont la relance est passée, ou aucune', () => {
    expect(
      hasUpcomingDueDates(
        {
          animals: [MILO],
          vaccinations: [vaccination('2026-09-11'), vaccination(null)],
          treatments: [],
        },
        TODAY,
      ),
    ).toBe(false)
  })

  it('est vrai pour un traitement, même en retard : ses cycles suivants restent à venir', () => {
    expect(
      hasUpcomingDueDates(
        { animals: [MILO], vaccinations: [], treatments: [treatment('2026-06-01')] },
        TODAY,
      ),
    ).toBe(true)
  })

  it('ignore les échéances d’un animal absent ou supprimé', () => {
    const deleted = animal(GONE, STAMP)

    expect(
      hasUpcomingDueDates(
        {
          animals: [deleted],
          vaccinations: [vaccination('2027-01-01', GONE), vaccination('2027-01-01', MILO.id)],
          treatments: [treatment('2027-01-01', GONE)],
        },
        TODAY,
      ),
    ).toBe(false)
  })
})

const Vide = { render: () => null }

function routeur(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: Vide },
      { path: '/animals', name: 'animals', component: Vide },
      { path: '/settings', name: 'settings', component: Vide },
      { path: '/notifications/priming', name: 'notifications-priming', component: Vide },
    ],
  })
}

describe('promptNotificationsIfReminders', () => {
  let router: Router
  let shouldShowPriming: ReturnType<typeof vi.fn<() => Promise<boolean>>>
  let vaccinations: Vaccination[]
  let treatments: Treatment[]
  let listAll: ReturnType<typeof vi.fn<() => Promise<Vaccination[]>>>
  let isNativePlatform: boolean

  function prompt(from: string) {
    return createRemindersPriming({
      isNativePlatform: () => isNativePlatform,
      shouldShowPriming,
      animals: () => ({ list: async () => [MILO] }),
      vaccinations: () => ({ listAll }),
      treatments: () => ({ listAll: async () => treatments }),
      today: () => TODAY,
    })(router, from)
  }

  beforeEach(async () => {
    router = routeur()
    await router.push('/')
    isNativePlatform = true
    shouldShowPriming = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
    vaccinations = [vaccination('2026-10-01')]
    treatments = []
    listAll = vi.fn<() => Promise<Vaccination[]>>(async () => vaccinations)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('remplace l’écran courant par l’écran d’explication, en retenant d’où l’on vient', async () => {
    expect(await prompt('home')).toBe(true)

    expect(router.currentRoute.value.name).toBe('notifications-priming')
    expect(router.currentRoute.value.query).toEqual({ from: 'home' })
  })

  it('ne propose rien dans le navigateur, sans rien demander ni lire', async () => {
    isNativePlatform = false

    expect(await prompt('home')).toBe(false)
    expect(shouldShowPriming).not.toHaveBeenCalled()
    expect(listAll).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('ne propose rien sans échéance à venir', async () => {
    vaccinations = [vaccination('2026-09-01')]

    expect(await prompt('home')).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('ne lit pas la base quand la permission a déjà une réponse ou que le plugin est absent', async () => {
    shouldShowPriming.mockResolvedValue(false)

    expect(await prompt('home')).toBe(false)
    expect(listAll).not.toHaveBeenCalled()
    expect(router.currentRoute.value.name).toBe('home')
  })

  it('n’interrompt pas quelqu’un qui a déjà quitté l’écran d’origine', async () => {
    await router.push('/animals')

    expect(await prompt('home')).toBe(false)
    expect(router.currentRoute.value.name).toBe('animals')
  })

  it('ne rouvre pas l’écran déjà ouvert par un formulaire', async () => {
    await router.push({ name: 'notifications-priming', query: { kind: 'treatment' } })

    expect(await prompt('home')).toBe(false)
    expect(router.currentRoute.value.query).toEqual({ kind: 'treatment' })
  })

  it('ne lève jamais quand la lecture échoue', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    listAll.mockRejectedValue(new Error('base fermée'))

    expect(await prompt('settings')).toBe(false)
    expect(router.currentRoute.value.name).toBe('home')
  })
})

describe('installLaunchPriming', () => {
  it('propose l’écran une fois la première navigation terminée, avec l’Accueil pour retour', async () => {
    const router = routeur()
    const prompt = vi.fn<(router: Router, from: string) => Promise<boolean>>(async () => false)

    installLaunchPriming(router, prompt)
    expect(prompt).not.toHaveBeenCalled()

    await router.push('/')
    await flushPromises()

    expect(prompt).toHaveBeenCalledExactlyOnceWith(router, 'home')
  })
})
