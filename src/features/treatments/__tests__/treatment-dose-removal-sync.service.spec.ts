// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createInMemoryDb, type InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { readTreatment } from '@/shared/domain/treatment-reading'
import { ConcurrentWriteError } from '../repository/treatment-doses.repository'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { createReplay, storedHistory, type Replay } from './treatment-services-replay'

const ID = '22222222-2222-4222-8222-222222222222'
const ANIMAL = '11111111-1111-4111-8111-111111111111'
const OTHER = 'zzzz-autre'
const BASE = Date.UTC(2027, 0, 1)

async function copy(from: InMemoryDb, to: InMemoryDb) {
  for (const table of ['treatment', 'treatment_period', 'treatment_dose']) {
    const rows = await from.query<Record<string, unknown>>(`SELECT * FROM ${table}`)
    for (const row of rows) {
      const columns = Object.keys(row)
      await to.run(
        `INSERT OR REPLACE INTO ${table} (${columns.join(', ')})
         VALUES (${columns.map(() => '?').join(', ')})`,
        columns.map((column) => row[column] as never),
      )
    }
  }
}

async function syncDoses(from: InMemoryDb, to: InMemoryDb) {
  const repository = createTreatmentDosesRepository(to)
  for (const row of await from.query<Record<string, unknown>>('SELECT * FROM treatment_dose')) {
    const statement = repository.applyRemoteRowStatement(row as never)
    await to.run(statement.sql, statement.params as never)
  }
}

const noteOn10 = (status: 'given' | 'missed') =>
  ({
    kind: 'note',
    gesture: {
      kind: 'note',
      due: { settingId: ID, dueOn: '2026-10-10', dueTime: null },
      status,
      givenOn: '2026-10-10',
      shiftsFollowing: false,
    },
  }) as const

describe('#842 : « Supprimer » une ligne grisée ne réécrit rien ; un geste de l’autre téléphone tient après la synchro', () => {
  let dbA: InMemoryDb
  let dbB: InMemoryDb
  let phoneA: Replay
  let phoneB: Replay
  const at = (seconds: number) => vi.setSystemTime(BASE + seconds * 1000)

  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: BASE })
    dbA = await createInMemoryDb()
    dbB = await createInMemoryDb()
    phoneA = await createReplay(dbA)
    phoneB = await createReplay(dbB)
  })

  afterEach(() => {
    dbA.close()
    dbB.close()
    vi.useRealTimers()
  })

  async function sheet(phone: Replay): Promise<string[]> {
    const reading = readTreatment(await storedHistory(phone.treatments, ID), phone.clock.day)!
    return reading.view.history.map(
      ({ line, effect }) => `${line.status} ${line.givenOn ?? ''} ${effect.kind}`,
    )
  }

  // Milo, Milbemax chaque semaine depuis le 3 oct. ; dose du 10 notée sur les deux téléphones, la
  // ligne du téléphone A en vigueur ; renvoie son identifiant.
  async function miloNotedOnBothPhones(
    onA: 'given' | 'missed',
    other: 'given' | 'missed',
  ): Promise<string> {
    phoneA.clock.day = '2026-10-03'
    at(1)
    await phoneA.treatments.create({
      id: ID,
      animalId: ANIMAL,
      name: 'Milbemax',
      type: 'deworming',
      settings: {
        startsOn: '2026-10-03',
        firstDueOn: '2026-10-03',
        endsOn: null,
        frequency: { value: 1, unit: 'week' },
        times: [],
        doseQuantity: null,
        doseUnit: null,
        reminderOffsetMinutes: null,
        reminderTime: null,
      },
    })
    phoneA.clock.day = '2026-10-10'
    at(20)
    await phoneA.doses.apply(ID, noteOn10(onA))
    await dbA.run(
      `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
         given_on, status, target_on, created_at, updated_at, created_by_device, updated_by_device)
       VALUES (?, ?, ?, ?, '2026-10-10', NULL, ?, ?, NULL,
         '2026-12-31T00:00:00.000Z', '2026-12-31T00:00:00.000Z', 'autre', 'autre')`,
      [OTHER, ID, ID, ANIMAL, other === 'given' ? '2026-10-10' : null, other],
    )
    await copy(dbA, dbB)
    phoneA.clock.day = '2026-10-12'
    phoneB.clock.day = '2026-10-12'
    return (await storedHistory(phoneA.treatments, ID)).doses.find(({ id }) => id !== OTHER)!.id
  }

  async function syncBothWays() {
    await syncDoses(dbA, dbB)
    await syncDoses(dbB, dbA)
  }

  it('B supprime la prise du 10, puis A supprime la ligne grisée : la dose du 10 reste à donner', async () => {
    const shown = await miloNotedOnBothPhones('given', 'missed')
    at(100)
    await phoneB.doses.apply(ID, { kind: 'remove', lineId: shown })
    at(105)
    await phoneA.doses.apply(ID, { kind: 'remove', lineId: OTHER })
    await syncBothWays()

    expect(await sheet(phoneA)).toEqual([])
    expect(await sheet(phoneB)).toEqual([])
  })

  it('B « Marquer comme donnée » sur l’oubli en vigueur, puis A supprime la prise grisée : « Donnée » en vigueur', async () => {
    await miloNotedOnBothPhones('missed', 'given')
    at(100)
    await phoneB.doses.apply(ID, noteOn10('given'))
    at(105)
    await phoneA.doses.apply(ID, { kind: 'remove', lineId: OTHER })
    await syncBothWays()

    expect(await sheet(phoneA)).toEqual(['given 2026-10-10 covers'])
  })

  it('B corrige la prise du 10 au 9, puis A supprime la ligne grisée : la correction de B tient', async () => {
    const shown = await miloNotedOnBothPhones('given', 'missed')
    at(100)
    await phoneB.doses.apply(ID, {
      kind: 'redate',
      lineId: shown,
      givenOn: '2026-10-09',
      shiftsFollowing: false,
    })
    at(105)
    await phoneA.doses.apply(ID, { kind: 'remove', lineId: OTHER })
    await syncBothWays()

    expect(await sheet(phoneA)).toEqual(['given 2026-10-09 covers'])
  })

  it('A supprime la ligne grisée, B corrige la prise au 9 pendant le toast : « Annuler » est refusé, rien n’est écrasé', async () => {
    const shown = await miloNotedOnBothPhones('given', 'missed')
    at(100)
    const removal = await phoneA.doses.apply(ID, { kind: 'remove', lineId: OTHER })
    at(102)
    await phoneB.doses.apply(ID, {
      kind: 'redate',
      lineId: shown,
      givenOn: '2026-10-09',
      shiftsFollowing: false,
    })
    await syncDoses(dbB, dbA)
    at(104)

    await expect(phoneA.doses.undoBatch(ID, removal.undo)).rejects.toThrow(ConcurrentWriteError)
    expect(await sheet(phoneA)).toEqual(['given 2026-10-09 covers'])
  })
})
