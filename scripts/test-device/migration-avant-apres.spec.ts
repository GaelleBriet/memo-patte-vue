// @vitest-environment node
// Lecture d'une base tirée de l'appareil (#754) : MIGRATION_DB=<base.db> MIGRATION_OUT=<sortie.json> pnpm exec vitest run scripts/test-device/migration-avant-apres.spec.ts
// Lancé sur `main` avec la base v11, puis sur la branche avec la base v12 migrée sur l'appareil, `diff` des deux sorties.
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

import initSqlJs from 'sql.js'
import { describe, expect, it } from 'vitest'

import type { DbClient } from '@/core/db/db-client'
import { readableScheduleOf } from '@/features/treatments/logic/reminders-schedule-adapter'
import { createTreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import { treatmentReading } from '@/shared/domain/treatment-reading'

const path = process.env.MIGRATION_DB
const out = process.env.MIGRATION_OUT
const TODAY = process.env.MIGRATION_TODAY ?? '2026-10-12'
const require = createRequire(import.meta.url)

type Due = { dueOn: string; dueTime: string | null }
const keys = (dues: readonly Due[]) => dues.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime ?? ''}`)

async function openFile(file: string): Promise<DbClient> {
  const SQL = await initSqlJs({ locateFile: (name) => require.resolve(`sql.js/dist/${name}`) })
  const database = new SQL.Database(readFileSync(file))
  return {
    async run(sql, params = []) {
      database.run(sql, params)
      return database.getRowsModified()
    },
    async runMany(statements) {
      for (const { sql, params = [] } of statements) database.run(sql, params)
    },
    async query<T>(sql: string, params: unknown[] = []) {
      const statement = database.prepare(sql, params as never)
      const rows: T[] = []
      while (statement.step()) rows.push(statement.getAsObject() as T)
      statement.free()
      return rows
    },
    async execute(sql) {
      database.exec(sql)
    },
  } as DbClient
}

describe.skipIf(path === undefined || out === undefined)('lecture d’une base de l’appareil', () => {
  it('écrit ce que montrent les écrans et ce que lisent les rappels, traitement par traitement', async () => {
    const treatments = await createTreatmentsRepository(await openFile(path!)).listAllWithHistory()
    const shown = Object.fromEntries(
      treatments.map((treatment) => {
        const view = treatmentReading(treatment, TODAY)
        const schedule = readableScheduleOf(treatment, TODAY)
        return [
          treatment.name,
          {
            ecrans:
              view === null
                ? 'illisible'
                : {
                    phase: view.phase,
                    finished: view.finished,
                    current: keys(view.currentDoses),
                    unlogged: keys(view.unloggedDoses),
                    upcoming: keys(view.upcoming({ limit: 40 })),
                    history: view.history.map(({ line, effect }) => [line.id, effect]),
                  },
            rappels:
              schedule === null
                ? 'illisible'
                : {
                    phase: schedule.phase,
                    current: keys(schedule.currentDoses),
                    unlogged: keys(schedule.unloggedDoses),
                    upcoming: keys(schedule.upcoming(40)),
                  },
          },
        ]
      }),
    )
    writeFileSync(out!, JSON.stringify(shown, null, 1))
    process.stdout.write(`Base lue : ${treatments.length} traitements\n`)
    expect(treatments.length).toBeGreaterThan(0)
  })
})
