// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { ANIMAL_PHOTO_ENTITY } from '@/core/db/schema-statements'
import { createSyncCycle, type SyncCycleOutbox } from '../service/sync-cycle'
import {
  syncField,
  type SyncPullPage,
  type SyncPush,
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

function createFakeOutbox(
  initial: FakeOutboxEntry[] = [],
  cursors: Record<string, string> = {},
  enabled = true,
): SyncCycleOutbox & {
  entries: () => FakeOutboxEntry[]
  cursor: (entity: string) => string | null
  lastSyncedAt: () => string | null
} {
  let entries = [...initial]
  const lastPulledAt = new Map(Object.entries(cursors))
  let lastSyncedAt: string | null = null
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
    async getLastPulledAt(entity) {
      return lastPulledAt.get(entity) ?? null
    },
    async setLastPulledAt(entity, value) {
      lastPulledAt.set(entity, value)
    },
    async isEnabled() {
      return enabled
    },
    async setLastSyncedAt(value) {
      lastSyncedAt = value
    },
    async recordFailedPush(target) {
      entries = entries.map((entry) =>
        entry.entity === target.entity && entry.entityId === target.entityId
          ? { ...entry, attempts: entry.attempts + 1 }
          : entry,
      )
    },
    entries: () => entries,
    cursor: (entity) => lastPulledAt.get(entity) ?? null,
    lastSyncedAt: () => lastSyncedAt,
  }
}

function createFakePushes() {
  const opened: SyncPush[] = []
  return {
    opened,
    async open(_userId: string, sentAt: string): Promise<SyncPush> {
      const push = { id: `envoi-${opened.length + 1}`, sentAt }
      opened.push(push)
      return push
    },
  }
}

function fakeTable(
  entity: string,
  pages: SyncPullPage[] = [],
): SyncableTable & {
  pushed: Array<{ userId: string; row: SyncRow; push?: SyncPush }>
  pullCalls: Array<{ since: string; limit: number; afterId?: string }>
  localRows: Map<string, SyncRow>
  /** Ligne que le serveur rend pour un identifiant, au lieu de celle envoyée. */
  serverKeeps: Map<string, SyncRow>
} {
  const pushed: Array<{ userId: string; row: SyncRow; push?: SyncPush }> = []
  const pullCalls: Array<{ since: string; limit: number; afterId?: string }> = []
  const localRows = new Map<string, SyncRow>()
  const serverKeeps = new Map<string, SyncRow>()
  let pageIndex = 0

  return {
    entity,
    pushed,
    pullCalls,
    localRows,
    serverKeeps,
    async getRowForPush(id) {
      return localRows.get(id) ?? null
    },
    async pushRow(userId, row, push) {
      pushed.push({ userId, row, push })
      return serverKeeps.get(row.id) ?? row
    },
    replacePushedRowStatement(row, sentUpdatedAt): SqlStatement {
      return {
        sql: 'UPDATE sync_scratch SET value = ?, updated_at = ? WHERE id = ? AND updated_at = ?',
        params: [(row.value as string | null) ?? null, row.updated_at, row.id, sentUpdatedAt],
      }
    },
    async pullPage(_userId, since, limit, afterId) {
      pullCalls.push({ since, limit, afterId })
      const page = pages[pageIndex] ?? { rows: [], stamps: [], cursor: null }
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

function page(
  rows: SyncRow[],
  cursor: string | null,
  stamps = rows.map(() => cursor ?? ''),
): SyncPullPage {
  return { rows, stamps, cursor }
}

const T_ROW = '2026-01-01T00:00:00.000Z'

function row(id: string, updatedAt: string, value: string): SyncRow {
  return { id, updated_at: updatedAt, value }
}

describe('createSyncCycle', () => {
  let db: DbClient & { close(): void }
  let pushes: ReturnType<typeof createFakePushes>

  beforeEach(async () => {
    pushes = createFakePushes()
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
        pushes,
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
        pushes,
        tables: [animal],
        userId: () => null,
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toEqual([])
    })

    it("ne pousse ni ne tire tant que la synchronisation n'est pas activée", async () => {
      const animal = fakeTable('animal')
      animal.localRows.set(ANIMAL_ID, row(ANIMAL_ID, T_ROW, 'Milo'))
      const outbox = createFakeOutbox(
        [{ entity: 'animal', entityId: ANIMAL_ID, queuedAt: T_ROW, attempts: 0 }],
        {},
        false,
      )
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pushed).toEqual([])
      expect(animal.pullCalls).toEqual([])
      expect(pushes.opened).toEqual([])
      expect(outbox.lastSyncedAt()).toBeNull()
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
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pushed).toEqual([
        {
          userId: 'user-1',
          row: row(ANIMAL_ID, '2026-01-01T00:00:00.000Z', 'Milo'),
          push: pushes.opened[0],
        },
      ])
      expect(outbox.entries()).toEqual([])
    })

    it('ouvre un seul envoi par cycle, daté par le téléphone quand il commence', async () => {
      vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-22T08:06:00.000Z') })
      const animal = fakeTable('animal')
      const entries: FakeOutboxEntry[] = []
      for (let index = 0; index < 250; index += 1) {
        const id = `animal-${index}`
        animal.localRows.set(id, row(id, '2026-01-01T00:00:00.000Z', 'x'))
        entries.push({ entity: 'animal', entityId: id, queuedAt: T_ROW, attempts: 0 })
      }
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(entries),
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()
      vi.useRealTimers()

      expect(pushes.opened).toEqual([{ id: 'envoi-1', sentAt: '2026-10-22T08:06:00.000Z' }])
      expect(new Set(animal.pushed.map(({ push }) => push))).toEqual(new Set([pushes.opened[0]]))
    })

    it("n'ouvre aucun envoi quand la file est vide", async () => {
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        pushes,
        tables: [fakeTable('animal')],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(pushes.opened).toEqual([])
    })

    describe('ligne gardée par le serveur', () => {
      const SENT = row('a1', '2026-10-22T08:05:00.000Z', 'Milbemax')
      const KEPT = { ...row('a1', '2026-10-19T08:05:00+00:00', 'Milbemax') }

      async function pushOnce(animal: ReturnType<typeof fakeTable>) {
        await db.run(
          'INSERT INTO sync_scratch (id, entity, value, updated_at) VALUES (?, ?, ?, ?)',
          [SENT.id, 'animal', 'Milbemax', SENT.updated_at],
        )
        animal.localRows.set(SENT.id, SENT)
        const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const cycle = createSyncCycle({
          db,
          outbox: createFakeOutbox([
            { entity: 'animal', entityId: SENT.id, queuedAt: T_ROW, attempts: 0 },
          ]),
          pushes,
          tables: [animal],
          userId: () => 'user-1',
          isEligible: () => true,
          onRemindersOutdated,
        })
        await cycle.runCycle()
        return { onRemindersOutdated }
      }

      const local = () => db.query<SyncRow>('SELECT id, value, updated_at FROM sync_scratch')

      it('remplace la ligne locale par celle du serveur, date ramenée en ISO', async () => {
        const animal = fakeTable('animal')
        animal.serverKeeps.set(SENT.id, KEPT)

        const { onRemindersOutdated } = await pushOnce(animal)

        expect(await local()).toEqual([
          { id: 'a1', value: 'Milbemax', updated_at: '2026-10-19T08:05:00.000Z' },
        ])
        expect(onRemindersOutdated).toHaveBeenCalledOnce()
      })

      it('remplace même par une ligne plus ancienne : le serveur a gardé la sienne', async () => {
        const animal = fakeTable('animal')
        animal.serverKeeps.set(SENT.id, row('a1', '2026-10-19T09:30:00.000Z', 'Drontal'))

        await pushOnce(animal)

        expect(await local()).toEqual([
          { id: 'a1', value: 'Drontal', updated_at: '2026-10-19T09:30:00.000Z' },
        ])
      })

      it('ne touche à rien quand le serveur a gardé la ligne envoyée', async () => {
        const animal = fakeTable('animal')
        const run = vi.spyOn(db, 'runMany')

        const { onRemindersOutdated } = await pushOnce(animal)

        expect(run).not.toHaveBeenCalled()
        expect(onRemindersOutdated).not.toHaveBeenCalled()
      })

      it.each(['animal', 'treatment_period', 'treatment_dose'])(
        '%s : une ligne tirée plus récente que celle gardée à l’envoi la remplace pour la reprise',
        async (entity) => {
          const pulled = row('a1', '2026-10-19T08:06:00.000Z', 'Luna B')
          const table = fakeTable(entity, [page([pulled], '2026-10-19T08:07:00.000Z')])
          table.serverKeeps.set(SENT.id, KEPT)
          await db.run(
            'INSERT INTO sync_scratch (id, entity, value, updated_at) VALUES (?, ?, ?, ?)',
            [SENT.id, entity, 'Milbemax', SENT.updated_at],
          )
          table.localRows.set(SENT.id, SENT)

          await createSyncCycle({
            db,
            outbox: createFakeOutbox([{ entity, entityId: SENT.id, queuedAt: T_ROW, attempts: 0 }]),
            pushes,
            tables: [table],
            userId: () => 'user-1',
            isEligible: () => true,
          }).runCycle()

          expect(await local()).toEqual([
            { id: 'a1', value: 'Luna B', updated_at: '2026-10-19T08:06:00.000Z' },
          ])
        },
      )

      it('à partir de 200 entrées toutes gardées autrement, chaque ligne part une seule fois', async () => {
        const animal = fakeTable('animal')
        const entries: FakeOutboxEntry[] = []
        for (let index = 0; index < 201; index += 1) {
          const id = `animal-${index}`
          animal.localRows.set(id, row(id, '2026-10-22T08:00:00.000Z', 'x'))
          animal.serverKeeps.set(id, row(id, '2026-10-19T08:00:00.000Z', 'x'))
          entries.push({ entity: 'animal', entityId: id, queuedAt: T_ROW, attempts: 0 })
        }

        await createSyncCycle({
          db,
          outbox: createFakeOutbox(entries),
          pushes,
          tables: [animal],
          userId: () => 'user-1',
          isEligible: () => true,
        }).runCycle()

        expect(animal.pushed).toHaveLength(201)
      })

      it('une reprise impossible ne fait pas échouer le cycle : l’entrée reste en file', async () => {
        const animal = fakeTable('animal')
        animal.serverKeeps.set(SENT.id, KEPT)
        animal.localRows.set(SENT.id, SENT)
        animal.replacePushedRowStatement = () => ({ sql: 'UPDATE table_absente SET x = 1' })
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const outbox = createFakeOutbox([
          { entity: 'animal', entityId: SENT.id, queuedAt: T_ROW, attempts: 0 },
        ])

        await expect(
          createSyncCycle({
            db,
            outbox,
            pushes,
            tables: [animal],
            userId: () => 'user-1',
            isEligible: () => true,
          }).runCycle(),
        ).resolves.toBeUndefined()

        expect(outbox.entries()).toHaveLength(1)
        expect(warn).toHaveBeenCalledOnce()
        warn.mockRestore()
      })

      it('garde une écriture locale faite entre l’envoi et la relecture', async () => {
        const animal = fakeTable('animal')
        const pushRow = animal.pushRow.bind(animal)
        animal.serverKeeps.set(SENT.id, KEPT)
        animal.pushRow = async (userId, sent, push) => {
          const kept = await pushRow(userId, sent, push)
          await db.run('UPDATE sync_scratch SET value = ?, updated_at = ? WHERE id = ?', [
            'Milpro',
            '2026-10-22T08:07:00.000Z',
            SENT.id,
          ])
          return kept
        }

        await pushOnce(animal)

        expect(await local()).toEqual([
          { id: 'a1', value: 'Milpro', updated_at: '2026-10-22T08:07:00.000Z' },
        ])
      })
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
        pushes,
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
        pushes,
        tables: [],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).resolves.toBeUndefined()
      expect(outbox.entries()).toEqual([])
    })

    it('ne pousse pas une photo comme une ligne : son entrée reste en file', async () => {
      const photo = {
        entity: ANIMAL_PHOTO_ENTITY,
        entityId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg',
        queuedAt: '2026-01-01T00:00:00.000Z',
        attempts: 0,
      }
      const outbox = createFakeOutbox([photo])
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [fakeTable('animal')],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).resolves.toBeUndefined()
      expect(outbox.entries()).toEqual([photo])
      expect(pushes.opened).toEqual([])
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
        pushes,
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
      animal.pushRow = async (userId, r, push) => {
        order.push('animal')
        return originalAnimalPush(userId, r, push)
      }
      vaccination.pushRow = async (userId, r, push) => {
        order.push('vaccination')
        return originalVaccinationPush(userId, r, push)
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
        pushes,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(order).toEqual(['vaccination', 'animal'])
    })
  })

  describe('push qui échoue', () => {
    const CHECK_REFUSAL = {
      code: '23514',
      message: 'new row violates check constraint "animal_name_check"',
    }

    function entry(entity: string, entityId: string, queuedAt = T_ROW): FakeOutboxEntry {
      return { entity, entityId, queuedAt, attempts: 0 }
    }

    function refusingAnimal(refusal: () => unknown) {
      const animal = fakeTable('animal', [page([row('a9', T_ROW, 'Oscar')], T_ROW)])
      animal.localRows.set('a1', row('a1', T_ROW, 'Milo'))
      animal.localRows.set('a2', row('a2', T_ROW, 'Luna'))
      const pushRow = animal.pushRow.bind(animal)
      animal.pushRow = async (userId, sent, push) => {
        if (sent.id === 'a1') throw refusal()
        return pushRow(userId, sent, push)
      }
      return animal
    }

    function cycleWith(outbox: ReturnType<typeof createFakeOutbox>, tables: SyncableTable[]) {
      return createSyncCycle({
        db,
        outbox,
        pushes,
        tables,
        userId: () => 'user-1',
        isEligible: () => true,
      })
    }

    it("compte l'essai raté, garde la ligne en file et pousse les suivantes", async () => {
      const animal = refusingAnimal(() => new Error('réseau'))
      const outbox = createFakeOutbox([entry('animal', 'a1'), entry('animal', 'a2')])

      await expect(cycleWith(outbox, [animal]).runCycle()).rejects.toThrow('réseau')

      expect(outbox.entries()).toEqual([{ ...entry('animal', 'a1'), attempts: 1 }])
      expect(animal.pushed.map(({ row: sent }) => sent.id)).toEqual(['a2'])
    })

    it('tire quand même, puis lève pour le backoff sans dater la synchronisation', async () => {
      const animal = refusingAnimal(() => new Error('réseau'))
      const outbox = createFakeOutbox([entry('animal', 'a1')])

      await expect(cycleWith(outbox, [animal]).runCycle()).rejects.toThrow('réseau')

      expect(animal.pullCalls).toHaveLength(1)
      expect(outbox.cursor('animal')).toBe(T_ROW)
      expect(outbox.lastSyncedAt()).toBeNull()
    })

    it("tire quand même quand l'envoi ne s'ouvre pas, sans compter d'essai", async () => {
      const animal = fakeTable('animal', [page([row('a9', T_ROW, 'Oscar')], T_ROW)])
      animal.localRows.set('a1', row('a1', T_ROW, 'Milo'))
      const outbox = createFakeOutbox([entry('animal', 'a1')])
      pushes.open = vi.fn<typeof pushes.open>().mockRejectedValue(new Error('réseau'))

      await expect(cycleWith(outbox, [animal]).runCycle()).rejects.toThrow('réseau')

      expect(outbox.entries()).toEqual([entry('animal', 'a1')])
      expect(outbox.cursor('animal')).toBe(T_ROW)
    })

    it('sort de la file une ligne refusée trois fois par le même CHECK, sans faire échouer le cycle', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const animal = refusingAnimal(() => CHECK_REFUSAL)
      const outbox = createFakeOutbox([entry('animal', 'a1')])
      const cycle = cycleWith(outbox, [animal])

      await expect(cycle.runCycle()).rejects.toBe(CHECK_REFUSAL)
      await expect(cycle.runCycle()).rejects.toBe(CHECK_REFUSAL)
      expect(outbox.entries()).toEqual([{ ...entry('animal', 'a1'), attempts: 2 }])

      await expect(cycle.runCycle()).resolves.toBeUndefined()

      expect(outbox.entries()).toEqual([])
      expect(outbox.lastSyncedAt()).not.toBeNull()
      expect(warn).toHaveBeenCalledOnce()
      warn.mockRestore()
    })

    it('sort aussi une ligne refusée trois fois pour une donnée invalide (classe 22)', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const refusal = { code: '22008', message: 'date/time field value out of range: "2026-02-30"' }
      const outbox = createFakeOutbox([entry('animal', 'a1')])
      const cycle = cycleWith(outbox, [refusingAnimal(() => refusal)])

      await expect(cycle.runCycle()).rejects.toBe(refusal)
      await expect(cycle.runCycle()).rejects.toBe(refusal)
      await cycle.runCycle()

      expect(outbox.entries()).toEqual([])
      warn.mockRestore()
    })

    it('réessaie sans fin une panne passagère ou un refus de droit', async () => {
      const failures = [new Error('réseau'), { code: '42501', message: 'permission denied' }]
      for (const failure of failures) {
        const outbox = createFakeOutbox([entry('animal', 'a1')])
        const cycle = cycleWith(outbox, [refusingAnimal(() => failure)])

        for (let attempt = 0; attempt < 4; attempt += 1) {
          await expect(cycle.runCycle()).rejects.toBe(failure)
        }

        expect(outbox.entries()).toEqual([{ ...entry('animal', 'a1'), attempts: 4 }])
      }
    })

    it('garde une ligne dont les trois refus ne sont pas identiques', async () => {
      const refusals = [
        CHECK_REFUSAL,
        { code: '22008', message: 'date/time field value out of range' },
        CHECK_REFUSAL,
      ]
      let next = 0
      const outbox = createFakeOutbox([entry('animal', 'a1')])
      const cycle = cycleWith(outbox, [refusingAnimal(() => refusals[next++])])

      for (const refusal of refusals) await expect(cycle.runCycle()).rejects.toBe(refusal)

      expect(outbox.entries()).toHaveLength(1)
    })

    it('recompte depuis zéro quand la ligne refusée est modifiée entre deux refus', async () => {
      const animal = refusingAnimal(() => CHECK_REFUSAL)
      const outbox = createFakeOutbox([entry('animal', 'a1')])
      const cycle = cycleWith(outbox, [animal])

      await expect(cycle.runCycle()).rejects.toBe(CHECK_REFUSAL)
      await expect(cycle.runCycle()).rejects.toBe(CHECK_REFUSAL)
      const [pending] = outbox.entries()
      await outbox.removeIfUnchanged(pending!)
      const T_LATER = '2026-01-02T00:00:00.000Z'
      outbox.entries().push({ ...entry('animal', 'a1', T_LATER), attempts: 2 })
      await expect(cycle.runCycle()).rejects.toBe(CHECK_REFUSAL)

      expect(outbox.entries()).toEqual([{ ...entry('animal', 'a1', T_LATER), attempts: 3 }])
    })
  })

  describe('pull', () => {
    it('applique une page distante et avance le curseur de sa table', async () => {
      const animal = fakeTable('animal', [
        page([row('a1', '2026-01-01T00:00:00.000Z', 'Milo')], '2026-01-01T00:00:00.000Z'),
      ])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(outbox.cursor('animal')).toBe('2026-01-01T00:00:00.000Z')
      const [scratch] = await db.query<{ value: string }>(
        'SELECT value FROM sync_scratch WHERE id = ?',
        ['a1'],
      )
      expect(scratch?.value).toBe('Milo')
    })

    it('fait partir chaque table de son propre curseur', async () => {
      const animal = fakeTable('animal', [
        page([row('a1', '2026-01-05T00:00:00.000Z', 'x')], '2026-01-05T00:00:00.000Z'),
      ])
      const vaccination = fakeTable('vaccination', [
        page([row('v1', '2026-01-02T00:00:00.000Z', 'y')], '2026-01-02T00:00:00.000Z'),
      ])
      const outbox = createFakeOutbox([], { animal: '2026-01-04T00:00:00.000Z' })
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls[0]?.since).toBe('2026-01-03T23:59:55.000Z')
      expect(vaccination.pullCalls[0]?.since).toBe('1970-01-01T00:00:00.000Z')
      expect(outbox.cursor('animal')).toBe('2026-01-05T00:00:00.000Z')
      expect(outbox.cursor('vaccination')).toBe('2026-01-02T00:00:00.000Z')
    })

    it('ne saute jamais une ligne écrite pendant le parcours d’une table suivante', async () => {
      const serverAnimals = [{ stamp: '2026-01-01T00:00:00.000Z', row: row('a1', T_ROW, 'Milo') }]
      const animal = fakeTable('animal')
      animal.pullPage = async (_userId, since, limit) => {
        animal.pullCalls.push({ since, limit })
        const rows = serverAnimals.filter(({ stamp }) => stamp >= since)
        return page(
          rows.map((entry) => entry.row),
          rows.at(-1)?.stamp ?? null,
        )
      }
      const weight = fakeTable('weight_entry')
      weight.pullPage = async () => {
        if (serverAnimals.length === 1) {
          serverAnimals.push({ stamp: '2026-01-02T00:00:00.000Z', row: row('a2', T_ROW, 'Luna') })
        }
        return page([row('w1', T_ROW, '4.2')], '2026-01-03T00:00:00.000Z')
      }
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        pushes,
        tables: [animal, weight],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()
      await cycle.runCycle()

      expect(animal.pullCalls[1]?.since).toBe('2025-12-31T23:59:55.000Z')
      const names = await db.query<{ value: string }>(
        "SELECT value FROM sync_scratch WHERE entity = 'animal' ORDER BY id",
      )
      expect(names).toEqual([{ value: 'Milo' }, { value: 'Luna' }])
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
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toHaveLength(2)
      expect(animal.pullCalls[0]).toMatchObject({ since: '1970-01-01T00:00:00.000Z' })
      expect(animal.pullCalls[0]?.afterId).toBeUndefined()
      expect(animal.pullCalls[1]).toMatchObject({
        since: '2026-01-01T00:00:00.000Z',
        afterId: 'a499',
      })
      expect(outbox.cursor('animal')).toBe('2026-01-02T00:00:00.000Z')
    })

    it('poursuit au-delà d’une page pleine de lignes au même instant, sans en sauter', async () => {
      const shared = '2026-01-01T00:00:00.000Z'
      const rows = Array.from({ length: 600 }, (_, index) =>
        row(`a${String(index).padStart(3, '0')}`, shared, 'x'),
      )
      const animal = fakeTable('animal', [
        page(rows.slice(0, 500), shared),
        page(rows.slice(500), shared),
      ])
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls[1]).toMatchObject({ since: shared, afterId: 'a499' })
      await expect(db.query('SELECT id FROM sync_scratch')).resolves.toHaveLength(600)
      expect(outbox.cursor('animal')).toBe(shared)
    })

    it('tire une ligne validée en retard, datée juste avant le curseur, sans reculer le curseur', async () => {
      const seen = '2026-01-04T00:00:00.000Z'
      const late = '2026-01-03T23:59:58.000Z'
      const vaccination = fakeTable('vaccination', [
        page([row('v-late', T_ROW, 'Rage'), row('v-seen', T_ROW, 'Leptospirose')], seen, [
          late,
          seen,
        ]),
      ])
      vaccination.localRows.set('v-seen', row('v-seen', T_ROW, 'Leptospirose'))
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const outbox = createFakeOutbox([], { vaccination: seen })
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await cycle.runCycle()

      expect(vaccination.pullCalls[0]?.since).toBe('2026-01-03T23:59:55.000Z')
      await expect(db.query("SELECT value FROM sync_scratch WHERE id = 'v-late'")).resolves.toEqual(
        [{ value: 'Rage' }],
      )
      expect(outbox.cursor('vaccination')).toBe(seen)
      expect(onRemindersOutdated).toHaveBeenCalledOnce()
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
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(animal.pullCalls).toHaveLength(2)
      expect(warn).toHaveBeenCalled()
      warn.mockRestore()
    })

    it("garde les tables déjà tirées, et n'avance pas le curseur de la table qui échoue", async () => {
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
        pushes,
        tables: [animal, vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).rejects.toThrow('réseau')

      expect(outbox.cursor('animal')).toBe('2026-01-01T00:00:00.000Z')
      expect(outbox.cursor('vaccination')).toBeNull()
      const [scratch] = await db.query<{ value: string }>(
        'SELECT value FROM sync_scratch WHERE id = ?',
        ['a1'],
      )
      expect(scratch?.value).toBe('Milo')
    })

    it("n'avance pas le curseur quand une ligne de la page échoue, et n'en garde aucune", async () => {
      const animal = fakeTable('animal', [
        page(
          [row('a1', T_ROW, 'Milo'), row('a2', T_ROW, 'Luna'), row('a3', T_ROW, 'Oscar')],
          '2026-01-03T00:00:00.000Z',
        ),
      ])
      const applyRemoteRowStatement = animal.applyRemoteRowStatement.bind(animal)
      animal.applyRemoteRowStatement = (remote) =>
        remote.id === 'a2'
          ? { sql: 'INSERT INTO table_absente (id) VALUES (?)', params: [remote.id] }
          : applyRemoteRowStatement(remote)
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).rejects.toThrow(/table_absente/)

      expect(outbox.cursor('animal')).toBeNull()
      await expect(db.query('SELECT id FROM sync_scratch')).resolves.toEqual([])
    })

    it('reconstruit les rappels même si une table suivante échoue', async () => {
      const vaccination = fakeTable('vaccination', [
        page([row('v1', T_ROW, 'x')], '2026-01-01T00:00:00.000Z'),
      ])
      const weight = fakeTable('weight_entry')
      weight.pullPage = vi.fn<SyncableTable['pullPage']>().mockRejectedValue(new Error('réseau'))
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        pushes,
        tables: [vaccination, weight],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await expect(cycle.runCycle()).rejects.toThrow('réseau')

      expect(onRemindersOutdated).toHaveBeenCalledOnce()
    })

    it('reconstruit les rappels quand la deuxième page d’une table échoue après la première', async () => {
      const firstPage = Array.from({ length: 500 }, (_, index) => row(`a${index}`, T_ROW, 'x'))
      const animal = fakeTable('animal')
      animal.pullPage = vi
        .fn<SyncableTable['pullPage']>()
        .mockResolvedValueOnce(page(firstPage, '2026-01-01T00:00:00.000Z'))
        .mockRejectedValueOnce(new Error('réseau'))
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await expect(cycle.runCycle()).rejects.toThrow('réseau')

      expect(outbox.cursor('animal')).toBe('2026-01-01T00:00:00.000Z')
      expect(onRemindersOutdated).toHaveBeenCalledOnce()
    })

    it('reconstruit les rappels seulement si le pull a touché animal, vaccination ou treatment', async () => {
      const weight = fakeTable('weight_entry', [
        page([row('w1', '2026-01-01T00:00:00.000Z', '4.2')], '2026-01-01T00:00:00.000Z'),
      ])
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox(),
        pushes,
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
        pushes,
        tables: [vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await cycle.runCycle()

      expect(onRemindersOutdated).toHaveBeenCalledOnce()
    })

    it.each(['vaccination_injection', 'treatment_dose', 'treatment_period', 'carnet_settings'])(
      'reconstruit les rappels quand le pull ne ramène qu’un « fait » ou un réglage (%s)',
      async (entity) => {
        const events = fakeTable(entity, [
          page([row('e1', '2026-01-01T00:00:00.000Z', 'x')], '2026-01-01T00:00:00.000Z'),
        ])
        const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
        const cycle = createSyncCycle({
          db,
          outbox: createFakeOutbox(),
          pushes,
          tables: [events],
          userId: () => 'user-1',
          isEligible: () => true,
          onRemindersOutdated,
        })

        await cycle.runCycle()

        expect(onRemindersOutdated).toHaveBeenCalledOnce()
      },
    )

    it('ne reconstruit pas les rappels quand le pull ne ramène que la ligne déjà vue au curseur', async () => {
      const seen = '2026-01-01T00:00:00.000Z'
      const vaccination = fakeTable('vaccination', [page([row('v1', seen, 'x')], seen)])
      vaccination.localRows.set('v1', row('v1', seen, 'x'))
      const onRemindersOutdated = vi.fn<() => Promise<void>>().mockResolvedValue(undefined)
      const cycle = createSyncCycle({
        db,
        outbox: createFakeOutbox([], { vaccination: seen }),
        pushes,
        tables: [vaccination],
        userId: () => 'user-1',
        isEligible: () => true,
        onRemindersOutdated,
      })

      await cycle.runCycle()

      expect(onRemindersOutdated).not.toHaveBeenCalled()
    })
  })

  describe('dernière synchronisation réussie', () => {
    afterEach(() => {
      vi.useRealTimers()
    })

    it('est datée une fois le push et le pull aboutis, même sans rien à échanger', async () => {
      vi.useFakeTimers({ now: new Date('2026-10-01T08:00:00.000Z'), toFake: ['Date'] })
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [fakeTable('animal')],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await cycle.runCycle()

      expect(outbox.lastSyncedAt()).toBe('2026-10-01T08:00:00.000Z')
    })

    it('n’est pas datée quand le pull échoue', async () => {
      const animal = fakeTable('animal')
      animal.pullPage = vi.fn<SyncableTable['pullPage']>().mockRejectedValue(new Error('réseau'))
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [animal],
        userId: () => 'user-1',
        isEligible: () => true,
      })

      await expect(cycle.runCycle()).rejects.toThrow('réseau')

      expect(outbox.lastSyncedAt()).toBeNull()
    })

    it('n’est pas datée quand le cycle ne s’est pas lancé', async () => {
      const outbox = createFakeOutbox()
      const cycle = createSyncCycle({
        db,
        outbox,
        pushes,
        tables: [fakeTable('animal')],
        userId: () => 'user-1',
        isEligible: () => false,
      })

      await cycle.runCycle()

      expect(outbox.lastSyncedAt()).toBeNull()
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
      animal.pushRow = async (userId, r, push) => {
        order.push('push')
        return originalPush(userId, r, push)
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
        pushes,
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
        pushRow: async () => null,
        replacePushedRowStatement: () => ({ sql: 'SELECT 1' }),
        pullPage: (() => {
          let called = false
          return async () => {
            if (called) return { rows: [], stamps: [], cursor: null }
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
          sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device, updated_by_device)
                VALUES (?, ?, 'cat', ?, ?, 'appareil-test', 'appareil-test')
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
        pushes,
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
