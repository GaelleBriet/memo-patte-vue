// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyMigrations, createSqlJsDbClient, type InMemoryDb } from './in-memory-db'
import { step } from '../../../../scripts/dose-engine/walk'
import { startWalk, WalkStopped } from '../../../../scripts/dose-engine/walk-state'
import type { Book } from '../../../../scripts/dose-engine/carnet'
import { gridOriginsOf, targetOnOf } from '@/shared/domain/dose-calendar'

const MILO = '11111111-1111-4111-8111-111111111111'
const APPAREIL = '99999999-9999-4999-8999-999999999999'
const T1 = '2026-10-02T08:00:00.000Z'
const SUPPRIME = '2026-10-05T08:00:00.000Z'

type V11Period = Book['periods'][number] & { deletedAt?: string | null }
type V11Dose = Book['doses'][number] & { deletedAt?: string | null }
type V11Treatment = { id: string; periods: V11Period[]; doses: V11Dose[] }

function seedVersion11(db: InMemoryDb, treatments: V11Treatment[]): Promise<void> {
  const by = [APPAREIL, APPAREIL]
  return db.runMany([
    { sql: 'UPDATE sync_state SET enabled = 1 WHERE id = 1' },
    {
      sql: `INSERT INTO animal (id, name, species, created_at, updated_at, created_by_device,
              updated_by_device) VALUES (?, 'Milo', 'dog', ?, ?, ?, ?)`,
      params: [MILO, T1, T1, ...by],
    },
    ...treatments.flatMap(({ id, periods, doses }) => [
      {
        sql: `INSERT INTO treatment (id, animal_id, name, type, created_at, updated_at,
                created_by_device, updated_by_device) VALUES (?, ?, 'Bravecto', 'antiparasitic', ?, ?, ?, ?)`,
        params: [id, MILO, T1, T1, ...by],
      },
      ...periods.map((period) => ({
        sql: `INSERT INTO treatment_period (id, treatment_id, animal_id, starts_on, first_due_on,
                reference_on, ends_on, stopped_on, frequency_value, frequency_unit, times,
                dose_quantity, dose_unit, created_at, updated_at, deleted_at, created_by_device,
                updated_by_device)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0.5, 'tablet', ?, ?, ?, ?, ?)`,
        params: [
          period.id,
          id,
          MILO,
          period.startsOn,
          period.firstDueOn,
          period.referenceOn,
          period.endsOn,
          period.stoppedOn,
          period.frequency.value,
          period.frequency.unit,
          period.times.length > 0 ? period.times.join(',') : null,
          period.createdAt,
          period.createdAt,
          period.deletedAt ?? null,
          ...by,
        ],
      })),
      ...doses.map((dose) => ({
        sql: `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, due_time,
                given_on, status, next_due_date, created_at, updated_at, deleted_at,
                created_by_device, updated_by_device)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        params: [
          dose.id,
          dose.periodId,
          id,
          MILO,
          dose.dueOn,
          dose.dueTime,
          dose.givenOn,
          dose.status,
          dose.nextDueDate,
          T1,
          dose.updatedAt,
          dose.deletedAt ?? null,
          ...by,
        ],
      })),
    ]),
  ])
}

/** Carnets de la campagne : réglages changés, reports, décalages, prises en plus, arrêts. */
function campaignTreatments(from: number, count: number): V11Treatment[] {
  const treatments: V11Treatment[] = []
  for (let seed = from; seed < from + count; seed += 1) {
    const walk = startWalk(seed, 'avec')
    try {
      for (let index = 0; index < 24; index += 1) step(walk, () => {})
    } catch (error) {
      if (!(error instanceof WalkStopped)) throw error
    }
    const tag = (id: string) => `${seed}-${id}`
    treatments.push({
      id: `t-${seed}`,
      periods: walk.book.periods.map((period) => ({ ...period, id: tag(period.id) })),
      doses: walk.book.doses.map((dose) => ({
        ...dose,
        id: tag(dose.id),
        periodId: tag(dose.periodId),
      })),
    })
  }
  return treatments
}

async function userVersion(db: InMemoryDb): Promise<number | undefined> {
  const [version] = await db.query<{ user_version: number }>('PRAGMA user_version')
  return version?.user_version
}

async function schema(db: InMemoryDb) {
  return db.query<{ type: string; name: string; sql: string }>(
    `SELECT type, name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name`,
  )
}

async function freshSchema() {
  const fresh = await createSqlJsDbClient()
  await applyMigrations(fresh)
  const rows = await schema(fresh)
  fresh.close()
  return rows
}

const ORIGINE_31 = { value: 1, unit: 'month' } as const

function period(id: string, extra: Partial<V11Period> = {}): V11Period {
  return {
    id,
    startsOn: '2026-01-31',
    firstDueOn: '2026-01-31',
    referenceOn: '2026-01-31',
    endsOn: null,
    stoppedOn: null,
    frequency: ORIGINE_31,
    times: [],
    createdAt: `2026-01-01T00:00:0${id.slice(-1)}.000Z`,
    ...extra,
  }
}

describe.each([
  ['clés étrangères actives, comme sur Android', 'ON'],
  ['clés étrangères coupées, comme sur le web', 'OFF'],
])('migration v12 d’une base v11 remplie, %s', (_, foreignKeys) => {
  let db: InMemoryDb

  beforeEach(async () => {
    db = await createSqlJsDbClient()
    await db.execute(`PRAGMA foreign_keys = ${foreignKeys}`)
    await applyMigrations(db, 11)
  })

  afterEach(() => {
    db.close()
  })

  it('porte la base en version 12, au schéma exact d’une installation neuve', async () => {
    await seedVersion11(db, campaignTreatments(530_000_000, 5))

    await applyMigrations(db)

    expect(await userVersion(db)).toBe(12)
    expect(await schema(db)).toEqual(await freshSchema())
  })

  it('convertit chaque réglage et chaque ligne comme l’app relisait le schéma v11', async () => {
    const treatments = campaignTreatments(530_000_000, 150)
    await seedVersion11(db, treatments)

    await applyMigrations(db)

    const origins = new Map(
      (
        await db.query<{ id: string; grid_origin_on: string | null }>(
          'SELECT id, grid_origin_on FROM treatment_period',
        )
      ).map(({ id, grid_origin_on }) => [id, grid_origin_on]),
    )
    const targets = new Map(
      (
        await db.query<{ id: string; target_on: string | null }>(
          'SELECT id, target_on FROM treatment_dose',
        )
      ).map(({ id, target_on }) => [id, target_on]),
    )
    const expected = treatments.flatMap(({ periods }) => [...gridOriginsOf(periods)])
    expect(expected.length).toBeGreaterThan(150)
    expect(expected.filter(([, origin]) => origin === null).length).toBeGreaterThan(0)
    expect([...origins].sort()).toEqual(expected.sort())
    expect([...targets].sort()).toEqual(
      treatments.flatMap(({ doses }) => doses.map((dose) => [dose.id, targetOnOf(dose)])).sort(),
    )
  })

  it.each([
    ['le 31 d’un mensuel, sur la grille de la première échéance', '2026-04-30', '2026-01-31'],
    ['une référence hors de la grille de la première échéance', '2026-04-29', '2026-04-29'],
    ['une référence après la première échéance, sur sa grille', '2026-02-28', '2026-01-31'],
  ])('garde %s', async (_, firstDueOn, origin) => {
    await seedVersion11(db, [
      { id: 't-1', periods: [period('p1', { startsOn: firstDueOn, firstDueOn })], doses: [] },
    ])

    await applyMigrations(db)

    await expect(db.query('SELECT grid_origin_on FROM treatment_period')).resolves.toEqual([
      { grid_origin_on: origin },
    ])
  })

  it.each([
    ['tous les 10 jours', { value: 10, unit: 'day' }, '2026-01-01', '2026-03-02', true],
    [
      'tous les 10 jours, un jour à côté',
      { value: 10, unit: 'day' },
      '2026-01-01',
      '2026-03-03',
      false,
    ],
    ['toutes les 2 semaines', { value: 2, unit: 'week' }, '2026-03-12', '2026-01-01', true],
    [
      'toutes les 2 semaines, hors grille',
      { value: 2, unit: 'week' },
      '2026-03-05',
      '2026-01-01',
      false,
    ],
    ['tous les 3 mois, du 31 au 30', { value: 3, unit: 'month' }, '2025-12-31', '2026-06-30', true],
    [
      'tous les 3 mois, au 28 février',
      { value: 3, unit: 'month' },
      '2025-11-30',
      '2026-02-28',
      true,
    ],
    [
      'tous les 2 mois, mois impair',
      { value: 2, unit: 'month' },
      '2026-01-31',
      '2026-02-28',
      false,
    ],
    [
      'tous les mois, le 29 février d’une année bissextile',
      ORIGINE_31,
      '2027-12-31',
      '2028-02-29',
      true,
    ],
  ] as const)(
    'pose l’origine sur la grille : %s',
    async (_, frequency, referenceOn, firstDueOn, kept) => {
      await seedVersion11(db, [
        {
          id: 't-1',
          periods: [period('p1', { startsOn: firstDueOn, firstDueOn, referenceOn, frequency })],
          doses: [],
        },
      ])

      await applyMigrations(db)

      await expect(db.query('SELECT grid_origin_on FROM treatment_period')).resolves.toEqual([
        { grid_origin_on: kept ? referenceOn : firstDueOn },
      ])
    },
  )

  it('fait hériter un réglage de même fréquence et de même référence, après un arrêt non', async () => {
    const suite = period('p2', { startsOn: '2026-02-20', firstDueOn: '2026-02-28' })
    const reprise = period('p4', { startsOn: '2026-03-20', firstDueOn: '2026-03-31' })
    await seedVersion11(db, [
      { id: 't-1', periods: [period('p1'), suite], doses: [] },
      { id: 't-2', periods: [period('p3', { stoppedOn: '2026-02-10' }), reprise], doses: [] },
      {
        id: 't-3',
        periods: [
          period('p5'),
          period('p6', {
            startsOn: '2026-02-20',
            referenceOn: '2026-02-28',
            firstDueOn: '2026-02-28',
          }),
        ],
        doses: [],
      },
    ])

    await applyMigrations(db)

    await expect(
      db.query('SELECT id, grid_origin_on FROM treatment_period ORDER BY id'),
    ).resolves.toEqual([
      { id: 'p1', grid_origin_on: '2026-01-31' },
      { id: 'p2', grid_origin_on: null },
      { id: 'p3', grid_origin_on: '2026-01-31' },
      { id: 'p4', grid_origin_on: '2026-01-31' },
      { id: 'p5', grid_origin_on: '2026-01-31' },
      { id: 'p6', grid_origin_on: '2026-02-28' },
    ])
  })

  it('range les réglages d’un traitement supprimé entre eux, comme s’ils étaient rétablis', async () => {
    const suite = period('p2', { startsOn: '2026-02-20', firstDueOn: '2026-02-28' })
    await seedVersion11(db, [
      {
        id: 't-1',
        periods: [
          { ...period('p1'), deletedAt: SUPPRIME },
          { ...suite, deletedAt: SUPPRIME },
          period('p3', { startsOn: '2026-03-01', firstDueOn: '2026-03-31' }),
        ],
        doses: [],
      },
    ])

    await applyMigrations(db)

    await expect(
      db.query('SELECT id, grid_origin_on, deleted_at FROM treatment_period ORDER BY id'),
    ).resolves.toEqual([
      { id: 'p1', grid_origin_on: '2026-01-31', deleted_at: SUPPRIME },
      { id: 'p2', grid_origin_on: null, deleted_at: SUPPRIME },
      { id: 'p3', grid_origin_on: '2026-01-31', deleted_at: null },
    ])
  })

  it('garde chaque colonne des lignes et des réglages, appareils et suppressions compris', async () => {
    const treatments = campaignTreatments(530_000_200, 3)
    treatments[0]!.doses[0]!.deletedAt = SUPPRIME
    await seedVersion11(db, treatments)
    const kept = (table: string, without: string) =>
      db.query(`SELECT * FROM ${table} ORDER BY id`).then((rows) =>
        rows.map((row) => {
          const { [without]: _, ...rest } = row as Record<string, unknown>
          return rest
        }),
      )
    const periodsBefore = await kept('treatment_period', 'reference_on')
    const dosesBefore = await kept('treatment_dose', 'next_due_date')

    await applyMigrations(db)

    expect(await kept('treatment_period', 'grid_origin_on')).toEqual(periodsBefore)
    expect(await kept('treatment_dose', 'target_on')).toEqual(dosesBefore)
  })

  it('n’envoie rien à la synchronisation : la migration Supabase convertit les mêmes lignes', async () => {
    await seedVersion11(db, campaignTreatments(530_000_000, 3))
    await db.execute('DELETE FROM sync_outbox')

    await applyMigrations(db)

    await expect(db.query('SELECT * FROM sync_outbox')).resolves.toEqual([])
  })

  it('met de nouveau en file d’envoi une ligne écrite après la migration', async () => {
    await seedVersion11(db, campaignTreatments(530_000_000, 1))
    await applyMigrations(db)
    await db.execute('DELETE FROM sync_outbox')

    await db.run(`UPDATE treatment_period SET updated_at = ?`, ['2026-10-12T08:00:00.000Z'])

    expect((await db.query('SELECT entity FROM sync_outbox')).length).toBeGreaterThan(0)
  })

  it('reste en version 11, carnet intact, quand une instruction de la v12 échoue', async () => {
    await seedVersion11(db, campaignTreatments(530_000_000, 2))
    await db.execute('CREATE VIEW treatment_dose_v11 AS SELECT 1 AS id')
    const schemaAvant = await schema(db)
    const dosesAvant = await db.query('SELECT * FROM treatment_dose ORDER BY id')

    await expect(applyMigrations(db)).rejects.toThrow(/already exists/)

    expect(await userVersion(db)).toBe(11)
    expect(await schema(db)).toEqual(schemaAvant)
    await expect(db.query('SELECT * FROM treatment_dose ORDER BY id')).resolves.toEqual(dosesAvant)
  })

  it('laisse des clés étrangères cohérentes et actives', async () => {
    await seedVersion11(db, campaignTreatments(530_000_000, 3))

    await applyMigrations(db)
    await db.execute('PRAGMA foreign_keys = ON')

    await expect(db.query('PRAGMA foreign_key_check')).resolves.toEqual([])
    await expect(
      db.run(
        `INSERT INTO treatment_dose (id, period_id, treatment_id, animal_id, due_on, status,
           created_at, updated_at, created_by_device, updated_by_device)
         VALUES ('x', 'inconnue', 't-530000000', ?, '2026-10-01', 'missed', ?, ?, ?, ?)`,
        [MILO, T1, T1, APPAREIL, APPAREIL],
      ),
    ).rejects.toThrow(/FOREIGN KEY constraint failed/)
  })
})
