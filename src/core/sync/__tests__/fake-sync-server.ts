import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncRowValue } from '@/core/supabase/guarded-upsert'

type ServerRow = Record<string, SyncRowValue>
type Result = { data: ServerRow[] | null; error: { message: string; code?: string } | null }

interface ForeignKey {
  column: string
  parent: string
}

/** Clés étrangères des tables miroir (`supabase/migrations/`), toutes rattachées au même `user_id`. */
export const MIRROR_FOREIGN_KEYS: Record<string, ForeignKey[]> = {
  vaccination: [{ column: 'animal_id', parent: 'animal' }],
  vaccination_injection: [
    { column: 'vaccination_id', parent: 'vaccination' },
    { column: 'animal_id', parent: 'animal' },
  ],
  treatment: [{ column: 'animal_id', parent: 'animal' }],
  treatment_dose: [
    { column: 'treatment_id', parent: 'treatment' },
    { column: 'animal_id', parent: 'animal' },
  ],
  weight_entry: [{ column: 'animal_id', parent: 'animal' }],
}

const TIMESTAMP_COLUMNS = ['created_at', 'updated_at', 'deleted_at', 'server_updated_at']
const SERVER_EPOCH = Date.UTC(2026, 8, 25, 12)

export interface FakeSyncServer {
  client: SupabaseClient
  /** Lignes d'une table telles que PostgREST les rend, `server_updated_at` compris. */
  rows(table: string): ServerRow[]
  /** Joué juste avant de répondre au prochain pull de `table` : une écriture « pendant » le parcours. */
  beforeNextPull(table: string, hook: () => Promise<void> | void): void
  /** La connexion coupe au pull de `table` qui suit `pagesServed` pages servies. */
  cutPull(table: string, pagesServed?: number): void
}

/**
 * PostgREST réduit aux appels de la synchro : `select … eq gte order limit`, l'`update … match lt
 * select` et l'`upsert` de `guardedUpsert`. Le déclencheur `server_updated_at` et les clés
 * étrangères y sont reproduits, et les horodatages rendus en `+00:00`, comme Postgres.
 */
export function createFakeSyncServer(): FakeSyncServer {
  const tables = new Map<string, ServerRow[]>()
  const pullHooks = new Map<string, () => Promise<void> | void>()
  const pullCuts = new Map<string, number>()
  let clock = 0

  function tableRows(table: string): ServerRow[] {
    let rows = tables.get(table)
    if (!rows) {
      rows = []
      tables.set(table, rows)
    }
    return rows
  }

  function stamp(row: ServerRow): void {
    clock += 1
    row.server_updated_at = new Date(SERVER_EPOCH + clock).toISOString()
  }

  function asPostgrest(row: ServerRow): ServerRow {
    const copy = { ...row }
    for (const column of TIMESTAMP_COLUMNS) {
      const value = copy[column]
      if (typeof value === 'string') copy[column] = value.replace('Z', '+00:00')
    }
    return copy
  }

  function missingParent(table: string, row: ServerRow): string | null {
    for (const { column, parent } of MIRROR_FOREIGN_KEYS[table] ?? []) {
      const exists = tableRows(parent).some(
        (candidate) => candidate.user_id === row.user_id && candidate.id === row[column],
      )
      if (!exists) return `${table}.${column}`
    }
    return null
  }

  function select(table: string, columns: string) {
    const filters: Array<(row: ServerRow) => boolean> = []
    let orderColumn: string | null = null
    const builder = {
      eq(column: string, value: SyncRowValue) {
        filters.push((row) => row[column] === value)
        return builder
      },
      gte(column: string, value: string) {
        filters.push((row) => Date.parse(String(row[column])) >= Date.parse(value))
        return builder
      },
      order(column: string) {
        orderColumn = column
        return builder
      },
      async limit(count: number): Promise<Result> {
        const hook = pullHooks.get(table)
        pullHooks.delete(table)
        await hook?.()

        const pagesBeforeCut = pullCuts.get(table)
        if (pagesBeforeCut === 0) {
          pullCuts.delete(table)
          return { data: null, error: { message: 'réseau coupé' } }
        }
        if (pagesBeforeCut !== undefined) pullCuts.set(table, pagesBeforeCut - 1)

        const picked = columns.split(',').map((column) => column.trim())
        const rows = tableRows(table)
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((a, b) =>
            orderColumn ? String(a[orderColumn]).localeCompare(String(b[orderColumn])) : 0,
          )
          .slice(0, count)
          .map((row) =>
            asPostgrest(Object.fromEntries(picked.map((key) => [key, row[key] ?? null]))),
          )
        return { data: rows, error: null }
      },
    }
    return builder
  }

  function update(table: string, patch: ServerRow) {
    let match: ServerRow = {}
    let olderThan: string | null = null
    const builder = {
      match(values: ServerRow) {
        match = values
        return builder
      },
      lt(_column: 'updated_at', value: string) {
        olderThan = value
        return builder
      },
      async select(): Promise<Result> {
        const updated = tableRows(table).filter(
          (row) =>
            Object.entries(match).every(([column, value]) => row[column] === value) &&
            (olderThan === null || Date.parse(String(row.updated_at)) < Date.parse(olderThan)),
        )
        for (const row of updated) {
          Object.assign(row, patch)
          stamp(row)
        }
        return { data: updated.map((row) => ({ id: row.id ?? null })), error: null }
      },
    }
    return builder
  }

  async function upsert(table: string, row: ServerRow): Promise<Result> {
    const rows = tableRows(table)
    if (rows.some((existing) => existing.user_id === row.user_id && existing.id === row.id)) {
      return { data: null, error: null }
    }
    const missing = missingParent(table, row)
    if (missing) {
      return { data: null, error: { message: `clé étrangère ${missing}`, code: '23503' } }
    }
    const inserted = { ...row }
    stamp(inserted)
    rows.push(inserted)
    return { data: null, error: null }
  }

  const client = {
    from(table: string) {
      return {
        select: (columns: string) => select(table, columns),
        update: (patch: ServerRow) => update(table, patch),
        upsert: (row: ServerRow) => upsert(table, row),
      }
    },
  }

  return {
    client: client as unknown as SupabaseClient,
    rows: (table) => tableRows(table).map(asPostgrest),
    beforeNextPull(table, hook) {
      pullHooks.set(table, hook)
    },
    cutPull(table, pagesServed = 0) {
      pullCuts.set(table, pagesServed)
    },
  }
}
