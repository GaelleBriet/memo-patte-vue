// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { createSyncCycle, type SyncCycleOutbox } from '../service/sync-cycle'
import {
  syncField,
  type SyncPullPage,
  type SyncRow,
  type SyncableTable,
} from '../service/syncable-table'
import { ANIMAL_ID, createSyncTestDb, enableSync, insertAnimal, outboxRows } from './sync-test-db'

interface FakeOutboxEntry {
  entity: string
  entityId: string
  queuedAt: string
  attempts: number
}

function createFakeOutbox(initial: FakeOutboxEntry[] = []): SyncCycleOutbox & {
  entries: () => FakeOutboxEntry[]
  lastPulledAt: () => string | null
} {
  let entries = [...initial]
  let lastPulledAt: string | null = null
  return {
    async listPending() {
      return entries.map((entry) => ({ ...entry }))
    },
    async removeIfUnchanged(target) {
      entries = entries.filter(
        (entry) =>
          !(
            entry.entity === target.entity &&
            entry.entityId === target.entityId &&
            entry.queuedAt === target.queuedAt
          ),
      )
    },
    async getLastPulledAt() {
      return lastPulledAt
    },
    async setLastPulledAt(value) {
      lastPulledAt = value
    },
    async isEnabled() {
      return true
    },
    entries: () => entries,
    lastPulledAt: () => lastPulledAt,
  }
}

function fakeTable(
  entity: string,
  pages: SyncPullPage[] = [],
): SyncableTable & {
  pushed: Array<{ userId: string; row: SyncRow }>
  pullCalls: Array<{ since: string; limit: number }>
  localRows: Map<string, SyncRow>
} {
  const pushed: Array<{ userId: string; row: SyncRow }> = []
  const pullCalls: Array<{ since: string; limit: number }> = []
  const localRows = new Map<string, SyncRow>()
  let pageIndex = 0

  return {
    entity,
    pushed,
    pullCalls,
    localRows,
    async getRowForPush(id) {
      return localRows.get(id) ?? null
    },
    async pushRow(userId, row) {
      pushed.push({ userId, row })
    },
    async pullPage(_userId, since, limit) {
      pullCalls.push({ since, limit })
      const page = pages[pageIndex] ?? { rows: [], cursor: null }
      pageIndex += 1
      return page
    },
    applyRemoteRowStatement(row): SqlStatement {
      return {
        sql: `INSERT INTO sync_scratch (id, entity, value, updated_at)
              VALUES (?, ?, ?, ?)
              ON CONFLICT (id) DO UPDATE SET
                entity = excluded.entity, value = excluded.value, updated_at = excluded.updated_at
              WHERE excluded.updated_at > sync_scratch.updated_at`,
        params: [row.id, entity, (row.value as string | number | null) ?? null, row.updated_at],
      }
    },
  }
}

function page(rows: SyncRow[], cursor: string | null): SyncPullPage {
  return { rows, cursor }
}

function row(id: string, updatedAt: string, value: string): SyncRow {
  return { id, updated_at: updatedAt, value }
}

describe('createSyncCycle', () => {
  let db: DbClient & { close(): void }

  beforeEach(async () => {
    db = await createSyncTestDb()
    await db.execute(
      'CREATE TABLE IF NOT EXISTS sync_scratch (id TEXT PRIMARY KEY, entity TEXT, value TEXT, updated_at TEXT NOT NULL)',
    )
  })

  afterEach(() => {
    db.close()
  })

  describe('porte (gate)', () => {
    it("n'appelle rien si l'utilisateur n'a pas de compte Plus actif", async () => {
      const outbox = createFakeOutbox()
      const animal = fakeTable('animal')
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => false,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toEqual([])
      expect(animal.pushed).toEqual([])
    })

    it("n'appelle rien sans identifiant utilisateur, même si éligible", async () => {
      const outbox = createFakeOutbox()
      const animal = fakeTable('animal')
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => null,
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toEqual([])
    })
  })

  describe('push', () => {
    it('relit la ligne courante, la pousse, puis retire son entrée de la file', async () => {
      const animal = fakeTable('animal')
      animal.localRows.set(ANIMAL_ID, row(ANIMAL_ID, '2026-01-01T00:00:00.000Z', 'Milo'))
      const outbox = createFakeOutbox([
        {
          entity: 'animal',
          entityId: ANIMAL_ID,
          queuedAt: '2026-01-01T00:00:00.000Z',
          attempts: 0,
        },
      ])
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pushed).toEqual([
        { userId: 'user-1', row: row(ANIMAL_ID, '2026-01-01T00:00:00.000Z', 'Milo') },
      ])
      expect(outbox.entries()).toEqual([])
    })

    it("retire l'entrée sans pousser quand la ligne n'existe plus localement", async () => {
      const animal = fakeTable('animal')
      const outbox = createFakeOutbox([
        {
          entity: 'animal',
          entityId: 'disparu',
          queuedAt: '2026-01-01T00:00:00.000Z',
          attempts: 0,
        },
      ])
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pushed).toEqual([])
      expect(outbox.entries()).toEqual([])
    })

    it('ignore sans échouer une entité de la file qui ne correspond à aucune table connue', async () => {
      const outbox = createFakeOutbox([
        { entity: 'inconnue', entityId: 'x', queuedAt: '2026-01-01T00:00:00.000Z', attempts: 0 },
      ])
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).resolves.toBeUndefined()
      expect(outbox.entries()).toEqual([])
    })

    it('draine la file par lots de 200 entrées', async () => {
      const animal = fakeTable('animal')
      const entries: FakeOutboxEntry[] = []
      for (let index = 0; index < 250; index += 1) {
        const id = `animal-${index}`
        animal.localRows.set(id, row(id, '2026-01-01T00:00:00.000Z', 'x'))
        entries.push({
          entity: 'animal',
          entityId: id,
          queuedAt: '2026-01-01T00:00:00.000Z',
          attempts: 0,
        })
      }
      const outbox = createFakeOutbox(entries)
      const listPending = vi.spyOn(outbox, 'listPending')
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pushed).toHaveLength(250)
      expect(outbox.entries()).toEqual([])
      expect(listPending.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('pousse dans l’ordre où la file les rend (animal, vaccination, treatment, weight_entry)', async () => {
      const animal = fakeTable('animal')
      const vaccination = fakeTable('vaccination')
      animal.localRows.set('a1', row('a1', '2026-01-01T00:00:00.000Z', 'x'))
      vaccination.localRows.set('v1', row('v1', '2026-01-01T00:00:00.000Z', 'x'))
      const order: string[] = []
      const originalAnimalPush = animal.pushRow.bind(animal)
      const originalVaccinationPush = vaccination.pushRow.bind(vaccination)
      animal.pushRow = async (userId, r) => {
        order.push('animal')
        await originalAnimalPush(userId, r)
      }
      vaccination.pushRow = async (userId, r) => {
        order.push('vaccination')
        await originalVaccinationPush(userId, r)
      }
      const outbox = createFakeOutbox([
        {
          entity: 'vaccination',
          entityId: 'v1',
          queuedAt: '2026-01-01T00:00:00.000Z',
          attempts: 0,
        },
        { entity: 'animal', entityId: 'a1', queuedAt: '2026-01-01T00:00:00.000Z', attempts: 0 },
      ])
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(order).toEqual(['vaccination', 'animal'])
    })
  })

  describe('pull', () => {
    it('applique une page distante et avance le curseur au maximum observé', async () => {
      const animal = fakeTable('animal', [
        page([row('a1', '2026-01-01T00:00:00.000Z', 'Milo')], '2026-01-01T00:00:00.000Z'),
      ])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(outbox.lastPulledAt()).toBe('2026-01-01T00:00:00.000Z')
      const [scratch] = await db.query<{ value: string }>(
        'SELECT value FROM sync_scratch WHERE id = ?',
        ['a1'],
      )
      expect(scratch?.value).toBe('Milo')
    })

    it('réinitialise le curseur de page à `since` pour chaque table (pas de saut entre tables)', async () => {
      const animal = fakeTable('animal', [
        page([row('a1', '2026-01-05T00:00:00.000Z', 'x')], '2026-01-05T00:00:00.000Z'),
      ])
      const vaccination = fakeTable('vaccination', [
        page([row('v1', '2026-01-02T00:00:00.000Z', 'y')], '2026-01-02T00:00:00.000Z'),
      ])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls[0]?.since).toBe('1970-01-01T00:00:00.000Z')
      expect(vaccination.pullCalls[0]?.since).toBe('1970-01-01T00:00:00.000Z')
      expect(outbox.lastPulledAt()).toBe('2026-01-05T00:00:00.000Z')
    })

    it('poursuit la pagination au sein d’une même table avec le curseur de la page précédente', async () => {
      const firstPage = Array.from({ length: 500 }, (_, index) =>
        row(`a${index}`, '2026-01-01T00:00:00.000Z', 'x'),
      )
      const animal = fakeTable('animal', [
        page(firstPage, '2026-01-01T00:00:00.000Z'),
        page([row('a-last', '2026-01-02T00:00:00.000Z', 'y')], '2026-01-02T00:00:00.000Z'),
      ])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toHaveLength(2)
      expect(animal.pullCalls[0]?.since).toBe('1970-01-01T00:00:00.000Z')
      expect(animal.pullCalls[1]?.since).toBe('2026-01-01T00:00:00.000Z')
      expect(outbox.lastPulledAt()).toBe('2026-01-02T00:00:00.000Z')
    })

    it('arrête la pagination sans boucler si une page pleine ne progresse pas', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const stuckPage = page(
        Array.from({ length: 500 }, (_, index) =>
          row(`a${index}`, '2026-01-01T00:00:00.000Z', 'x'),
        ),
        '1970-01-01T00:00:00.000Z',
      )
      const animal = fakeTable('animal', [stuckPage, stuckPage, stuckPage])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toHaveLength(1)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it("n'avance pas le curseur, et laisse déjà appliquées les tables précédentes, quand une table échoue", async () => {
      const animal = fakeTable('animal', [
        page([row('a1', '2026-01-01T00:00:00.000Z', 'Milo')], '2026-01-01T00:00:00.000Z'),
      ])
      const vaccination = fakeTable('vaccination')
      vaccination.pullPage = vi
        .fn<SyncableTable['pullPage']>()
        .mockRejectedValue(new Error('réseau'))
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).rejects.toThrow('réseau')

      expect(outbox.lastPulledAt()).toBeNull()
      const [scratch] = await db.query<{ value: string }>(
        'SELECT value FROM sync_scratch WHERE id = ?',
        ['a1'],
      )
      expect(scratch?.value).toBe('Milo')
    })

    it('reconstruit les rappels seulement si le pull a touché animal, vaccination ou treatment', async () => {
      const weight = fakeTable('weight_entry', [
        page([row('w1', '2026-01-01T00:00:00.000Z', '4.2')], '2026-01-01T00:00:00.000Z'),
      ])
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        tables: [weight],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await cycle.runCycle()

      expect(onRemindersOutdated).not.toHaveBeenCalled()
    })

    it('reconstruit les rappels quand le pull touche les vaccins', async () => {
      const vaccination = fakeTable('vaccination', [
        page([row('v1', '2026-01-01T00:00:00.000Z', 'x')], '2026-01-01T00:00:00.000Z'),
      ])
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        tables: [vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await cycle.runCycle()

      expect(onRemindersOutdated).toHaveBeenCalledOnce()
    })
  })

  describe('ordre : push avant pull', () => {
    it('termine tout le push avant de commencer le pull', async () => {
      const order: string[] = []
      const animal = fakeTable('animal', [
        page([row('remote', '2026-01-01T00:00:00.000Z', 'x')], '2026-01-01T00:00:00.000Z'),
      ])
      animal.localRows.set('a1', row('a1', '2026-01-01T00:00:00.000Z', 'Milo'))
      const originalPush = animal.pushRow.bind(animal)
      const originalPull = animal.pullPage.bind(animal)
      animal.pushRow = async (userId, r) => {
        order.push('push')
        await originalPush(userId, r)
      }
      animal.pullPage = async (userId, since, limit) => {
        order.push('pull')
        return originalPull(userId, since, limit)
      }
      const outbox = createFakeOutbox([
        { entity: 'animal', entityId: 'a1', queuedAt: '2026-01-01T00:00:00.000Z', attempts: 0 },
      ])
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(order).toEqual(['push', 'pull'])
    })
  })

  describe('ping-pong (§3.4)', () => {
    it('une ligne appliquée par le pull ne revient pas dans la file', async () => {
      await insertAnimal(db, ANIMAL_ID, '2026-01-01T00:00:00.000Z', 'Miette')
      await enableSync(db)
      const animal: SyncableTable = {
        entity: 'animal',
        getRowForPush: async () => null,
        pushRow: async () => {},
        pullPage: (() => {
          let called = false
          return async () => {
            if (called) return { rows: [], cursor: null }
            called = true
            return page(
              [
                {
                  id: ANIMAL_ID,
                  name: 'Miette (autre appareil)',
                  updated_at: '2026-01-02T00:00:00.000Z',
                },
              ],
              '2026-01-02T00:00:00.000Z',
            )
          }
        })(),
        applyRemoteRowStatement: (remote) => ({
          sql: `INSERT INTO animal (id, name, species, created_at, updated_at)
                VALUES (?, ?, 'cat', ?, ?)
                ON CONFLICT (id) DO UPDATE SET
                  name = excluded.name, updated_at = excluded.updated_at
                WHERE excluded.updated_at > animal.updated_at`,
          params: [remote.id, syncField(remote, 'name'), remote.updated_at, remote.updated_at],
        }),
      }
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      const [applied] = await db.query<{ name: string }>('SELECT name FROM animal WHERE id = ?', [
        ANIMAL_ID,
      ])
      expect(applied?.name).toBe('Miette (autre appareil)')
      await expect(outboxRows(db)).resolves.toEqual([])
      const [state] = await db.query<{ enabled: number }>(
        'SELECT enabled FROM sync_state WHERE id = 1',
      )
      expect(state?.enabled).toBe(1)
    })
  })
})
