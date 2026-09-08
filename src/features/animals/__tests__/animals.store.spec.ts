// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Animal, AnimalInput } from '../animal.schema'
import type { AnimalsRepository } from '../animals.repository'
import { provideAnimalsRepository, useAnimalsStore } from '../animals.store'

let repository: FakeAnimalsRepository

beforeEach(() => {
  setActivePinia(createPinia())
  repository = createFakeRepository()
  provideAnimalsRepository(() => repository)
})

afterEach(() => {
  provideAnimalsRepository(null)
})

describe('useAnimalsStore', () => {
  it('part d’un état « pas encore chargé », sans animal ni erreur', () => {
    const store = useAnimalsStore()

    expect(store.animals).toEqual([])
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
    expect(store.selectedAnimalId).toBeNull()
    expect(store.selectedAnimal).toBeNull()
  })

  it('charge la liste du repository', async () => {
    repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()

    await store.load()

    expect(repository.list).toHaveBeenCalledOnce()
    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette'])
    expect(store.hasLoaded).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('ignore les animaux supprimés et garde le tri par nom du repository', async () => {
    repository.seed({ name: 'vasco', species: 'dog' })
    const parti = repository.seed({ name: 'Abricot', species: 'cat' })
    repository.seed({ name: 'Miette', species: 'cat' })
    await repository.remove(parti.id)
    const store = useAnimalsStore()

    await store.load()

    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette', 'vasco'])
  })

  it('signale le chargement en cours pendant l’appel au repository', async () => {
    let finishList: (animals: Animal[]) => void = () => {}
    repository.list.mockReturnValueOnce(
      new Promise<Animal[]>((resolve) => {
        finishList = resolve
      }),
    )
    const store = useAnimalsStore()

    const loading = store.load()
    await Promise.resolve()
    expect(store.isLoading).toBe(true)
    expect(store.hasLoaded).toBe(false)

    finishList([])
    await loading
    expect(store.isLoading).toBe(false)
    expect(store.hasLoaded).toBe(true)
  })

  it('crée un animal et rafraîchit la liste', async () => {
    const store = useAnimalsStore()
    await store.load()

    const created = await store.create({ name: 'Vasco', species: 'dog' })

    expect(repository.create).toHaveBeenCalledWith({ name: 'Vasco', species: 'dog' })
    expect(created.name).toBe('Vasco')
    expect(store.animals.map((animal) => animal.name)).toEqual(['Vasco'])
  })

  it('met à jour un animal et rafraîchit la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    const updated = await store.update(miette.id, { name: 'Miette la seconde', species: 'cat' })

    expect(repository.update).toHaveBeenCalledWith(miette.id, {
      name: 'Miette la seconde',
      species: 'cat',
    })
    expect(updated.name).toBe('Miette la seconde')
    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette la seconde'])
  })

  it('supprime un animal et rafraîchit la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    repository.seed({ name: 'Vasco', species: 'dog' })
    const store = useAnimalsStore()
    await store.load()

    await store.remove(miette.id)

    expect(repository.remove).toHaveBeenCalledWith(miette.id)
    expect(store.animals.map((animal) => animal.name)).toEqual(['Vasco'])
  })

  it('sélectionne un animal puis revient à « tous les animaux »', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    store.select(miette.id)
    expect(store.selectedAnimalId).toBe(miette.id)
    expect(store.selectedAnimal?.name).toBe('Miette')

    store.select(null)
    expect(store.selectedAnimalId).toBeNull()
    expect(store.selectedAnimal).toBeNull()
  })

  it('oublie la sélection quand l’animal sélectionné disparaît de la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()
    store.select(miette.id)

    await store.remove(miette.id)

    expect(store.selectedAnimalId).toBeNull()
    expect(store.selectedAnimal).toBeNull()
  })

  it('range l’erreur du repository dans l’état sans faire planter le store', async () => {
    repository.list.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useAnimalsStore()

    await expect(store.load()).resolves.toBe(false)

    expect(store.error?.message).toBe('base indisponible')
    expect(store.isLoading).toBe(false)
    expect(store.hasLoaded).toBe(false)
    expect(store.animals).toEqual([])
  })

  it('propage l’erreur d’une création et garde la liste intacte', async () => {
    repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create({ name: '', species: 'dog' })).rejects.toThrow('nom invalide')

    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette'])
    expect(store.isLoading).toBe(false)
  })

  it('propage l’erreur d’une mise à jour et d’une suppression', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    repository.update.mockRejectedValueOnce(new Error('animal introuvable'))
    await expect(store.update(miette.id, { name: 'Miette', species: 'cat' })).rejects.toThrow(
      'animal introuvable',
    )

    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))
    await expect(store.remove(miette.id)).rejects.toThrow('base verrouillée')

    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette'])
    expect(store.isLoading).toBe(false)
  })

  it('laisse la bannière de chargement intacte quand une écriture échoue', async () => {
    repository.list.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useAnimalsStore()
    await store.load()
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create({ name: '', species: 'dog' })).rejects.toThrow('nom invalide')

    // `error` ne raconte que l'histoire de la liste : l'échec d'écriture est parti à l'appelant.
    expect(store.error?.message).toBe('base indisponible')
  })

  it('efface la bannière de chargement dès qu’une écriture réussit', async () => {
    repository.list.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useAnimalsStore()
    await store.load()

    await store.create({ name: 'Vasco', species: 'dog' })

    expect(store.error).toBeNull()
    expect(store.animals.map((animal) => animal.name)).toEqual(['Vasco'])
  })

  it('nomme le câblage manquant quand aucun repository n’est injecté', async () => {
    provideAnimalsRepository(null)
    const store = useAnimalsStore()

    await expect(store.load()).resolves.toBe(false)
    // Le message doit désigner le câblage oublié, pas un « x is not a function ».
    expect(store.error?.message).toContain('provideAnimalsRepository')
    expect(store.hasLoaded).toBe(false)

    await expect(store.create({ name: 'Vasco', species: 'dog' })).rejects.toThrow(
      'provideAnimalsRepository',
    )
  })

  it('efface l’erreur précédente dès qu’un chargement réussit', async () => {
    repository.list.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useAnimalsStore()
    await store.load()

    await store.load()

    expect(store.error).toBeNull()
    expect(store.hasLoaded).toBe(true)
  })
})

interface FakeAnimalsRepository {
  /** Ajoute un animal sans passer par le store, pour préparer un cas de test. */
  seed(input: AnimalInput): Animal
  getById: Mock<AnimalsRepository['getById']>
  list: Mock<AnimalsRepository['list']>
  create: Mock<AnimalsRepository['create']>
  update: Mock<AnimalsRepository['update']>
  remove: Mock<AnimalsRepository['remove']>
}

/**
 * Repository doublé : même contrat que `animals.repository.ts` (liste des
 * animaux vivants triée par nom, suppression logique), sans SQLite.
 */
function createFakeRepository(): FakeAnimalsRepository {
  const animals: Animal[] = []

  const living = () =>
    animals
      .filter((animal) => animal.deletedAt === null)
      .sort((left, right) => left.name.localeCompare(right.name, 'fr', { sensitivity: 'base' }))

  function toAnimal(input: AnimalInput): Animal {
    const now = new Date().toISOString()
    return {
      name: input.name,
      species: input.species,
      breed: input.breed ?? null,
      birthDate: input.birthDate ?? null,
      initialWeightKg: input.initialWeightKg ?? null,
      photoPath: input.photoPath ?? null,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
  }

  function seed(input: AnimalInput): Animal {
    const animal = toAnimal(input)
    animals.push(animal)
    return animal
  }

  return {
    seed,
    getById: vi.fn<AnimalsRepository['getById']>(
      async (id) => living().find((animal) => animal.id === id) ?? null,
    ),
    list: vi.fn<AnimalsRepository['list']>(async () => living()),
    create: vi.fn<AnimalsRepository['create']>(async (input) => seed(input)),
    update: vi.fn<AnimalsRepository['update']>(async (id, input) => {
      const index = animals.findIndex((animal) => animal.id === id && animal.deletedAt === null)
      if (index === -1) throw new Error(`Animal introuvable : ${id}`)
      const updated: Animal = { ...toAnimal(input), id, createdAt: animals[index]!.createdAt }
      animals[index] = updated
      return updated
    }),
    remove: vi.fn<AnimalsRepository['remove']>(async (id) => {
      const animal = animals.find((candidate) => candidate.id === id)
      if (animal) animal.deletedAt = new Date().toISOString()
    }),
  }
}
