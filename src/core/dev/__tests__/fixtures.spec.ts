// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { AnimalsRepository } from '@/features/animals/repository/animals.repository'
import type { TreatmentDosesRepository } from '@/features/treatments/repository/treatment-doses.repository'
import type { TreatmentPeriodsRepository } from '@/features/treatments/repository/treatment-periods.repository'
import type { TreatmentsRepository } from '@/features/treatments/repository/treatments.repository'
import type { VaccinationInjectionsRepository } from '@/features/vaccinations/repository/vaccination-injections.repository'
import type { VaccinationsRepository } from '@/features/vaccinations/repository/vaccinations.repository'
import type { WeightRepository } from '@/features/weight/repository/weight.repository'
vi.mock('@/core/db/sqlite', () => ({
  getDb: vi.fn<() => Promise<DbClient>>(async () => {
    throw new Error('ouverture de la base impossible')
  }),
}))

import { DEMO_CARNET_MARKER } from '../demo-carnet'
import {
  applyDevFixtures,
  applyFixtures,
  EMPTY_FIXTURES_TOKEN,
  FIXTURES_STORAGE_KEY,
  type FixturesRepositories,
} from '../fixtures'

const TODAY = new Date(2026, 8, 13)

function createFakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial))
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  }
}

function createFakeDb(): DbClient {
  return {
    run: vi.fn<DbClient['run']>(async () => 0),
    runMany: vi.fn<DbClient['runMany']>(async () => {}),
    query: vi.fn<(sql: string) => Promise<never[]>>(async () => []),
    execute: vi.fn<DbClient['execute']>(async () => {}),
  }
}

let nextId = 0
/** Chaque `create` rend son entrée avec un identifiant, seul champ que le module relit. */
function fakeCreate<Create extends (input: never) => Promise<unknown>>(prefix: string) {
  return vi.fn<Create>((async (input: object) => ({
    ...input,
    id: `${prefix}-${++nextId}`,
  })) as unknown as Create)
}

/** Chaque instruction porte sa table et sa ligne, pour relire ce que le module a écrit. */
function fakeStatement<Row>(table: string) {
  return vi.fn<(row: Row, exists: boolean) => SqlStatement>((row, exists) => ({
    sql: table,
    params: [JSON.stringify({ ...row, exists })],
  }))
}

function createFakeRepositories(): FixturesRepositories {
  return {
    animals: {
      create: fakeCreate<AnimalsRepository['create']>('animal'),
      runImport: vi.fn<AnimalsRepository['runImport']>(async () => {}),
    },
    vaccinations: { create: fakeCreate<VaccinationsRepository['create']>('vaccination') },
    vaccinationInjections: {
      record: vi.fn<VaccinationInjectionsRepository['record']>(async () => {}),
    },
    treatments: {
      restoreStatement:
        fakeStatement<Parameters<TreatmentsRepository['restoreStatement']>[0]>('treatment'),
    },
    treatmentPeriods: {
      restoreStatement:
        fakeStatement<Parameters<TreatmentPeriodsRepository['restoreStatement']>[0]>('period'),
    },
    treatmentDoses: {
      restoreStatement:
        fakeStatement<Parameters<TreatmentDosesRepository['restoreStatement']>[0]>('dose'),
    },
    weight: { create: fakeCreate<WeightRepository['create']>('weight') },
  }
}

type WrittenRow = Record<string, unknown> & { table: string }

/** Lignes de chaque transaction de traitement, dans l'ordre de leur écriture. */
function writtenTreatments(repositories: FixturesRepositories): WrittenRow[][] {
  return vi.mocked(repositories.animals.runImport).mock.calls.map(([statements]) =>
    statements.map(({ sql, params = [] }) => ({
      ...(JSON.parse(String(params[0])) as Record<string, unknown>),
      table: sql,
    })),
  )
}

function deletedTables(db: DbClient): string[] {
  return vi
    .mocked(db.runMany)
    .mock.calls.flatMap(([statements]) => statements.map(({ sql }) => sql))
    .map((sql) => sql.replace('DELETE FROM ', ''))
}

describe('applyFixtures', () => {
  let db: DbClient
  let repositories: FixturesRepositories

  beforeEach(() => {
    db = createFakeDb()
    repositories = createFakeRepositories()
  })

  it('ne touche à rien quand le jeton est identique à celui mémorisé', async () => {
    const storage = createFakeStorage({ [FIXTURES_STORAGE_KEY]: 'maquettes-1' })

    const outcome = await applyFixtures({
      token: 'maquettes-1',
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('unchanged')
    expect(db.runMany).not.toHaveBeenCalled()
    expect(repositories.animals.create).not.toHaveBeenCalled()
  })

  it('remet à zéro puis peuple quand le jeton change en mode maquettes', async () => {
    const storage = createFakeStorage({ [FIXTURES_STORAGE_KEY]: 'maquettes-1' })

    const outcome = await applyFixtures({
      token: 'maquettes-2',
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('seeded')
    expect(deletedTables(db)).toEqual([
      'treatment_dose',
      'treatment_period',
      'treatment',
      'sync_pull_cursor',
      'sync_state',
      'sync_outbox',
      'vaccination_injection',
      'vaccination',
      'carnet_settings',
      'weight_entry',
      'animal',
    ])
    expect(repositories.animals.create).toHaveBeenCalledTimes(2)
    expect(repositories.vaccinations.create).toHaveBeenCalledTimes(3)
    expect(repositories.animals.runImport).toHaveBeenCalledTimes(6)
    expect(repositories.weight.create).toHaveBeenCalledTimes(10)
    expect(storage.getItem(FIXTURES_STORAGE_KEY)).toBe('maquettes-2')
  })

  it('rattache chaque entrée à l’identifiant rendu par le repository des animaux', async () => {
    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    const [milo, luna] = await Promise.all(
      vi.mocked(repositories.animals.create).mock.results.map((result) => result.value),
    )
    const vaccinationAnimalIds = vi
      .mocked(repositories.vaccinations.create)
      .mock.calls.map(([input]) => input.animalId)
    expect(vaccinationAnimalIds).toEqual([milo.id, milo.id, luna.id])
    expect(db.runMany).toHaveBeenCalledOnce()
  })

  it('note l’historique des vaccins par le repository des injections', async () => {
    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    const [chppi] = await Promise.all(
      vi.mocked(repositories.vaccinations.create).mock.results.map((result) => result.value),
    )
    const injections = vi.mocked(repositories.vaccinationInjections.record).mock.calls
    expect(
      injections.map(([injection]) => [injection.vaccinationId, injection.injectedOn]),
    ).toEqual([
      [chppi.id, '2024-07-30'],
      [chppi.id, '2024-06-30'],
    ])
  })

  it('écrit chaque traitement en une transaction : le traitement, puis chaque période suivie de ses lignes', async () => {
    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    const [milo, luna] = await Promise.all(
      vi.mocked(repositories.animals.create).mock.results.map((result) => result.value),
    )
    const written = writtenTreatments(repositories)
    expect(written.map(([treatment]) => [treatment!.name, treatment!.animalId])).toEqual([
      ['Bravecto', milo.id],
      ['Drontal', milo.id],
      ['Advocate', milo.id],
      ['Panacur', milo.id],
      ['Milbemax', luna.id],
      ['Frontline', luna.id],
    ])
    expect(written.map((rows) => rows.map(({ table }) => table).join(' '))).toEqual([
      'treatment period dose',
      `treatment period${' dose'.repeat(15)}`,
      'treatment period dose dose',
      'treatment period dose dose dose dose dose',
      'treatment period dose dose period dose',
      'treatment period dose dose dose',
    ])
    expect(written.flat().every(({ exists }) => exists === false)).toBe(true)
  })

  it('rattache chaque période à son traitement et chaque ligne à sa période, toutes à leur animal', async () => {
    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    for (const [treatment, ...rows] of writtenTreatments(repositories)) {
      const precedingPeriod = (index: number) =>
        rows
          .slice(0, index + 1)
          .filter(({ table }) => table === 'period')
          .at(-1)?.id
      expect(rows.map(({ treatmentId, animalId }) => [treatmentId, animalId])).toEqual(
        rows.map(() => [treatment!.id, treatment!.animalId]),
      )
      expect(rows.map((row) => (row.table === 'period' ? row.id : row.periodId))).toEqual(
        rows.map((_, index) => precedingPeriod(index)),
      )
    }
    const ids = writtenTreatments(repositories)
      .flat()
      .map(({ id }) => id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('complète une période du jeu de démo : première échéance à son début, le reste vide', async () => {
    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    const [, bravecto] = writtenTreatments(repositories)[0]!
    const [, panacur] = writtenTreatments(repositories)[3]!
    expect(bravecto).toMatchObject({
      startsOn: '2026-06-28',
      firstDueOn: '2026-06-28',
      endsOn: null,
      stoppedOn: null,
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    })
    expect(panacur).toMatchObject({
      firstDueOn: '2026-09-08',
      endsOn: '2026-09-17',
      times: ['08:00', '20:00'],
      doseQuantity: 1,
      doseUnit: 'sachet',
      reminderOffsetMinutes: 15,
      reminderTime: null,
    })
  })

  it('ordonne la remise à zéro avant le peuplement', async () => {
    const order: string[] = []
    vi.mocked(db.runMany).mockImplementation(async () => void order.push('reset'))
    vi.mocked(repositories.animals.create).mockImplementation(async (input) => {
      order.push('seed')
      return { ...input, id: 'x' } as never
    })

    await applyFixtures({
      token: 'maquettes-1',
      storage: createFakeStorage(),
      db,
      repositories,
      today: TODAY,
    })

    expect(order).toEqual(['reset', 'seed', 'seed'])
  })

  it('sans variable : remet à zéro sans peupler si le jeton mémorisé est différent', async () => {
    const storage = createFakeStorage({ [FIXTURES_STORAGE_KEY]: 'maquettes-1' })

    const outcome = await applyFixtures({
      token: undefined,
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('reset')
    expect(deletedTables(db)).toHaveLength(11)
    expect(repositories.animals.create).not.toHaveBeenCalled()
    expect(storage.getItem(FIXTURES_STORAGE_KEY)).toBe(EMPTY_FIXTURES_TOKEN)
  })

  it('sans variable : ne touche à rien si la base a déjà été vidée par un lancement précédent', async () => {
    const storage = createFakeStorage({ [FIXTURES_STORAGE_KEY]: EMPTY_FIXTURES_TOKEN })

    const outcome = await applyFixtures({
      token: undefined,
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('unchanged')
    expect(db.runMany).not.toHaveBeenCalled()
  })

  it('sans variable et sans jeton mémorisé : remet à zéro, pour que dev suive un dev:data', async () => {
    // Premier lancement en `pnpm dev` sur un stockage jamais marqué : on ne sait
    // pas ce que contient la base, on la vide une fois puis on mémorise « vide ».
    const storage = createFakeStorage()

    const outcome = await applyFixtures({
      token: undefined,
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('reset')
    expect(storage.getItem(FIXTURES_STORAGE_KEY)).toBe(EMPTY_FIXTURES_TOKEN)
  })

  it('traite un jeton inconnu comme le mode vide', async () => {
    const storage = createFakeStorage()

    const outcome = await applyFixtures({
      token: 'autre-chose',
      storage,
      db,
      repositories,
      today: TODAY,
    })

    expect(outcome).toBe('reset')
    expect(repositories.animals.create).not.toHaveBeenCalled()
    expect(storage.getItem(FIXTURES_STORAGE_KEY)).toBe('autre-chose')
  })

  it('ne mémorise pas le jeton si le peuplement échoue, pour réessayer au prochain chargement', async () => {
    const storage = createFakeStorage({ [FIXTURES_STORAGE_KEY]: 'maquettes-1' })
    vi.mocked(repositories.animals.create).mockRejectedValue(new Error('base fermée'))

    await expect(
      applyFixtures({ token: 'maquettes-2', storage, db, repositories, today: TODAY }),
    ).rejects.toThrow('base fermée')

    expect(storage.getItem(FIXTURES_STORAGE_KEY)).toBe('maquettes-1')
  })
})

describe('applyDevFixtures', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('journalise un échec en console sans le propager : le montage de l’app ne dépend pas des fixtures', async () => {
    vi.stubGlobal('localStorage', createFakeStorage())
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})

    // `getDb` est remplacé en tête de fichier par une ouverture qui rejette.
    await expect(applyDevFixtures()).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledOnce()
    expect(String(error.mock.calls[0]?.[0])).toMatch(/fixtures/i)
    // Le marqueur doit être lu à l'exécution : c'est lui que `pnpm test:build` cherche dans le bundle.
    expect(String(error.mock.calls[0]?.[0])).toContain(DEMO_CARNET_MARKER)
    expect(error.mock.calls[0]?.[1]).toEqual(new Error('ouverture de la base impossible'))
  })
})
