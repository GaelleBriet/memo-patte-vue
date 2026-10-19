// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import type { SqlStatement } from '@/core/db/db-client'
import type { SyncRow } from '@/core/supabase/guarded-upsert'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createTreatmentPeriodsRepository } from '../repository/treatment-periods.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import { createReplay, storedTreatment, type Replay } from './treatment-services-replay'

// #867 (décision de Gaelle du 16 octobre 2026) : Milo, tous les 3 jours à 20 h depuis le 26 mars,
// puis toutes les 2 semaines à 20 h dès le 3 avril ; le 7, la dose du 3 est en retard. Le téléphone A
// la reporte au 10, le téléphone B passe à 6 h et répond « Elles n'étaient pas à donner ».

const ANIMAL = '11111111-1111-4111-8111-111111111111'
const TWO_WEEKS = { value: 2, unit: 'week' } as const

type SyncPort = {
  getRowForPush(id: string): Promise<SyncRow | null>
  applyRemoteRowStatement(row: SyncRow): SqlStatement
}

function ports(db: InMemoryDb): [string, SyncPort][] {
  return [
    ['treatment', createTreatmentsRepository(db)],
    ['treatment_period', createTreatmentPeriodsRepository(db)],
    ['treatment_dose', createTreatmentDosesRepository(db)],
  ]
}

/** La synchro, ligne par ligne : la version la plus récente de chaque ligne gagne. */
async function synced(from: InMemoryDb, to: InMemoryDb): Promise<void> {
  const targets = new Map(ports(to))
  for (const [table, source] of ports(from)) {
    const ids = await from.query<{ id: string }>(`SELECT id FROM ${table}`)
    for (const { id } of ids) {
      const row = await source.getRowForPush(id)
      await to.runMany([targets.get(table)!.applyRemoteRowStatement(row!)])
    }
  }
}

const at = (instant: string) => vi.setSystemTime(new Date(instant))

const edition = (changes: Partial<TreatmentEditionInput>): TreatmentEditionInput => ({
  name: 'Metacam',
  type: 'medication',
  frequency: TWO_WEEKS,
  times: ['20:00'],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
  reminderOffsetMinutes: null,
  reminderTime: null,
  nextDoseOn: null,
  ...changes,
})

describe('#867 : date d’écriture du réglage, deux téléphones, de la base à la fiche', () => {
  let dbA: InMemoryDb
  let dbB: InMemoryDb
  let a: Replay
  let b: Replay
  let id: string

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-03-26T07:00:00.000Z') })
    dbA = await createInMemoryDb()
    dbB = await createInMemoryDb()
    a = await createReplay(dbA)
    b = await createReplay(dbB)

    a.clock.day = '2026-03-26'
    ;({ id } = await a.plans.create({
      animalId: ANIMAL,
      name: 'Metacam',
      type: 'medication',
      firstDoseOn: '2026-03-26',
      frequency: { value: 3, unit: 'day' },
      times: ['20:00'],
      doseQuantity: null,
      doseUnit: null,
      endsOn: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    }))
    for (const day of ['2026-03-26', '2026-03-29', '2026-04-01']) {
      a.clock.day = day
      at(`${day}T20:00:00.000Z`)
      const periodId = (await storedTreatment(a.treatments, id)).periods[0]!.id
      await a.doses.apply(id, {
        kind: 'note',
        gesture: {
          kind: 'note',
          due: { settingId: periodId, dueOn: day, dueTime: '20:00' },
          status: 'given',
          givenOn: day,
          shiftsFollowing: false,
        },
      })
    }
    a.clock.day = '2026-04-03'
    at('2026-04-03T08:00:00.000Z')
    await a.plans.update(id, edition({ nextDoseOn: '2026-04-03' }))
    await synced(dbA, dbB)
    a.clock.day = '2026-04-07'
    b.clock.day = '2026-04-07'
  })

  afterEach(() => {
    dbA.close()
    dbB.close()
    vi.useRealTimers()
  })

  async function reportOnA(instant: string): Promise<void> {
    at(instant)
    const period = (await storedTreatment(a.treatments, id)).periods.at(-1)!
    await a.doses.apply(id, {
      kind: 'move',
      due: { settingId: period.id, dueOn: '2026-04-03', dueTime: '20:00' },
      to: '2026-04-10',
      shiftsFollowing: false,
    })
  }

  async function rewriteOnB(instant: string): Promise<void> {
    at(instant)
    await b.plans.update(id, edition({ times: ['06:00'], pastDues: 'drop' }))
  }

  async function sheet(replay: Replay) {
    const reading = readTreatment(await storedTreatment(replay.treatments, id), replay.clock.day)
    const view = reading!.view
    return {
      next: view.upcoming({ limit: 2 }).map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`),
      report: view.history
        .filter(({ line }) => line.status === 'postponed')
        .map(({ line, effect }) => `${line.dueOn} → ${line.targetOn} ${effect.kind}`),
    }
  }

  async function bothSynced() {
    await synced(dbA, dbB)
    await synced(dbB, dbA)
    const [onA, onB] = [await sheet(a), await sheet(b)]
    expect(onA).toEqual(onB)
    return onA
  }

  it('la réécriture du réglage par B est datée ; le premier réglage, jamais réécrit, garde sa création', async () => {
    await rewriteOnB('2026-04-07T18:00:00.000Z')

    const periods = (await storedTreatment(b.treatments, id)).periods
    expect(
      periods.map(({ createdAt, settingsWrittenAt }) => [createdAt, settingsWrittenAt]),
    ).toEqual([
      [periods[0]!.createdAt, periods[0]!.createdAt],
      ['2026-04-03T08:00:00.000Z', '2026-04-07T18:00:00.000Z'],
    ])
  })

  it('la réponse de B, qui retire la dose du 3, date aussi la grille, sur les deux téléphones', async () => {
    await rewriteOnB('2026-04-07T18:00:00.000Z')
    await synced(dbB, dbA)

    for (const replay of [a, b]) {
      const current = (await storedTreatment(replay.treatments, id)).periods.at(-1)!
      expect([current.firstDueOn, current.settingsWrittenAt, current.gridWrittenAt]).toEqual([
        '2026-04-17',
        '2026-04-07T18:00:00.000Z',
        '2026-04-07T18:00:00.000Z',
      ])
    }
  })

  it('report de A plus récent que la réponse de B : il tient, le 10 à 20 h, puis le 17 à 6 h', async () => {
    await rewriteOnB('2026-04-07T09:00:00.000Z')
    await reportOnA('2026-04-07T18:00:00.000Z')

    await expect(bothSynced()).resolves.toEqual({
      next: ['2026-04-10 20:00', '2026-04-17 06:00'],
      report: ['2026-04-03 → 2026-04-10 moves'],
    })
  })

  it('réponse de B plus récente que le report de A : report sans effet, rien le 10, le 17 à 6 h', async () => {
    await reportOnA('2026-04-07T09:00:00.000Z')
    await rewriteOnB('2026-04-07T18:00:00.000Z')

    await expect(bothSynced()).resolves.toEqual({
      next: ['2026-04-17 06:00', '2026-05-01 06:00'],
      report: ['2026-04-03 → 2026-04-10 idle'],
    })
  })

  it('arrêt puis « Annuler » après le report : la date d’écriture ne bouge pas, le report tient', async () => {
    await rewriteOnB('2026-04-07T09:00:00.000Z')
    await reportOnA('2026-04-07T18:00:00.000Z')
    await synced(dbB, dbA)
    const before = (await storedTreatment(a.treatments, id)).periods.at(-1)!

    a.clock.day = '2026-04-08'
    at('2026-04-08T07:00:00.000Z')
    await a.stops.stop(id)
    at('2026-04-08T07:00:05.000Z')
    await a.stops.undo(id)

    const after = (await storedTreatment(a.treatments, id)).periods.at(-1)!
    expect(after.updatedAt).toBe('2026-04-08T07:00:05.000Z')
    expect(after.settingsWrittenAt).toBe(before.settingsWrittenAt)
    b.clock.day = '2026-04-08'
    await expect(bothSynced()).resolves.toEqual({
      next: ['2026-04-10 20:00', '2026-04-17 06:00'],
      report: ['2026-04-03 → 2026-04-10 moves'],
    })
  })
})
