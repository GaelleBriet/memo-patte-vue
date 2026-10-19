import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncRowValue } from '@/core/supabase/guarded-upsert'
import { clampedWrite } from './fake-sync-clamp'

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
  treatment_period: [
    { column: 'treatment_id', parent: 'treatment' },
    { column: 'animal_id', parent: 'animal' },
  ],
  treatment_dose: [
    { column: 'period_id', parent: 'treatment_period' },
    { column: 'treatment_id', parent: 'treatment' },
    { column: 'animal_id', parent: 'animal' },
  ],
  weight_entry: [{ column: 'animal_id', parent: 'animal' }],
}

const TIMESTAMP_COLUMNS = [
  'created_at',
  'updated_at',
  'settings_written_at',
  'deleted_at',
  'server_updated_at',
]
const SERVER_EPOCH = Date.UTC(2026, 8, 25, 12)

type Hook = () => Promise<void> | void

export interface FakeSyncServer {
  client: SupabaseClient
  /** Lignes d'une table telles que PostgREST les rend, `server_updated_at` compris. */
  rows(table: string): ServerRow[]
  /** Envois ouverts, avec l'en-tête de chaque écriture qui s'en est réclamée. */
  pushes(): Array<{
    user_id: SyncRowValue
    id: SyncRowValue
    sent_at: SyncRowValue
    received_at: string
    writes: string[]
  }>
  /** Joué juste avant de répondre au prochain pull de `table` : une écriture « pendant » le parcours. */
  beforeNextPull(table: string, hook: Hook): void
  /** Joué juste après la prochaine écriture de `table`, refusée ou non, avant la réponse au téléphone. */
  afterNextWrite(table: string, hook: Hook): void
  /** La connexion coupe au pull de `table` qui suit `pagesServed` pages servies. */
  cutPull(table: string, pagesServed?: number): void
}

/**
 * PostgREST réduit aux appels de la synchro : `select … eq gte order limit`, l'`update … match lt
 * select` et l'`upsert … select` de `guardedUpsert`, sa relecture `select … match maybeSingle`, et
 * l'ouverture d'un envoi. Les déclencheurs `server_updated_at` et d'écrêtage, sur l'horloge `now` du
 * serveur, et les clés étrangères y sont reproduits, et les horodatages rendus en `+00:00`, comme Postgres.
 */
export function createFakeSyncServer({
  now = () => Date.now(),
}: { now?: () => number } = {}): FakeSyncServer {
  const tables = new Map<string, ServerRow[]>()
  const pushes: ReturnType<FakeSyncServer['pushes']> = []
  const pullHooks = new Map<string, Hook>()
  const writeHooks = new Map<string, Hook>()
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

  function picked(row: ServerRow, columns: string): ServerRow {
    const names = columns.split(',').map((column) => column.trim())
    return asPostgrest(Object.fromEntries(names.map((key) => [key, row[key] ?? null])))
  }

  /** Jouée au tour suivant : les `select` et `setHeader` chaînés avant l'attente sont déjà posés. */
  function write(
    table: string,
    run: (
      clamp: (incoming: ServerRow, stored: ServerRow | null) => ServerRow | null,
    ) => ServerRow[] | Result['error'],
  ) {
    const headers: Record<string, string> = {}
    let columns = 'id'
    const result = Promise.resolve().then(async (): Promise<Result> => {
      const push = pushes.find(
        (candidate) => candidate.id === headers['x-memopatte-sync-push'] && candidate.id !== null,
      )
      const written = run((incoming, stored) =>
        clampedWrite(
          incoming,
          stored,
          push && push.user_id === incoming.user_id ? push : null,
          now(),
        ),
      )
      if (!Array.isArray(written)) return { data: null, error: written }
      if (written.length > 0) push?.writes.push(table)
      const hook = writeHooks.get(table)
      writeHooks.delete(table)
      await hook?.()
      return { data: written.map((row) => picked(row, columns)), error: null }
    })
    const request = Object.assign(result, {
      setHeader(name: string, value: string) {
        headers[name] = value
        return request
      },
      select(names: string) {
        columns = names
        return request
      },
    })
    return request
  }

  function select(table: string, columns: string) {
    const filters: Array<(row: ServerRow) => boolean> = []
    let orderColumn: string | null = null
    const builder = {
      eq(column: string, value: SyncRowValue) {
        filters.push((row) => row[column] === value)
        return builder
      },
      match(values: ServerRow) {
        for (const [column, value] of Object.entries(values)) builder.eq(column, value)
        return builder
      },
      async maybeSingle(): Promise<{ data: ServerRow | null; error: null }> {
        const found = tableRows(table).find((row) => filters.every((filter) => filter(row)))
        return { data: found ? picked(found, columns) : null, error: null }
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

        const rows = tableRows(table)
          .filter((row) => filters.every((filter) => filter(row)))
          .sort((a, b) =>
            orderColumn ? String(a[orderColumn]).localeCompare(String(b[orderColumn])) : 0,
          )
          .slice(0, count)
          .map((row) => picked(row, columns))
        return { data: rows, error: null }
      },
    }
    return builder
  }

  function update(table: string, patch: ServerRow) {
    let match: ServerRow = {}
    let olderThan: string | null = null
    const request = write(table, (clamp) => {
      const updated: ServerRow[] = []
      for (const row of tableRows(table)) {
        const matches =
          Object.entries(match).every(([column, value]) => row[column] === value) &&
          (olderThan === null || Date.parse(String(row.updated_at)) < Date.parse(olderThan))
        const next = matches ? clamp({ ...row, ...patch }, row) : null
        if (next === null) continue
        Object.assign(row, next)
        stamp(row)
        updated.push(row)
      }
      return updated
    })
    const builder = {
      match(values: ServerRow) {
        match = values
        return builder
      },
      lt(_column: 'updated_at', value: string) {
        olderThan = value
        return builder
      },
      select: (columns: string) => request.select(columns),
    }
    return builder
  }

  function upsert(table: string, row: ServerRow) {
    return write(table, (clamp) => {
      const rows = tableRows(table)
      if (rows.some((existing) => existing.user_id === row.user_id && existing.id === row.id)) {
        return []
      }
      const missing = missingParent(table, row)
      if (missing) return { message: `clé étrangère ${missing}`, code: '23503' }
      const inserted = { ...clamp(row, null)! }
      stamp(inserted)
      rows.push(inserted)
      return [inserted]
    })
  }

  async function openPush({ user_id, id, sent_at }: ServerRow): Promise<Result> {
    pushes.push({
      user_id: user_id ?? null,
      id: id ?? null,
      sent_at: sent_at ?? null,
      received_at: new Date(now()).toISOString(),
      writes: [],
    })
    return { data: null, error: null }
  }

  const client = {
    from(table: string) {
      return {
        select: (columns: string) => select(table, columns),
        update: (patch: ServerRow) => update(table, patch),
        upsert: (row: ServerRow) => upsert(table, row),
        insert: (row: ServerRow) => openPush(row),
      }
    },
  }

  return {
    client: client as unknown as SupabaseClient,
    rows: (table) => tableRows(table).map(asPostgrest),
    pushes: () => pushes.map((push) => ({ ...push, writes: [...push.writes] })),
    beforeNextPull(table, hook) {
      pullHooks.set(table, hook)
    },
    afterNextWrite(table, hook) {
      writeHooks.set(table, hook)
    },
    cutPull(table, pagesServed = 0) {
      pullCuts.set(table, pagesServed)
    },
  }
}
