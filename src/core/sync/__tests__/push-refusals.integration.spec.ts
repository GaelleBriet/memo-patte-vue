// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'
import type { DbClient } from '@/core/db/db-client'
import type { InMemoryDb } from '@/core/db/__tests__/in-memory-db'
import { createSyncOutboxRepository } from '../repository/sync-outbox.repository'
import { createPushRefusals } from '../service/push-refusals'
import {
  ANIMAL_ID,
  createSyncTestDb,
  enableSync,
  insertAnimal,
  insertWeightEntry,
  touchAnimal,
} from './sync-test-db'

const SEPTEMBER_1 = new Date(2026, 8, 1, 8).toISOString()
const OCTOBER_21_8_20 = new Date(2026, 9, 21, 8, 20).toISOString()
const OCTOBER_21_8_21 = new Date(2026, 9, 21, 8, 21).toISOString()
const REFUSED_AT = new Date(2026, 9, 21, 8, 15)
const MISSING_PARENT = {
  code: '23503',
  message: 'insert or update on table "weight_entry" violates foreign key constraint',
}
const WEIGHING = { entity: 'weight_entry', entityId: 'w-9-9', queuedAt: OCTOBER_21_8_20 }

/** Joue `happen` juste avant le `at`-ième accès à la base, comme une écriture concurrente. */
function interleaved(db: InMemoryDb, at: number, happen: () => Promise<void>) {
  let calls = 0
  const before = async () => {
    if (calls++ === at) await happen()
  }
  const client: DbClient = {
    run: async (sql, params) => (await before(), db.run(sql, params)),
    runMany: async (statements) => (await before(), db.runMany(statements)),
    query: async (sql, params) => (await before(), db.query(sql, params)),
    execute: async (sql) => (await before(), db.execute(sql)),
  }
  return { client, calls: () => calls }
}

async function refusedMiloCarnet(): Promise<InMemoryDb> {
  const db = await createSyncTestDb()
  await enableSync(db)
  await insertAnimal(db, ANIMAL_ID, SEPTEMBER_1, 'Milo')
  await insertWeightEntry(db, 'w-9-9', ANIMAL_ID, OCTOBER_21_8_20)
  await createSyncOutboxRepository(db).markRefusedIfUnchanged(
    { entity: 'animal', entityId: ANIMAL_ID, queuedAt: SEPTEMBER_1 },
    REFUSED_AT.toISOString(),
  )
  return db
}

async function weighingRefused(db: InMemoryDb): Promise<boolean> {
  const [row] = await db.query<{ refused_at: string | null }>(
    "SELECT refused_at FROM sync_outbox WHERE entity = 'weight_entry' AND entity_id = 'w-9-9'",
  )
  return row?.refused_at !== null
}

function refusalsOver(client: DbClient) {
  return createPushRefusals({
    outbox: createSyncOutboxRepository(client),
    onGivenUp: () => {},
    now: () => REFUSED_AT,
  })
}

describe('pesée qui bute sur la clé étrangère de Milo, absent du serveur et refusé', () => {
  const opened: InMemoryDb[] = []

  async function open(): Promise<InMemoryDb> {
    const db = await refusedMiloCarnet()
    opened.push(db)
    return db
  }

  afterEach(() => {
    for (const db of opened.splice(0)) db.close()
  })

  it('sans modification de Milo, la pesée est marquée refusée avec lui', async () => {
    const db = await open()

    await expect(refusalsOver(db).recordFailure(WEIGHING, MISSING_PARENT)).resolves.toBe(false)

    await expect(weighingRefused(db)).resolves.toBe(true)
  })

  it('Milo modifié à 8 h 21 pendant l’enregistrement du refus, à n’importe quel moment : la pesée ne reste pas marquée', async () => {
    for (let at = 0; ; at += 1) {
      const db = await open()
      let touched = false
      const touchMilo = async () => {
        touched = true
        await touchAnimal(db, ANIMAL_ID, OCTOBER_21_8_21)
      }
      const { client, calls } = interleaved(db, at, touchMilo)

      await refusalsOver(client).recordFailure(WEIGHING, MISSING_PARENT)
      if (!touched) await touchMilo()

      expect({ at, refused: await weighingRefused(db) }).toEqual({ at, refused: false })
      if (at >= calls()) break
    }
  })
})
