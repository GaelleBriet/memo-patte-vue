// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { Vaccination, VaccinationInput } from '../vaccination.schema'
import type { VaccinationsRepository } from '../vaccinations.repository'
import { provideVaccinationsRepository, useVaccinationsStore } from '../vaccinations.store'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

let repository: FakeVaccinationsRepository

beforeEach(() => {
  setActivePinia(createPinia())
  repository = createFakeRepository()
  provideVaccinationsRepository(() => repository)
})

afterEach(() => {
  provideVaccinationsRepository(null)
})

function rage(animalId = MILO, surcharges: Partial<VaccinationInput> = {}): VaccinationInput {
  return { animalId, name: 'Rage', lastInjectionDate: '2026-03-12', dueDate: null, ...surcharges }
}

describe('useVaccinationsStore', () => {
  it('part d’un état « pas encore chargé », sans vaccin ni erreur', () => {
    const store = useVaccinationsStore()

    expect(store.vaccinations).toEqual([])
    expect(store.animalId).toBeNull()
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('charge les vaccins d’un animal, et de lui seul', async () => {
    repository.seed(rage(MILO))
    repository.seed(rage(LUNA, { name: 'Typhus' }))
    const store = useVaccinationsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(true)

    expect(repository.listByAnimal).toHaveBeenCalledWith(MILO)
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage'])
    expect(store.animalId).toBe(MILO)
    expect(store.hasLoaded).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('signale le chargement en cours pendant l’appel au repository', async () => {
    let finishList: (vaccinations: Vaccination[]) => void = () => {}
    repository.listByAnimal.mockReturnValueOnce(
      new Promise<Vaccination[]>((resolve) => {
        finishList = resolve
      }),
    )
    const store = useVaccinationsStore()

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
    const store = useVaccinationsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)

    expect(store.error?.message).toBe('base indisponible')
    expect(store.hasLoaded).toBe(false)
    expect(store.vaccinations).toEqual([])
  })

  it('efface l’erreur précédente dès qu’un chargement réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    await store.loadForAnimal(MILO)

    expect(store.error).toBeNull()
    expect(store.hasLoaded).toBe(true)
  })

  it('lit un vaccin par identifiant, null s’il est inconnu', async () => {
    const seme = repository.seed(rage())
    const store = useVaccinationsStore()

    await expect(store.getById(seme.id)).resolves.toEqual(seme)
    await expect(store.getById('44444444-4444-4444-8444-444444444444')).resolves.toBeNull()
  })

  it('crée un vaccin et rafraîchit la liste de son animal', async () => {
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    const created = await store.create(rage(MILO))

    expect(repository.create).toHaveBeenCalledWith(rage(MILO))
    expect(created.name).toBe('Rage')
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage'])
  })

  it('crée un vaccin pour un animal jamais chargé sans relire une liste', async () => {
    const store = useVaccinationsStore()

    await store.create(rage(MILO))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.vaccinations).toEqual([])
  })

  it('ne mélange pas les animaux : créer pour Luna ne recharge pas la liste de Milo', async () => {
    repository.seed(rage(MILO))
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    await store.create(rage(LUNA, { name: 'Typhus' }))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage'])
  })

  it('met à jour un vaccin et rafraîchit la liste', async () => {
    const seme = repository.seed(rage())
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    const updated = await store.update(seme.id, {
      name: 'Rage (rappel)',
      lastInjectionDate: '2026-04-01',
      dueDate: '2027-04-01',
    })

    expect(repository.update).toHaveBeenCalledWith(seme.id, {
      name: 'Rage (rappel)',
      lastInjectionDate: '2026-04-01',
      dueDate: '2027-04-01',
    })
    expect(updated.name).toBe('Rage (rappel)')
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage (rappel)'])
  })

  it('supprime un vaccin et rafraîchit la liste', async () => {
    const seme = repository.seed(rage())
    repository.seed(rage(MILO, { name: 'Leptospirose' }))
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    await store.remove(seme.id)

    expect(repository.remove).toHaveBeenCalledWith(seme.id)
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Leptospirose'])
  })

  it('propage l’erreur d’une création et garde la liste intacte', async () => {
    repository.seed(rage())
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(rage(MILO, { name: '' }))).rejects.toThrow('nom invalide')

    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage'])
    expect(store.isLoading).toBe(false)
  })

  it('propage l’erreur d’une mise à jour et d’une suppression', async () => {
    const seme = repository.seed(rage())
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    repository.update.mockRejectedValueOnce(new Error('vaccin introuvable'))
    await expect(
      store.update(seme.id, { name: 'Rage', lastInjectionDate: '2026-03-12', dueDate: null }),
    ).rejects.toThrow('vaccin introuvable')

    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))
    await expect(store.remove(seme.id)).rejects.toThrow('base verrouillée')

    expect(store.isLoading).toBe(false)
  })

  it('laisse la bannière de chargement intacte quand une écriture échoue', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(rage())).rejects.toThrow('nom invalide')

    expect(store.error?.message).toBe('base indisponible')
  })

  it('efface la bannière de chargement dès qu’une écriture réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useVaccinationsStore()
    await store.loadForAnimal(MILO)

    await store.create(rage(MILO))

    expect(store.error).toBeNull()
    expect(store.vaccinations.map((vaccination) => vaccination.name)).toEqual(['Rage'])
  })

  it('nomme le câblage manquant quand aucun repository n’est injecté', async () => {
    provideVaccinationsRepository(null)
    const store = useVaccinationsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)
    expect(store.error?.message).toContain('provideVaccinationsRepository')

    await expect(store.create(rage())).rejects.toThrow('provideVaccinationsRepository')
    await expect(store.getById(MILO)).rejects.toThrow('provideVaccinationsRepository')
  })
})

interface FakeVaccinationsRepository {
  seed(input: VaccinationInput): Vaccination
  getById: Mock<VaccinationsRepository['getById']>
  listByAnimal: Mock<VaccinationsRepository['listByAnimal']>
  create: Mock<VaccinationsRepository['create']>
  update: Mock<VaccinationsRepository['update']>
  remove: Mock<VaccinationsRepository['remove']>
}

// Même contrat que `vaccinations.repository.ts`, sans SQLite.
function createFakeRepository(): FakeVaccinationsRepository {
  const vaccinations: Vaccination[] = []

  const living = () => vaccinations.filter((vaccination) => vaccination.deletedAt === null)

  function seed(input: VaccinationInput): Vaccination {
    const now = new Date().toISOString()
    const vaccination: Vaccination = {
      id: crypto.randomUUID(),
      animalId: input.animalId,
      name: input.name,
      lastInjectionDate: input.lastInjectionDate,
      dueDate: input.dueDate ?? null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    vaccinations.push(vaccination)
    return vaccination
  }

  return {
    seed,
    getById: vi.fn<VaccinationsRepository['getById']>(
      async (id) => living().find((vaccination) => vaccination.id === id) ?? null,
    ),
    listByAnimal: vi.fn<VaccinationsRepository['listByAnimal']>(async (animalId) =>
      living().filter((vaccination) => vaccination.animalId === animalId),
    ),
    create: vi.fn<VaccinationsRepository['create']>(async (input) => seed(input)),
    update: vi.fn<VaccinationsRepository['update']>(async (id, input) => {
      const current = living().find((vaccination) => vaccination.id === id)
      if (!current) throw new Error(`Vaccin introuvable : ${id}`)
      Object.assign(current, {
        name: input.name,
        lastInjectionDate: input.lastInjectionDate,
        dueDate: input.dueDate ?? null,
        updatedAt: new Date().toISOString(),
      })
      return current
    }),
    remove: vi.fn<VaccinationsRepository['remove']>(async (id) => {
      const vaccination = living().find((candidate) => candidate.id === id)
      if (vaccination) vaccination.deletedAt = new Date().toISOString()
    }),
  }
}
