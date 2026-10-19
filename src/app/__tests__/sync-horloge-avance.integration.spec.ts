// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createInMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createFakeSyncServer, type FakeSyncServer } from '@/core/sync/__tests__/fake-sync-server'
import { createSyncOutboxRepository } from '@/core/sync/repository/sync-outbox.repository'
import { createSyncPushRepository } from '@/core/sync/repository/sync-push.repository'
import { createSyncCycle } from '@/core/sync/service/sync-cycle'
import { createAnimalsRepository } from '@/features/animals/repository/animals.repository'
import { createTreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import type { TreatmentEditionInput } from '@/features/treatments/schema/treatment-form.schema'
import { createTreatmentDosesService } from '@/features/treatments/service/treatment-doses.service'
import { createTreatmentPlanService } from '@/features/treatments/service/treatment-plan.service'
import { readTreatment } from '@/shared/domain/treatment-reading'

// #904 : lundi 19 octobre 2026, le téléphone A avance de 3 jours (il croit être jeudi 22), B est à
// l'heure. Le vermifuge de Luna, tous les 3 jours à 20 h dès le 25 octobre.

const USER_ID = '99999999-9999-4999-8999-999999999999'
const THREE_DAYS = 3 * 24 * 60 * 60 * 1000
const EVERY_3_DAYS = { value: 3, unit: 'day' } as const

let real = 0

async function createPhone(client: SupabaseClient, ahead: number, day: string) {
  const db = await createInMemoryDb()
  await db.execute('PRAGMA foreign_keys = ON')
  await db.run('UPDATE sync_state SET enabled = 1 WHERE id = 1')
  const deps = { loadSupabaseClient: async () => client }
  const animals = createAnimalsRepository(db, deps)
  const treatments = createTreatmentsRepository(db, deps)
  const periods = createTreatmentPeriodsRepository(db, deps)
  const doseRows = createTreatmentDosesRepository(db, deps)
  const reminders = { reschedule: async () => {} }
  const today = () => day
  const cycle = createSyncCycle({
    db,
    outbox: createSyncOutboxRepository(db),
    pushes: createSyncPushRepository(deps.loadSupabaseClient),
    tables: [animals, treatments, periods, doseRows],
    userId: () => USER_ID,
    isEligible: () => true,
  })
  const onClock = <T>(gesture: () => Promise<T>): Promise<T> => {
    vi.setSystemTime(real + ahead)
    return gesture()
  }
  return {
    db,
    animals,
    treatments,
    plans: createTreatmentPlanService({
      treatments: () => treatments,
      reminders,
      today,
      newId: () => crypto.randomUUID(),
    }),
    doses: createTreatmentDosesService({
      treatments: () => treatments,
      doses: () => doseRows,
      reminders,
      now: () => new Date(),
      today,
    }),
    onClock,
    sync: () => onClock(() => cycle.runCycle()),
  }
}

type Phone = Awaited<ReturnType<typeof createPhone>>

const at = (instant: string) => {
  real = Date.parse(instant)
}

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Milbemax',
  type: 'deworming',
  frequency: EVERY_3_DAYS,
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  ...changes,
})

describe('#904 : une horloge en avance de 3 jours, deux téléphones, de la base à la fiche', () => {
  let server: FakeSyncServer
  let a: Phone
  let b: Phone
  let id: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    server = createFakeSyncServer({ now: () => real })
    a = await createPhone(server.client, THREE_DAYS, '2026-10-22')
    b = await createPhone(server.client, 0, '2026-10-19')

    at('2026-10-19T07:00:00.000Z')
    const luna = await a.onClock(() => a.animals.create({ name: 'Luna', species: 'cat' }))
    ;({ id } = await a.onClock(() =>
      a.plans.create({
        animalId: luna.id,
        name: 'Milbemax',
        type: 'deworming',
        firstDoseOn: '2026-10-25',
        frequency: EVERY_3_DAYS,
        times: ['20:00'],
        doseQuantity: null,
        doseUnit: null,
        endsOn: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      }),
    ))
    await a.sync()
    await b.sync()
  })

  afterEach(() => {
    vi.useRealTimers()
    a.db.close()
    b.db.close()
  })

  async function stored(phone: Phone) {
    const treatment = await phone.treatments.getWithPeriods(id)
    if (treatment === null) throw new Error(`Traitement introuvable : ${id}`)
    return treatment
  }

  async function sheet(phone: Phone) {
    const view = readTreatment(await stored(phone), '2026-10-19')!.view
    return {
      next: view.upcoming({ limit: 2 }).map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`),
      report: view.history
        .filter(({ line }) => line.status === 'postponed')
        .map(({ line, effect }) => `${line.dueOn} → ${line.targetOn} ${effect.kind}`),
    }
  }

  async function report(phone: Phone, dueTime: string): Promise<void> {
    const setting = (await stored(phone)).periods.find(({ times }) => times.includes(dueTime))!
    await phone.onClock(() =>
      phone.doses.apply(id, {
        kind: 'move',
        due: { settingId: setting.id, dueOn: '2026-10-25', dueTime },
        to: '2026-10-26',
        shiftsFollowing: false,
      }),
    )
  }

  const rewriteOn = (phone: Phone, times: string[]) =>
    phone.onClock(() => phone.plans.update(id, edition({ times })))

  async function bothSynced() {
    await a.sync()
    await b.sync()
    await a.sync()
    const [onA, onB] = [await sheet(a), await sheet(b)]
    expect(onA).toEqual(onB)
    return onA
  }

  const dates = async (phone: Phone) =>
    (await stored(phone)).periods
      .map(({ createdAt, settingsWrittenAt }) => `${createdAt} ${settingsWrittenAt}`)
      .sort()

  describe('A a changé les heures à 10 h : le réglage de 8 h, créé ce jour-là, se réécrit sur place', () => {
    beforeEach(async () => {
      at('2026-10-19T08:00:00.000Z')
      await rewriteOn(a, ['08:00'])
      await a.sync()
      await b.sync()
    })

    it('B reporte à 10 h 03, A corrige les heures à 10 h 05 : les deux lisent le même calendrier', async () => {
      at('2026-10-19T08:03:00.000Z')
      await report(b, '08:00')
      await b.sync()
      at('2026-10-19T08:05:00.000Z')
      await rewriteOn(a, ['09:00'])

      at('2026-10-19T08:06:00.000Z')
      await expect(bothSynced()).resolves.toEqual({
        next: ['2026-10-25 09:00', '2026-10-28 09:00'],
        report: ['2026-10-25 → 2026-10-26 idle'],
      })
      const expected = [
        '2026-10-19T07:00:00.000Z 2026-10-19T07:00:00.000Z',
        '2026-10-19T08:00:00.000Z 2026-10-19T08:05:00.000Z',
      ]
      expect(await dates(a)).toEqual(expected)
      expect(await dates(b)).toEqual(expected)
    })

    it('un report puis un réglage dans un même envoi de A : la lecture de A ne change pas', async () => {
      at('2026-10-19T08:10:00.000Z')
      await report(a, '08:00')
      at('2026-10-19T08:12:00.000Z')
      await rewriteOn(a, ['09:00'])
      const beforeSync = await sheet(a)

      at('2026-10-19T08:20:00.000Z')
      await expect(bothSynced()).resolves.toEqual(beforeSync)
      expect(beforeSync.report).toEqual(['2026-10-25 → 2026-10-26 moves'])
    })

    it('un réglage puis un report dans un même envoi de A : le report, plus récent, tient', async () => {
      at('2026-10-19T08:10:00.000Z')
      await rewriteOn(a, ['09:00'])
      at('2026-10-19T08:12:00.000Z')
      await report(a, '09:00')
      const beforeSync = await sheet(a)

      at('2026-10-19T08:20:00.000Z')
      await expect(bothSynced()).resolves.toEqual(beforeSync)
      expect(beforeSync.report).toEqual(['2026-10-25 → 2026-10-26 moves'])
    })

    it('A réécrit encore deux fois : les dates de création ne reculent pas', async () => {
      at('2026-10-19T08:05:00.000Z')
      await rewriteOn(a, ['09:00'])
      await a.sync()
      at('2026-10-19T08:20:00.000Z')
      await rewriteOn(a, ['10:00'])
      await bothSynced()

      const expected = [
        '2026-10-19T07:00:00.000Z 2026-10-19T07:00:00.000Z',
        '2026-10-19T08:00:00.000Z 2026-10-19T08:20:00.000Z',
      ]
      expect(await dates(a)).toEqual(expected)
      expect(await dates(b)).toEqual(expected)
      expect(
        server
          .rows('treatment_period')
          .map(({ created_at }) => created_at)
          .sort(),
      ).toEqual(['2026-10-19T07:00:00.000+00:00', '2026-10-19T08:00:00.000+00:00'])
    })
  })

  it('B renomme à 11 h 30, A a renommé à 11 h et pousse à 11 h 40 : refusé, A reprend la ligne de B', async () => {
    at('2026-10-19T09:00:00.000Z')
    await a.onClock(() => a.plans.update(id, edition({ name: 'Milpro' })))
    at('2026-10-19T09:30:00.000Z')
    await b.onClock(() => b.plans.update(id, edition({ name: 'Drontal' })))
    await b.sync()

    at('2026-10-19T09:40:00.000Z')
    await a.sync()
    await b.sync()

    for (const phone of [a, b]) {
      await expect(stored(phone)).resolves.toMatchObject({
        name: 'Drontal',
        updatedAt: '2026-10-19T09:30:00.000Z',
      })
    }
    expect(server.rows('treatment').map(({ name }) => name)).toEqual(['Drontal'])
  })
})
