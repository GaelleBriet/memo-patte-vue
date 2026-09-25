// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { createTreatmentDosesService } from '@/features/treatments/service/treatment-doses.service'
import { createVaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import { createVaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import { createVaccinationInjectionsService } from '@/features/vaccinations/service/vaccination-injections.service'
import { createWeightRepository } from '@/features/weight/repository/weight.repository'

const USER_ID = '99999999-9999-4999-8999-999999999999'

async function createDevice(client: SupabaseClient) {
  const db: InMemoryDb = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')

  const deps = { loadSupabaseClient: async () => client }
  const animals = createAnimalsRepository(db, deps)
  const vaccinations = createVaccinationsRepository(db, deps)
  const injections = createVaccinationInjectionsRepository(db, deps)
  const treatments = createTreatmentsRepository(db, deps)
  const doses = createTreatmentDosesRepository(db, deps)
  const weight = createWeightRepository(db, deps)
  const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
  const cycle = createSyncCycle({
    db,
    outbox: createSyncOutboxRepository(db),
    tables: [animals, vaccinations, injections, treatments, doses, weight],
    userId: () => USER_ID,
    isEligible: () => true,
    onRemindersOutdated,
  })
  const reminders = { reschedule: async () => {} }
  const now = () => new Date()

  return {
    db,
    animals,
    vaccinations,
    treatments,
    weight,
    onRemindersOutdated,
    injectionDone: createVaccinationInjectionsService({
      vaccinations: () => vaccinations,
      injections: () => injections,
      reminders,
      now,
    }),
    doseDone: createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => doses,
      reminders,
      now,
    }),
    sync: () => cycle.runCycle(),
  }
}

type Device = Awaited<ReturnType<typeof createDevice>>

function later(minutes = 1): void {
  vi.setSystemTime(Date.now() + minutes * 60_000)
}

async function createCarnet(device: Device) {
  const milo = await device.animals.create({ name: 'Milo', species: 'dog' })
  const carre = await device.vaccinations.create({
    animalId: milo.id,
    name: 'Carré',
    lastInjectionDate: '2025-09-20',
    dueDate: '2026-09-20',
  })
  const bravecto = await device.treatments.create({
    animalId: milo.id,
    name: 'Bravecto',
    type: 'antiparasitic',
    frequency: { value: 1, unit: 'month' },
    lastDoseDate: '2026-08-20',
  })
  return { milo, carre, bravecto }
}

async function historyOf(device: Device, vaccinationId: string) {
  return (await device.vaccinations.listInjections(vaccinationId)).map(({ id }) => id)
}

describe('synchro de l’historique entre deux appareils', () => {
  let server: FakeSyncServer
  let phone: Device
  let tablet: Device

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-09-25T08:00:00.000Z') })
    server = createFakeSyncServer()
    phone = await createDevice(server.client)
    tablet = await createDevice(server.client)
  })

  afterEach(() => {
    vi.useRealTimers()
    phone.db.close()
    tablet.db.close()
  })

  it('tire un vaccin et un traitement avec leur premier événement, arrivés dans la même passe', async () => {
    const { carre, bravecto } = await createCarnet(phone)
    await phone.sync()

    await tablet.sync()

    await expect(tablet.vaccinations.getById(carre.id)).resolves.toMatchObject({
      name: 'Carré',
      lastInjectionDate: '2025-09-20',
      dueDate: '2026-09-20',
    })
    await expect(tablet.treatments.getById(bravecto.id)).resolves.toMatchObject({
      lastDoseDate: '2026-08-20',
      nextDueDate: '2026-09-20',
    })
    expect(tablet.onRemindersOutdated).toHaveBeenCalledOnce()
  })

  it('deux « fait » simultanés donnent deux injections, et la même tête sur les deux appareils', async () => {
    const { carre } = await createCarnet(phone)
    await phone.sync()
    await tablet.sync()
    tablet.onRemindersOutdated.mockClear()

    later()
    await phone.injectionDone.record(carre.id, {
      injectedOn: '2026-09-25',
      nextDueDate: '2027-09-25',
    })
    later()
    await tablet.injectionDone.record(carre.id, {
      injectedOn: '2026-09-24',
      nextDueDate: '2029-09-24',
    })
    await phone.sync()
    await tablet.sync()
    await phone.sync()

    expect(await historyOf(phone, carre.id)).toHaveLength(3)
    expect(await historyOf(tablet, carre.id)).toEqual(await historyOf(phone, carre.id))
    const head = { lastInjectionDate: '2026-09-25', dueDate: '2027-09-25' }
    await expect(phone.vaccinations.getById(carre.id)).resolves.toMatchObject(head)
    await expect(tablet.vaccinations.getById(carre.id)).resolves.toMatchObject(head)
    expect(tablet.onRemindersOutdated).toHaveBeenCalledOnce()
  })

  it('deux prises notées le même jour sur deux appareils : deux prises, et la même tête partout', async () => {
    const { bravecto } = await createCarnet(phone)
    await phone.sync()
    await tablet.sync()

    later()
    await phone.doseDone.record(bravecto.id, '2026-09-25')
    later()
    await tablet.doseDone.record(bravecto.id, '2026-09-25')
    await phone.sync()
    await tablet.sync()
    await phone.sync()

    const phoneDoses = await phone.treatments.listDoses(bravecto.id)
    const tabletDoses = await tablet.treatments.listDoses(bravecto.id)
    expect(phoneDoses).toHaveLength(3)
    expect(tabletDoses.map(({ id }) => id)).toEqual(phoneDoses.map(({ id }) => id))
    await expect(tablet.treatments.getById(bravecto.id)).resolves.toEqual(
      await phone.treatments.getById(bravecto.id),
    )
  })

  it('un renommage et un « fait » simultanés se composent : le nom de l’un, l’échéance de l’autre', async () => {
    const { carre, bravecto } = await createCarnet(phone)
    await phone.sync()
    await tablet.sync()

    later()
    await phone.vaccinations.update(carre.id, {
      name: 'Carré (CHPPi)',
      lastInjectionDate: '2025-09-20',
      dueDate: '2026-09-20',
    })
    await phone.treatments.update(bravecto.id, {
      name: 'Bravecto Plus',
      type: 'antiparasitic',
      frequency: { value: 1, unit: 'month' },
      nextDueDate: '2026-09-20',
    })
    later()
    await tablet.injectionDone.record(carre.id, {
      injectedOn: '2026-09-25',
      nextDueDate: '2027-09-25',
    })
    await tablet.doseDone.record(bravecto.id, '2026-09-25')
    await phone.sync()
    await tablet.sync()
    await phone.sync()

    for (const device of [phone, tablet]) {
      await expect(device.vaccinations.getById(carre.id)).resolves.toMatchObject({
        name: 'Carré (CHPPi)',
        lastInjectionDate: '2026-09-25',
        dueDate: '2027-09-25',
      })
      await expect(device.treatments.getById(bravecto.id)).resolves.toMatchObject({
        name: 'Bravecto Plus',
        lastDoseDate: '2026-09-25',
        nextDueDate: '2026-10-25',
      })
    }
  })

  it('ne saute jamais un vaccin et son injection écrits pendant le parcours d’une autre table', async () => {
    const { milo } = await createCarnet(phone)
    await phone.sync()
    let rage = ''
    server.beforeNextPull('weight_entry', async () => {
      later()
      rage = (
        await phone.vaccinations.create({
          animalId: milo.id,
          name: 'Rage',
          lastInjectionDate: '2026-09-25',
          dueDate: '2027-09-25',
        })
      ).id
      await phone.weight.create({ animalId: milo.id, weightKg: 12.4, measuredOn: '2026-09-25' })
      await phone.sync()
    })

    await tablet.sync()
    await tablet.sync()

    await expect(tablet.vaccinations.getById(rage)).resolves.toMatchObject({
      name: 'Rage',
      lastInjectionDate: '2026-09-25',
      dueDate: '2027-09-25',
    })
  })

  it('une injection tirée avant son vaccin, écrit pendant la passe : rien n’est perdu au cycle suivant', async () => {
    const { milo } = await createCarnet(phone)
    await phone.sync()
    let toux = ''
    server.beforeNextPull('vaccination_injection', async () => {
      later()
      toux = (
        await phone.vaccinations.create({
          animalId: milo.id,
          name: 'Toux du chenil',
          lastInjectionDate: '2026-09-25',
          dueDate: '2027-09-25',
        })
      ).id
      await phone.sync()
    })

    await expect(tablet.sync()).rejects.toThrow(/FOREIGN KEY/)
    await tablet.sync()

    await expect(tablet.vaccinations.getById(toux)).resolves.toMatchObject({
      lastInjectionDate: '2026-09-25',
    })
  })
})
