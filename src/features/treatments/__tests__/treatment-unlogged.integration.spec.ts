import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, RouterView, type Router } from 'vue-router'

import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import { createTreatmentPlanService } from '../service/treatment-plan.service'
import {
  provideTreatmentDosesService,
  provideTreatmentPlanService,
  provideTreatmentRemindersService,
  provideTreatmentsRepository,
} from '../store/treatments.store'
import TreatmentDetailView from '../views/TreatmentDetailView.vue'
import TreatmentFormView from '../views/TreatmentFormView.vue'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import i18n from '@/core/i18n'
import vuetify from '@/core/theme/vuetify'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import { dismissToast, runToastAction, toastMessage } from '@/shared/utils/toast'

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
}))

const MILO = '11111111-1111-4111-8111-111111111111'
const AT = '2026-07-10T09:00:00.000Z'
const TODAY = '2026-09-28'
const NBSP = / /g
const Vide = { render: () => null }

describe('doses non renseignées, du formulaire à la fiche, sur la même base', () => {
  let db: InMemoryDb
  let router: Router
  let wrapper: VueWrapper
  let runMany: ReturnType<typeof vi.spyOn>

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date(`${TODAY}T09:41:00`) })
    vi.stubGlobal('visualViewport', {
      addEventListener: () => {},
      removeEventListener: () => {},
      width: 412,
      height: 915,
      offsetTop: 0,
    })
    setActivePinia(createPinia())
    db = await createInMemoryDb()
    await db.execute('PRAGMA foreign_keys = ON')
    await db.run(
      `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, 'Milo', 'dog', ?, ?, 'appareil-test', 'appareil-test')`,
      [MILO, AT, AT],
    )
    const animals = useAnimalsStore()
    animals.animals = [
      {
        id: MILO,
        name: 'Milo',
        species: 'dog',
        breed: null,
        birthDate: null,
        birthDateApproximate: false,
        photoPath: null,
        createdAt: AT,
        updatedAt: AT,
        deletedAt: null,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
      },
    ]
    animals.hasLoaded = true

    const treatments = createTreatmentsRepository(db)
    const reminders = { reschedule: async () => {} }
    provideTreatmentsRepository(() => treatments)
    provideTreatmentRemindersService(() => reminders)
    provideTreatmentPlanService(() =>
      createTreatmentPlanService({
        treatments: () => treatments,
        reminders,
        today: () => TODAY,
        newId: () => crypto.randomUUID(),
      }),
    )
    provideTreatmentDosesService(() =>
      createTreatmentDosesService({
        treatments: () => treatments,
        doses: () => createTreatmentDosesRepository(db),
        reminders,
        now: () => new Date(),
        today: () => TODAY,
      }),
    )

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/animals', name: 'carnet', component: Vide },
        {
          path: '/animals/:animalId/treatments/new',
          name: 'treatment-new',
          component: TreatmentFormView,
          props: true,
        },
        {
          path: '/treatments/:id',
          name: 'treatment-detail',
          component: TreatmentDetailView,
          props: true,
        },
      ],
    })
    await router.push({ name: 'carnet' })
    await router.push({ name: 'treatment-new', params: { animalId: MILO } })
    wrapper = mount(RouterView, {
      global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
      attachTo: document.body,
    })
    await flushPromises()
    runMany = vi.spyOn(db, 'runMany')
  })

  afterEach(() => {
    wrapper.unmount()
    dismissToast()
    document.body.innerHTML = ''
    provideTreatmentsRepository(null)
    provideTreatmentRemindersService(null)
    provideTreatmentPlanService(null)
    provideTreatmentDosesService(null)
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
    db.close()
  })

  function texte(selecteur: string): string {
    return wrapper.get(selecteur).text().replace(NBSP, ' ')
  }

  function gestes() {
    return wrapper.findAll('.treatment-unlogged__action')
  }

  function dansLEcran(selecteur: string): HTMLButtonElement[] {
    return [...document.body.querySelectorAll<HTMLButtonElement>(selecteur)]
  }

  function lignes(): string[] {
    return wrapper
      .findAllComponents(HistoryRow)
      .map((row) => String(row.props('date')).replace(NBSP, ' '))
  }

  function prises() {
    return db.query<{ status: string; n: number }>(
      `SELECT status, COUNT(*) AS n FROM treatment_dose WHERE deleted_at IS NULL
       GROUP BY status ORDER BY status`,
    )
  }

  /** Planche A · V1 ter : Panacur tous les jours, première prise le 3 sept. */
  async function saisirPanacur(): Promise<void> {
    await wrapper.get('#treatment-name').setValue('Panacur')
    await wrapper
      .findAll('.treatment-form__field--type .form-segmented button')[0]!
      .trigger('click')
    await wrapper.get('#treatment-frequency-value').setValue('1')
    await wrapper.findAll('.treatment-form__unit button')[0]!.trigger('click')
    await wrapper.get('#treatment-first-dose-on').setValue('2026-09-03')
    await flushPromises()
  }

  async function creerPuisOuvrirLaFiche(): Promise<void> {
    await wrapper.get('.form-screen__submit').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('carnet'))
    const [created] = await db.query<{ id: string }>('SELECT id FROM treatment')
    await router.push({ name: 'treatment-detail', params: { id: created!.id } })
    await vi.waitFor(() => expect(wrapper.find('.treatment-dose-card').exists()).toBe(true))
    await flushPromises()
  }

  it('l’encart rempli par « Choisir les jours » : tout est écrit à « Créer », en une transaction, et la fiche n’a plus rien à renseigner', async () => {
    await saisirPanacur()
    await gestes()[1]!.trigger('click')
    await flushPromises()
    for (const jour of dansLEcran('.choose-days-month__day[role="checkbox"]').slice(3, 5)) {
      jour.click()
    }
    await flushPromises()
    dansLEcran('.treatment-choose-days__submit')[0]!.click()
    await flushPromises()

    expect(texte('.treatment-unlogged__result-text')).toBe('23 données, 2 oubliées')
    await expect(db.query('SELECT id FROM treatment')).resolves.toEqual([])
    expect(runMany).not.toHaveBeenCalled()

    await creerPuisOuvrirLaFiche()

    expect(runMany).toHaveBeenCalledOnce()
    await expect(prises()).resolves.toEqual([
      { status: 'given', n: 23 },
      { status: 'missed', n: 2 },
    ])
    expect(wrapper.find('.treatment-unlogged').exists()).toBe(false)
    expect(texte('.treatment-dose-card__label')).toBe('Dose du jour')
    expect(texte('.treatment-dose-card__value')).toBe('28 sept.')
    expect(lignes().slice(0, 3)).toEqual(['27 sept. 2026', '26 sept. 2026', '25 sept. 2026'])
  })

  it('l’encart laissé vide devient le bandeau de la fiche ; « Toutes données » l’efface sans déplacer la dose du jour, « Annuler » le ramène', async () => {
    await saisirPanacur()
    await creerPuisOuvrirLaFiche()

    await expect(prises()).resolves.toEqual([])
    expect(texte('.treatment-unlogged__title')).toBe('25 doses non renseignées')
    expect(texte('.treatment-unlogged__subtitle')).toBe('du 3 au 27 sept.')
    expect(texte('.treatment-dose-card__value')).toBe('28 sept.')
    runMany.mockClear()

    await gestes()[0]!.trigger('click')
    await flushPromises()

    expect(runMany).toHaveBeenCalledOnce()
    await expect(prises()).resolves.toEqual([{ status: 'given', n: 25 }])
    expect(wrapper.find('.treatment-unlogged').exists()).toBe(false)
    expect(texte('.treatment-dose-card__label')).toBe('Dose du jour')
    expect(texte('.treatment-dose-card__value')).toBe('28 sept.')
    expect(toastMessage.value?.replace(NBSP, ' ')).toBe('Panacur : 25 prises notées')
    runMany.mockClear()

    runToastAction()
    await flushPromises()

    expect(runMany).toHaveBeenCalledOnce()
    await expect(prises()).resolves.toEqual([])
    expect(texte('.treatment-unlogged__title')).toBe('25 doses non renseignées')
  })

  async function saisirMensuelDu7(): Promise<void> {
    await saisirPanacur()
    await wrapper.findAll('.treatment-form__unit button')[2]!.trigger('click')
    await wrapper.get('#treatment-first-dose-on').setValue('2026-09-07')
    await flushPromises()
  }

  it.each([
    [0, 'given'],
    [1, 'missed'],
  ])(
    'mensuel du 7 sept. : la dose en retard renseignée dans l’encart, la fiche attend le 7 oct. (Q42, geste %i)',
    async (geste, status) => {
      await saisirMensuelDu7()

      expect(texte('.treatment-unlogged__title')).toBe('1 dose prévue le 7 sept.')

      await gestes()[geste]!.trigger('click')
      await creerPuisOuvrirLaFiche()

      await expect(prises()).resolves.toEqual([{ status, n: 1 }])
      expect(texte('.treatment-dose-card__label')).toBe('Prochaine dose')
      expect(texte('.treatment-dose-card__value')).toBe('7 oct.')
      expect(wrapper.find('.treatment-dose-card__value--overdue').exists()).toBe(false)
      expect(wrapper.find('.treatment-unlogged').exists()).toBe(false)
    },
  )

  it('mensuel du 7 sept., encart laissé vide : la dose reste en retard sur la carte, sans bandeau', async () => {
    await saisirMensuelDu7()
    await creerPuisOuvrirLaFiche()

    await expect(prises()).resolves.toEqual([])
    expect(texte('.treatment-dose-card__value--overdue')).toBe('en retard depuis le 7 sept.')
    expect(wrapper.find('.treatment-unlogged').exists()).toBe(false)
  })

  it('« C’est fait » note la dose du jour, et le bandeau reste (critère 2)', async () => {
    await saisirPanacur()
    await creerPuisOuvrirLaFiche()

    await wrapper.get('.treatment-dose-card__done').trigger('click')
    await flushPromises()

    expect(texte('.treatment-dose-card__label')).toBe('Prochaine dose')
    expect(texte('.treatment-dose-card__value')).toBe('demain, 29 sept.')
    expect(texte('.treatment-unlogged__title')).toBe('25 doses non renseignées')
  })

  it('les oubliées choisies sur la fiche rejoignent l’historique, regroupées', async () => {
    await saisirPanacur()
    await creerPuisOuvrirLaFiche()

    await gestes()[1]!.trigger('click')
    await flushPromises()
    for (const jour of dansLEcran('.choose-days-month__day[role="checkbox"]').slice(-2)) {
      jour.click()
    }
    await flushPromises()
    dansLEcran('.treatment-choose-days__submit')[0]!.click()
    await flushPromises()

    await expect(prises()).resolves.toEqual([
      { status: 'given', n: 23 },
      { status: 'missed', n: 2 },
    ])
    expect(toastMessage.value?.replace(NBSP, ' ')).toBe('Panacur : 23 prises et 2 oublis notés')
    expect(wrapper.find('.treatment-unlogged').exists()).toBe(false)
    expect(texte('.treatment-history__group')).toContain('Oubliées · du 26 sept. au 27 sept. 2026')
    expect(lignes()[0]).toBe('25 sept. 2026')
  })
})
