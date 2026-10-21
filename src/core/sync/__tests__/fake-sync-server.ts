import type { SupabaseClient } from '@supabase/supabase-js'
import type { SyncRowValue } from '@/core/supabase/guarded-upsert'
import { clampedWrite, gridDatesOf, postgrestInstant, serverInstant } from './fake-sync-clamp'
import { MIRROR_FOREIGN_KEYS, TIMESTAMP_COLUMNS } from './fake-sync-schema'

type ServerRow = Record<string, SyncRowValue>
type Result = { data: ServerRow[] | null; error: { message: string; code?: string } | null }

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
  /** Les écritures suivantes partagent un même `server_updated_at`, comme dans une seule transaction. */
  holdClock(): () => void
}

/** Un `timestamptz` se compare par instant, quel que soit son format ; le reste par octets. */
function compared(column: string, a: SyncRowValue, b: SyncRowValue): number {
  if (a === b) return 0
  if (a === null || b === null) return a === null ? -1 : 1
  if (TIMESTAMP_COLUMNS.includes(column)) return Date.parse(String(a)) - Date.parse(String(b))
  return String(a) < String(b) ? -1 : 1
}

/**
 * PostgREST réduit aux appels de la synchro : `select … eq gt gte is order limit`, le compte `head`, l'`update … match lt
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
  let clockHeld = false

  function tableRows(table: string): ServerRow[] {
    let rows = tables.get(table)
    if (!rows) {
      rows = []
      tables.set(table, rows)
    }
    return rows
  }

  function stamp(row: ServerRow): void {
    if (!clockHeld) clock += 1
    row.server_updated_at = new Date(SERVER_EPOCH + clock).toISOString()
  }

  function asPostgrest(row: ServerRow): ServerRow {
    const copy = { ...row }
    for (const column of TIMESTAMP_COLUMNS) {
      const value = copy[column]
      if (typeof value === 'string') copy[column] = postgrestInstant(value)
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

  function heldGridDates(period: ServerRow): number[] {
    return tableRows('treatment_period')
      .filter(
        (other) =>
          other.user_id === period.user_id &&
          other.treatment_id === period.treatment_id &&
          other.id !== period.id,
      )
      .flatMap(gridDatesOf)
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
          table === 'treatment_period' ? heldGridDates(incoming) : null,
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

  /** Comptée au tour suivant, comme `write` : les filtres chaînés avant l'attente sont posés. */
  function headCount(table: string) {
    const filters: Array<(row: ServerRow) => boolean> = []
    const result = Promise.resolve().then(() => ({
      count: tableRows(table).filter((row) => filters.every((filter) => filter(row))).length,
      data: null,
      error: null,
    }))
    const request = Object.assign(result, {
      eq(column: string, value: SyncRowValue) {
        filters.push((row) => compared(column, row[column] ?? null, value) === 0)
        return request
      },
      is(column: string, value: null) {
        filters.push((row) => (row[column] ?? null) === value)
        return request
      },
    })
    return request
  }

  function select(table: string, columns: string) {
    const filters: Array<(row: ServerRow) => boolean> = []
    const orderColumns: Array<{ column: string; ascending: boolean }> = []
    const matching = () => tableRows(table).filter((row) => filters.every((filter) => filter(row)))
    const builder = {
      eq(column: string, value: SyncRowValue) {
        filters.push((row) => compared(column, row[column] ?? null, value) === 0)
        return builder
      },
      gt(column: string, value: string) {
        filters.push((row) => compared(column, row[column] ?? null, value) > 0)
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
      order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
        orderColumns.push({ column, ascending })
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

        const rows = matching()
          .sort((a, b) => {
            for (const { column, ascending } of orderColumns) {
              const order = compared(column, a[column] ?? null, b[column] ?? null)
              if (order !== 0) return ascending ? order : -order
            }
            return 0
          })
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
      received_at: serverInstant(now()),
      writes: [],
    })
    return { data: null, error: null }
  }

  const client = {
    from(table: string) {
      return {
        select: (columns: string, options?: { head?: boolean }) =>
          options?.head ? headCount(table) : select(table, columns),
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
    holdClock() {
      clock += 1
      clockHeld = true
      return () => {
        clockHeld = false
      }
    },
  }
}
