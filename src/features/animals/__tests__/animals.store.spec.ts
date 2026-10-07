// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import type { Animal, AnimalInput } from '../schema/animal.schema'
import type { AnimalCreationService } from '../service/animal-creation.service'
import type { AnimalDeletionService } from '../service/animal-deletion.service'
import type { AnimalFollowService } from '../service/animal-follow.service'
import type { AnimalsRepository } from '../repository/animals.repository'
import {
  provideAnimalCreationService,
  provideAnimalDeletionService,
  provideAnimalFollowService,
  provideAnimalsRepository,
  useAnimalsStore,
} from '../store/animals.store'
import { track } from '@/core/analytics'
import { deletePhoto, savePhoto } from '@/core/photos/photo-storage'

vi.mock('@/core/analytics', () => ({
  track: vi.fn<(event: string, properties?: Record<string, unknown>) => void>(),
}))

vi.mock('@/core/photos/photo-storage', () => ({
  savePhoto: vi.fn<(base64: string) => Promise<string>>(async () => 'milo.jpg'),
  deletePhoto: vi.fn<(name: string) => Promise<void>>(async () => {}),
}))

let repository: FakeAnimalsRepository
let deletion: {
  remove: Mock<AnimalDeletionService['remove']>
  restore: Mock<AnimalDeletionService['restore']>
  forgetPhoto: Mock<AnimalDeletionService['forgetPhoto']>
}
let follow: {
  unfollow: Mock<AnimalFollowService['unfollow']>
  undoUnfollow: Mock<AnimalFollowService['undoUnfollow']>
  follow: Mock<AnimalFollowService['follow']>
  undoFollow: Mock<AnimalFollowService['undoFollow']>
}
const DELETED_AT = '2026-09-28T08:00:00.000Z'
let creation: { create: Mock<AnimalCreationService['create']> }

beforeEach(() => {
  vi.clearAllMocks()
  setActivePinia(createPinia())
  repository = createFakeRepository()
  deletion = {
    remove: vi.fn<AnimalDeletionService['remove']>(async (id) => {
      repository.markDeleted(id)
      return { animalId: id, deletedAt: DELETED_AT, photoPath: null }
    }),
    restore: vi.fn<AnimalDeletionService['restore']>(async ({ animalId }) =>
      repository.markRestored(animalId),
    ),
    forgetPhoto: vi.fn<AnimalDeletionService['forgetPhoto']>().mockResolvedValue(),
  }
  follow = {
    unfollow: vi.fn<AnimalFollowService['unfollow']>(async (id) => {
      repository.setUnfollowedOn(id, '2026-09-28')
      return { animalId: id, unfollowedOn: '2026-09-28', stoppedPeriodIds: [] }
    }),
    undoUnfollow: vi.fn<AnimalFollowService['undoUnfollow']>(async ({ animalId }) =>
      repository.setUnfollowedOn(animalId, null),
    ),
    follow: vi.fn<AnimalFollowService['follow']>(async (id) => {
      repository.setUnfollowedOn(id, null)
      return {
        animalId: id,
        departure: { unfollowedOn: '2026-09-28', departureReason: null, departureDate: null },
      }
    }),
    undoFollow: vi.fn<AnimalFollowService['undoFollow']>(async ({ animalId }) =>
      repository.setUnfollowedOn(animalId, '2026-09-28'),
    ),
  }
  creation = {
    create: vi.fn<AnimalCreationService['create']>(async ({ weightKg: _weightKg, ...input }) =>
      repository.create(input),
    ),
  }
  provideAnimalsRepository(() => repository)
  provideAnimalDeletionService(() => deletion)
  provideAnimalCreationService(() => creation)
  provideAnimalFollowService(() => follow)
})

afterEach(() => {
  provideAnimalsRepository(null)
  provideAnimalDeletionService(null)
  provideAnimalCreationService(null)
  provideAnimalFollowService(null)
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

    expect(repository.create).toHaveBeenCalledWith({
      name: 'Vasco',
      species: 'dog',
      photoPath: null,
    })
    expect(created.name).toBe('Vasco')
    expect(store.animals.map((animal) => animal.name)).toEqual(['Vasco'])
  })

  it('confie au service de création le poids saisi, qui devient la première pesée', async () => {
    const store = useAnimalsStore()

    await store.create({ name: 'Pixel', species: 'cat', weightKg: 1.2 })

    expect(creation.create).toHaveBeenCalledExactlyOnceWith({
      name: 'Pixel',
      species: 'cat',
      weightKg: 1.2,
      photoPath: null,
    })
  })

  it('transmet la création aux statistiques, sans le nom de l’animal', async () => {
    const store = useAnimalsStore()

    await store.create({ name: 'Vasco', species: 'dog' })

    expect(track).toHaveBeenCalledExactlyOnceWith('animal_created', { species: 'dog' })
  })

  it('met à jour un animal et rafraîchit la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    const updated = await store.update(miette.id, { name: 'Miette la seconde', species: 'cat' })

    expect(repository.update).toHaveBeenCalledWith(miette.id, {
      name: 'Miette la seconde',
      species: 'cat',
      photoPath: null,
    })
    expect(updated.name).toBe('Miette la seconde')
    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette la seconde'])
  })

  it('crée un animal avec sa photo, dont seul le nom de fichier est persisté', async () => {
    const store = useAnimalsStore()

    const created = await store.create(
      { name: 'Milo', species: 'dog' },
      { kind: 'replace', base64: 'TUlMTw==' },
    )

    expect(savePhoto).toHaveBeenCalledWith('TUlMTw==')
    expect(created.photoPath).toBe('milo.jpg')
  })

  it('garde la photo d’un animal mis à jour sans toucher à sa photo', async () => {
    const milo = repository.seed({ name: 'Milo', species: 'dog', photoPath: 'milo.jpg' })
    const store = useAnimalsStore()

    const updated = await store.update(milo.id, { name: 'Milou', species: 'dog', photoPath: null })

    expect(updated.photoPath).toBe('milo.jpg')
    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('retire la photo, la rend sur « Annuler » et n’efface son fichier qu’au retrait définitif', async () => {
    const milo = repository.seed({ name: 'Milo', species: 'dog', photoPath: 'milo.jpg' })
    const store = useAnimalsStore()
    const input = { name: 'Milo', species: 'dog' } as const

    const removal = await store.removePhoto(milo.id, input)
    expect(store.byId(milo.id)?.photoPath).toBeNull()
    expect(deletePhoto).not.toHaveBeenCalled()

    await store.undoRemovePhoto(input, removal!)
    expect(store.byId(milo.id)?.photoPath).toBe('milo.jpg')

    await store.removePhoto(milo.id, input)
    await store.forgetRemovedPhoto(removal!)
    expect(deletePhoto).toHaveBeenCalledExactlyOnceWith('milo.jpg')
  })

  it('laisse le fichier de la photo en place quand l’animal est supprimé', async () => {
    const milo = repository.seed({ name: 'Milo', species: 'dog', photoPath: 'milo.jpg' })
    const store = useAnimalsStore()

    await store.remove(milo.id)

    expect(deletePhoto).not.toHaveBeenCalled()
  })

  it('supprime un animal et rafraîchit la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    repository.seed({ name: 'Vasco', species: 'dog' })
    const store = useAnimalsStore()
    await store.load()

    await store.remove(miette.id)

    expect(deletion.remove).toHaveBeenCalledWith(miette.id)
    expect(repository.remove).not.toHaveBeenCalled()
    expect(store.animals.map((animal) => animal.name)).toEqual(['Vasco'])
  })

  it('rend la suppression, puis la défait par « Annuler » et rafraîchit la liste', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    const removal = await store.remove(miette.id)
    await store.undoRemove(removal!)

    expect(deletion.restore).toHaveBeenCalledWith(removal)
    expect(store.animals.map((animal) => animal.name)).toEqual(['Miette'])
  })

  it('confie au service l’effacement de la photo après la suppression', async () => {
    const store = useAnimalsStore()
    const removal = { animalId: 'milo', deletedAt: DELETED_AT, photoPath: 'milo.jpg' }

    await store.forgetPhoto(removal)

    expect(deletion.forgetPhoto).toHaveBeenCalledWith(removal)
  })

  describe('suivi', () => {
    it('AN-6 : sépare les animaux suivis de ceux qu’on ne suit plus, dans l’ordre de la liste', async () => {
      repository.seed({ name: 'Luna', species: 'cat' })
      repository.seed({ name: 'Milo', species: 'dog' })
      const pixel = repository.seed({ name: 'Pixel', species: 'cat' })
      repository.setUnfollowedOn(pixel.id, '2026-09-20')
      const store = useAnimalsStore()
      await store.load()

      expect(store.followedAnimals.map((animal) => animal.name)).toEqual(['Luna', 'Milo'])
      expect(store.unfollowedAnimals.map((animal) => animal.name)).toEqual(['Pixel'])
      expect(store.animals).toHaveLength(3)
    })

    it('AN-9 : ne plus suivre puis « Annuler », la liste relue à chaque fois', async () => {
      const luna = repository.seed({ name: 'Luna', species: 'cat' })
      const store = useAnimalsStore()
      await store.load()

      const undo = await store.unfollow(luna.id)
      expect(store.unfollowedAnimals.map((animal) => animal.name)).toEqual(['Luna'])

      await store.undoUnfollow(undo!)
      expect(follow.undoUnfollow).toHaveBeenCalledWith(undo)
      expect(store.followedAnimals.map((animal) => animal.name)).toEqual(['Luna'])
    })

    it('AN-11 : suivre de nouveau puis « Annuler », la liste relue à chaque fois', async () => {
      const luna = repository.seed({ name: 'Luna', species: 'cat' })
      repository.setUnfollowedOn(luna.id, '2026-09-28')
      const store = useAnimalsStore()
      await store.load()

      const undo = await store.follow(luna.id)
      expect(store.followedAnimals.map((animal) => animal.name)).toEqual(['Luna'])

      await store.undoFollow(undo!)
      expect(follow.undoFollow).toHaveBeenCalledWith(undo)
      expect(store.unfollowedAnimals.map((animal) => animal.name)).toEqual(['Luna'])
    })

    it('propage l’échec du geste', async () => {
      const luna = repository.seed({ name: 'Luna', species: 'cat' })
      const store = useAnimalsStore()
      follow.unfollow.mockRejectedValueOnce(new Error('base verrouillée'))

      await expect(store.unfollow(luna.id)).rejects.toThrow('base verrouillée')
      expect(store.isLoading).toBe(false)
    })
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

  it('retrouve un animal par identifiant, null pour un inconnu', async () => {
    const miette = repository.seed({ name: 'Miette', species: 'cat' })
    const store = useAnimalsStore()
    await store.load()

    expect(store.byId(miette.id)?.name).toBe('Miette')
    expect(store.byId('33333333-3333-4333-8333-333333333333')).toBeNull()
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

    deletion.remove.mockRejectedValueOnce(new Error('base verrouillée'))
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
  markRestored: (id: string) => void
  setUnfollowedOn: (id: string, unfollowedOn: string | null) => void
  seed(input: AnimalInput): Animal
  markDeleted(id: string): void
  getById: Mock<AnimalsRepository['getById']>
  list: Mock<AnimalsRepository['list']>
  create: Mock<AnimalsRepository['create']>
  update: Mock<AnimalsRepository['update']>
  remove: Mock<AnimalsRepository['remove']>
  listRecords: Mock<AnimalsRepository['listRecords']>
  listVersions: Mock<AnimalsRepository['listVersions']>
  markAllDeletedStatement: Mock<AnimalsRepository['markAllDeletedStatement']>
  eraseAllStatement: Mock<AnimalsRepository['eraseAllStatement']>
  eraseAll: Mock<AnimalsRepository['eraseAll']>
  restoreStatement: Mock<AnimalsRepository['restoreStatement']>
  runImport: Mock<AnimalsRepository['runImport']>
  entity: AnimalsRepository['entity']
  getRowForPush: Mock<AnimalsRepository['getRowForPush']>
  pushRow: Mock<AnimalsRepository['pushRow']>
  pullPage: Mock<AnimalsRepository['pullPage']>
  applyRemoteRowStatement: Mock<AnimalsRepository['applyRemoteRowStatement']>
  restore: Mock<AnimalsRepository['restore']>
  getDeparture: Mock<AnimalsRepository['getDeparture']>
  setDeparture: Mock<AnimalsRepository['setDeparture']>
}

// Même contrat que `animals.repository.ts`, sans SQLite.
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
      birthDateApproximate: input.birthDateApproximate ?? false,
      photoPath: input.photoPath ?? null,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      unfollowedOn: null,
    }
  }

  function seed(input: AnimalInput): Animal {
    const animal = toAnimal(input)
    animals.push(animal)
    return animal
  }

  function markDeleted(id: string): void {
    const animal = animals.find((candidate) => candidate.id === id)
    if (animal) animal.deletedAt = new Date().toISOString()
  }

  function markRestored(id: string): void {
    const animal = animals.find((candidate) => candidate.id === id)
    if (animal) animal.deletedAt = null
  }

  function setUnfollowedOn(id: string, unfollowedOn: string | null): void {
    const animal = animals.find((candidate) => candidate.id === id)
    if (animal) animal.unfollowedOn = unfollowedOn
  }

  return {
    seed,
    markDeleted,
    markRestored,
    setUnfollowedOn,
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
    remove: vi.fn<AnimalsRepository['remove']>(async (id) => markDeleted(id)),
    restore: vi.fn<AnimalsRepository['restore']>(),
    getDeparture: vi.fn<AnimalsRepository['getDeparture']>(),
    setDeparture: vi.fn<AnimalsRepository['setDeparture']>(),
    listRecords: vi.fn<AnimalsRepository['listRecords']>(),
    listVersions: vi.fn<AnimalsRepository['listVersions']>(),
    markAllDeletedStatement: vi.fn<AnimalsRepository['markAllDeletedStatement']>(),
    eraseAllStatement: vi.fn<AnimalsRepository['eraseAllStatement']>(),
    eraseAll: vi.fn<AnimalsRepository['eraseAll']>(),
    restoreStatement: vi.fn<AnimalsRepository['restoreStatement']>(),
    runImport: vi.fn<AnimalsRepository['runImport']>(),
    entity: 'animal',
    getRowForPush: vi.fn<AnimalsRepository['getRowForPush']>(),
    pushRow: vi.fn<AnimalsRepository['pushRow']>(),
    pullPage: vi.fn<AnimalsRepository['pullPage']>(),
    applyRemoteRowStatement: vi.fn<AnimalsRepository['applyRemoteRowStatement']>(),
  }
}
