// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbClient } from '@/core/db/db-client'
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
    run: vi.fn(async () => 0),
    runMany: vi.fn(async () => {}),
    query: vi.fn(async () => []),
    execute: vi.fn(async () => {}),
  }
}

let nextId = 0
function createFakeRepositories(): FixturesRepositories {
  return {
    animals: { create: vi.fn(async (input) => ({ ...input, id: `animal-${++nextId}` })) },
    vaccinations: { create: vi.fn(async (input) => ({ ...input, id: `vaccination-${++nextId}` })) },
    treatments: { create: vi.fn(async (input) => ({ ...input, id: `treatment-${++nextId}` })) },
    weight: { create: vi.fn(async (input) => ({ ...input, id: `weight-${++nextId}` })) },
  } as unknown as FixturesRepositories
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
    expect(deletedTables(db)).toEqual(['treatment', 'weight_entry', 'vaccination', 'animal'])
    expect(repositories.animals.create).toHaveBeenCalledTimes(2)
    expect(repositories.vaccinations.create).toHaveBeenCalledTimes(3)
    expect(repositories.treatments.create).toHaveBeenCalledTimes(2)
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
    expect(deletedTables(db)).toHaveLength(4)
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

    // Sans plugin Capacitor ni navigateur, l'ouverture de la base échoue forcément.
    await expect(applyDevFixtures()).resolves.toBeUndefined()

    expect(error).toHaveBeenCalledOnce()
    expect(String(error.mock.calls[0]?.[0])).toMatch(/fixtures/i)
  })
})
