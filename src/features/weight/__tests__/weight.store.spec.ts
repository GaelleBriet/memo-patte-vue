// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { WeightEntry, WeightEntryInput } from '../weight.schema'
import type { WeightRepository } from '../weight.repository'
import { provideWeightRepository, useWeightStore } from '../weight.store'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

let repository: FakeWeightRepository

beforeEach(() => {
  setActivePinia(createPinia())
  repository = createFakeRepository()
  provideWeightRepository(() => repository)
})

afterEach(() => {
  provideWeightRepository(null)
})

function pesee(animalId = MILO, surcharges: Partial<WeightEntryInput> = {}): WeightEntryInput {
  return { animalId, weightKg: 12.4, measuredOn: '2026-03-12', ...surcharges }
}

describe('useWeightStore', () => {
  it('part d’un état « pas encore chargé », sans pesée ni erreur', () => {
    const store = useWeightStore()

    expect(store.entries).toEqual([])
    expect(store.animalId).toBeNull()
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('charge les pesées d’un animal, et de lui seul, dans l’ordre du repository', async () => {
    repository.seed(pesee(MILO, { measuredOn: '2026-03-12' }))
    repository.seed(pesee(MILO, { weightKg: 12.9, measuredOn: '2026-04-02' }))
    repository.seed(pesee(LUNA, { weightKg: 4.1 }))
    const store = useWeightStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(true)

    expect(repository.listByAnimal).toHaveBeenCalledWith(MILO)
    expect(store.entries.map((entry) => entry.measuredOn)).toEqual(['2026-03-12', '2026-04-02'])
    expect(store.animalId).toBe(MILO)
    expect(store.hasLoaded).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('signale le chargement en cours pendant l’appel au repository', async () => {
    let finishList: (entries: WeightEntry[]) => void = () => {}
    repository.listByAnimal.mockReturnValueOnce(
      new Promise<WeightEntry[]>((resolve) => {
        finishList = resolve
      }),
    )
    const store = useWeightStore()

    const loading = store.loadForAnimal(MILO)
    await Promise.resolve()
    expect(store.isLoading).toBe(true)
    expect(store.hasLoaded).toBe(false)

    finishList([])
    await loading
    expect(store.isLoading).toBe(false)
    expect(store.hasLoaded).toBe(true)
  })

  it('range l’erreur du repository dans l’état sans faire planter le store', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useWeightStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)

    expect(store.error?.message).toBe('base indisponible')
    expect(store.hasLoaded).toBe(false)
    expect(store.entries).toEqual([])
  })

  it('mémorise l’animal demandé même si le chargement a échoué', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useWeightStore()

    await store.loadForAnimal(MILO)

    expect(store.animalId).toBe(MILO)
  })

  it('efface l’erreur précédente dès qu’un chargement réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    await store.loadForAnimal(MILO)

    expect(store.error).toBeNull()
    expect(store.hasLoaded).toBe(true)
  })

  it('crée une pesée et rafraîchit la liste de son animal', async () => {
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    const created = await store.create(pesee(MILO))

    expect(repository.create).toHaveBeenCalledWith(pesee(MILO))
    expect(created.weightKg).toBe(12.4)
    expect(store.entries.map((entry) => entry.weightKg)).toEqual([12.4])
  })

  it('crée une pesée pour un animal jamais chargé sans relire une liste', async () => {
    const store = useWeightStore()

    await store.create(pesee(MILO))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.entries).toEqual([])
  })

  it('ne mélange pas les animaux : peser Luna ne recharge pas la liste de Milo', async () => {
    repository.seed(pesee(MILO))
    const store = useWeightStore()
    await store.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    await store.create(pesee(LUNA, { weightKg: 4.1 }))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.entries.map((entry) => entry.weightKg)).toEqual([12.4])
  })

  it('met à jour une pesée et rafraîchit la liste', async () => {
    const seme = repository.seed(pesee())
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    const updated = await store.update(seme.id, { weightKg: 13.1, measuredOn: '2026-04-01' })

    expect(repository.update).toHaveBeenCalledWith(seme.id, {
      weightKg: 13.1,
      measuredOn: '2026-04-01',
    })
    expect(updated.weightKg).toBe(13.1)
    expect(store.entries.map((entry) => entry.weightKg)).toEqual([13.1])
  })

  it('supprime une pesée et rafraîchit la liste', async () => {
    const seme = repository.seed(pesee())
    repository.seed(pesee(MILO, { weightKg: 12.9, measuredOn: '2026-04-02' }))
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    await store.remove(seme.id)

    expect(repository.remove).toHaveBeenCalledWith(seme.id)
    expect(store.entries.map((entry) => entry.weightKg)).toEqual([12.9])
  })

  it('propage l’erreur d’une création et garde la liste intacte', async () => {
    repository.seed(pesee())
    const store = useWeightStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('poids invalide'))

    await expect(store.create(pesee(MILO, { weightKg: -1 }))).rejects.toThrow('poids invalide')

    expect(store.entries.map((entry) => entry.weightKg)).toEqual([12.4])
    expect(store.isLoading).toBe(false)
  })

  it('propage l’erreur d’une mise à jour et d’une suppression', async () => {
    const seme = repository.seed(pesee())
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    repository.update.mockRejectedValueOnce(new Error('pesée introuvable'))
    await expect(
      store.update(seme.id, { weightKg: 12.4, measuredOn: '2026-03-12' }),
    ).rejects.toThrow('pesée introuvable')

    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))
    await expect(store.remove(seme.id)).rejects.toThrow('base verrouillée')

    expect(store.isLoading).toBe(false)
  })

  it('laisse la bannière de chargement intacte quand une écriture échoue', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useWeightStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('poids invalide'))

    await expect(store.create(pesee())).rejects.toThrow('poids invalide')

    expect(store.error?.message).toBe('base indisponible')
  })

  it('efface la bannière de chargement dès qu’une écriture réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useWeightStore()
    await store.loadForAnimal(MILO)

    await store.create(pesee(MILO))

    expect(store.error).toBeNull()
    expect(store.entries.map((entry) => entry.weightKg)).toEqual([12.4])
  })

  it('nomme le câblage manquant quand aucun repository n’est injecté', async () => {
    provideWeightRepository(null)
    const store = useWeightStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)
    expect(store.error?.message).toContain('provideWeightRepository')

    await expect(store.create(pesee())).rejects.toThrow('provideWeightRepository')
  })
})

interface FakeWeightRepository {
  seed(input: WeightEntryInput): WeightEntry
  listByAnimal: Mock<WeightRepository['listByAnimal']>
  create: Mock<WeightRepository['create']>
  update: Mock<WeightRepository['update']>
  remove: Mock<WeightRepository['remove']>
}

// Même contrat que `weight.repository.ts`, sans SQLite. `update` remplace l'objet : la liste du store ne bouge que si elle est relue.
function createFakeRepository(): FakeWeightRepository {
  const entries: WeightEntry[] = []

  const living = () => entries.filter((entry) => entry.deletedAt === null)

  function seed(input: WeightEntryInput): WeightEntry {
    const now = new Date().toISOString()
    const entry: WeightEntry = {
      id: crypto.randomUUID(),
      animalId: input.animalId,
      weightKg: input.weightKg,
      measuredOn: input.measuredOn,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    entries.push(entry)
    return entry
  }

  return {
    seed,
    listByAnimal: vi.fn<WeightRepository['listByAnimal']>(async (animalId) =>
      living().filter((entry) => entry.animalId === animalId),
    ),
    create: vi.fn<WeightRepository['create']>(async (input) => seed(input)),
    update: vi.fn<WeightRepository['update']>(async (id, input) => {
      const index = entries.findIndex((entry) => entry.id === id && entry.deletedAt === null)
      if (index === -1) throw new Error(`Pesée introuvable : ${id}`)
      const updated: WeightEntry = {
        ...entries[index]!,
        weightKg: input.weightKg,
        measuredOn: input.measuredOn,
        updatedAt: new Date().toISOString(),
      }
      entries[index] = updated
      return updated
    }),
    remove: vi.fn<WeightRepository['remove']>(async (id) => {
      const entry = living().find((candidate) => candidate.id === id)
      if (entry) entry.deletedAt = new Date().toISOString()
    }),
  }
}
