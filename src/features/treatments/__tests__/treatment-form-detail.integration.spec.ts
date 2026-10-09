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
import { dismissToast } from '@/shared/utils/toast'

vi.mock('@/core/notifications/permission', () => ({
  shouldShowPriming: vi.fn<() => Promise<boolean>>(async () => false),
}))

const MILO = '11111111-1111-4111-8111-111111111111'
const AT = '2026-07-10T09:00:00.000Z'
const TODAY = '2026-09-28'
const REPORT = 'Reportée au 14 oct. 2026 (prévue le 10 oct.)'
const DECALAGE = 'Doses suivantes décalées · prochaine le 14 janv. 2027'
const Vide = { render: () => null }

describe('formulaire et fiche d’un traitement, sur la même base', () => {
  let db: InMemoryDb
  let router: Router
  let wrapper: VueWrapper
  let id: string

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
    const doses = createTreatmentDosesRepository(db)
    const reminders = { reschedule: async () => {} }
    const plan = createTreatmentPlanService({
      treatments: () => treatments,
      reminders,
      today: () => TODAY,
      newId: () => crypto.randomUUID(),
    })
    provideTreatmentsRepository(() => treatments)
    provideTreatmentRemindersService(() => reminders)
    provideTreatmentPlanService(() => plan)
    provideTreatmentDosesService(() =>
      createTreatmentDosesService({
        treatments: () => treatments,
        doses: () => doses,
        reminders,
        now: () => new Date(),
        today: () => TODAY,
      }),
    )

    id = (
      await plan.create({
        animalId: MILO,
        name: 'Milbemax',
        type: 'deworming',
        firstDoseOn: '2026-07-10',
        frequency: { value: 3, unit: 'month' },
        times: [],
        doseQuantity: 1,
        doseUnit: 'tablet',
        endsOn: null,
      })
    ).id
    await doses.applyBatch(
      [
        {
          action: 'create',
          id: crypto.randomUUID(),
          treatmentId: id,
          animalId: MILO,
          dose: {
            periodId: id,
            dueOn: '2026-07-10',
            dueTime: null,
            givenOn: '2026-07-10',
            status: 'given',
            nextDueDate: '2026-10-10',
          },
        },
      ],
      AT,
    )

    router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: '/animals', name: 'carnet', component: Vide },
        {
          path: '/treatments/:id',
          name: 'treatment-detail',
          component: TreatmentDetailView,
          props: true,
        },
        {
          path: '/treatments/:id/edit',
          name: 'treatment-edit',
          component: TreatmentFormView,
          props: true,
        },
      ],
    })
    await router.push({ name: 'carnet' })
    await router.push({ name: 'treatment-detail', params: { id } })
    wrapper = mount(RouterView, {
      global: { plugins: [vuetify, i18n, router], stubs: { transition: false } },
      attachTo: document.body,
    })
    await flushPromises()
  })

  afterEach(() => {
    wrapper.unmount()
    dismissToast()
    document.body.innerHTML = ''
    provideTreatmentsRepository(null)
    provideTreatmentRemindersService(null)
    provideTreatmentPlanService(null)
    provideTreatmentDosesService(null)
    vi.unstubAllGlobals()
    vi.useRealTimers()
    db.close()
  })

  function texte(): string {
    return wrapper.text().replaceAll('\u00a0', ' ')
  }

  function lignes(): string[] {
    return wrapper
      .findAllComponents(HistoryRow)
      .map((row) => String(row.props('date')).replaceAll('\u00a0', ' '))
  }

  async function ouvrirLeFormulaire(): Promise<void> {
    await wrapper.get('.treatment-detail__edit').trigger('click')
    await vi.waitFor(() => expect(wrapper.find('#treatment-next-dose-on').exists()).toBe(true))
  }

  async function enregistrer(): Promise<void> {
    await wrapper.get('.form-screen__submit').trigger('click')
    await vi.waitFor(() => expect(router.currentRoute.value.name).toBe('treatment-detail'))
    await flushPromises()
  }

  function prochaineDose(): string {
    return (wrapper.get('#treatment-next-dose-on').element as HTMLInputElement).value
  }

  it('le crayon de la fiche ouvre le formulaire, et l’enregistrement y revient avec la dose du moment recalculée', async () => {
    expect(texte()).toContain('10 oct.')

    await ouvrirLeFormulaire()

    expect(wrapper.get('.pushed-screen__title').text()).toBe('Modifier Milbemax')
    expect(prochaineDose()).toBe('2026-10-10')

    await wrapper.get('#treatment-next-dose-on').setValue('2026-10-14')
    await enregistrer()

    expect(wrapper.find('.treatment-detail').exists()).toBe(true)
    expect(texte()).toContain('14 oct.')
    expect(lignes()).toEqual([REPORT, DECALAGE, '10 juil. 2026'])
  })

  it('le report du formulaire a son menu dans l’historique, et « Supprimer ce report » remet la dose à sa date dans le formulaire, son décalage restant (N8)', async () => {
    await ouvrirLeFormulaire()
    await wrapper.get('#treatment-next-dose-on').setValue('2026-10-14')
    await enregistrer()
    const report = wrapper
      .findAllComponents(HistoryRow)
      .find((row) => String(row.props('date')).replaceAll('\u00a0', ' ') === REPORT)!

    expect(report.props('items').map(({ label }: { label: string }) => label)).toEqual([
      'Changer la date',
      'Supprimer ce report',
    ])

    report.vm.$emit('select', 'remove-move')
    await flushPromises()

    expect(lignes()).toEqual([DECALAGE, '10 juil. 2026'])
    await expect(
      db.query('SELECT status FROM treatment_dose WHERE deleted_at IS NULL ORDER BY status'),
    ).resolves.toEqual([{ status: 'given' }, { status: 'shift' }])

    await ouvrirLeFormulaire()

    expect(prochaineDose()).toBe('2026-10-10')
  })
})
