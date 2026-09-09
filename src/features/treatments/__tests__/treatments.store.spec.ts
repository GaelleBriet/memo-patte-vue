// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type { Treatment, TreatmentInput } from '../treatment.schema'
import type { TreatmentsRepository } from '../treatments.repository'
import { provideTreatmentsRepository, useTreatmentsStore } from '../treatments.store'

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

let repository: FakeTreatmentsRepository

beforeEach(() => {
  setActivePinia(createPinia())
  repository = createFakeRepository()
  provideTreatmentsRepository(() => repository)
})

afterEach(() => {
  provideTreatmentsRepository(null)
})

function vermifuge(animalId = MILO, surcharges: Partial<TreatmentInput> = {}): TreatmentInput {
  return {
    animalId,
    name: 'Milbemax',
    type: 'deworming',
    frequency: { value: 3, unit: 'month' },
    lastDoseDate: '2026-03-12',
    ...surcharges,
  }
}

describe('useTreatmentsStore', () => {
  it('part d’un état « pas encore chargé », sans traitement ni erreur', () => {
    const store = useTreatmentsStore()

    expect(store.treatments).toEqual([])
    expect(store.animalId).toBeNull()
    expect(store.hasLoaded).toBe(false)
    expect(store.isLoading).toBe(false)
    expect(store.error).toBeNull()
  })

  it('charge les traitements d’un animal, et de lui seul, dans l’ordre du repository', async () => {
    repository.seed(vermifuge(MILO, { name: 'Bravecto', lastDoseDate: '2026-01-05' }))
    repository.seed(vermifuge(MILO))
    repository.seed(vermifuge(LUNA, { name: 'Frontline' }))
    const store = useTreatmentsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(true)

    expect(repository.listByAnimal).toHaveBeenCalledWith(MILO)
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Bravecto', 'Milbemax'])
    expect(store.animalId).toBe(MILO)
    expect(store.hasLoaded).toBe(true)
    expect(store.isLoading).toBe(false)
  })

  it('reprend l’échéance calculée par le repository sans la recalculer', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()

    await store.loadForAnimal(MILO)

    expect(store.treatments[0]?.nextDueDate).toBe(seme.nextDueDate)
  })

  it('signale le chargement en cours pendant l’appel au repository', async () => {
    let finishList: (treatments: Treatment[]) => void = () => {}
    repository.listByAnimal.mockReturnValueOnce(
      new Promise<Treatment[]>((resolve) => {
        finishList = resolve
      }),
    )
    const store = useTreatmentsStore()

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
    const store = useTreatmentsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)

    expect(store.error?.message).toBe('base indisponible')
    expect(store.hasLoaded).toBe(false)
    expect(store.treatments).toEqual([])
  })

  it('mémorise l’animal demandé même si le chargement a échoué', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()

    await store.loadForAnimal(MILO)

    expect(store.animalId).toBe(MILO)
  })

  it('efface l’erreur précédente dès qu’un chargement réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    await store.loadForAnimal(MILO)

    expect(store.error).toBeNull()
    expect(store.hasLoaded).toBe(true)
  })

  it('lit un traitement par identifiant, null s’il est inconnu', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()

    await expect(store.getById(seme.id)).resolves.toEqual(seme)
    await expect(store.getById('44444444-4444-4444-8444-444444444444')).resolves.toBeNull()
  })

  it('crée un traitement et rafraîchit la liste de son animal', async () => {
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    const created = await store.create(vermifuge(MILO))

    expect(repository.create).toHaveBeenCalledWith(vermifuge(MILO))
    expect(created.name).toBe('Milbemax')
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('crée un traitement pour un animal jamais chargé sans relire une liste', async () => {
    const store = useTreatmentsStore()

    await store.create(vermifuge(MILO))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.treatments).toEqual([])
  })

  it('ne mélange pas les animaux : créer pour Luna ne recharge pas la liste de Milo', async () => {
    repository.seed(vermifuge(MILO))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    await store.create(vermifuge(LUNA, { name: 'Frontline' }))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('met à jour un traitement et rafraîchit la liste', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    const updated = await store.update(seme.id, {
      name: 'Milbemax (chiot)',
      type: 'deworming',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-04-01',
    })

    expect(repository.update).toHaveBeenCalledWith(seme.id, {
      name: 'Milbemax (chiot)',
      type: 'deworming',
      frequency: { value: 1, unit: 'month' },
      lastDoseDate: '2026-04-01',
    })
    expect(updated.name).toBe('Milbemax (chiot)')
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax (chiot)'])
  })

  it('supprime un traitement et rafraîchit la liste', async () => {
    const seme = repository.seed(vermifuge())
    repository.seed(vermifuge(MILO, { name: 'Bravecto', type: 'antiparasitic' }))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    await store.remove(seme.id)

    expect(repository.remove).toHaveBeenCalledWith(seme.id)
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Bravecto'])
  })

  it('propage l’erreur d’une création et garde la liste intacte', async () => {
    repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(vermifuge(MILO, { name: '' }))).rejects.toThrow('nom invalide')

    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
    expect(store.isLoading).toBe(false)
  })

  it('propage l’erreur d’une mise à jour et d’une suppression', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    repository.update.mockRejectedValueOnce(new Error('traitement introuvable'))
    await expect(
      store.update(seme.id, {
        name: 'Milbemax',
        type: 'deworming',
        frequency: { value: 3, unit: 'month' },
        lastDoseDate: '2026-03-12',
      }),
    ).rejects.toThrow('traitement introuvable')

    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))
    await expect(store.remove(seme.id)).rejects.toThrow('base verrouillée')

    expect(store.isLoading).toBe(false)
  })

  it('laisse la bannière de chargement intacte quand une écriture échoue', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(vermifuge())).rejects.toThrow('nom invalide')

    expect(store.error?.message).toBe('base indisponible')
  })

  it('efface la bannière de chargement dès qu’une écriture réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    await store.create(vermifuge(MILO))

    expect(store.error).toBeNull()
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('nomme le câblage manquant quand aucun repository n’est injecté', async () => {
    provideTreatmentsRepository(null)
    const store = useTreatmentsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)
    expect(store.error?.message).toContain('provideTreatmentsRepository')

    await expect(store.create(vermifuge())).rejects.toThrow('provideTreatmentsRepository')
    await expect(store.getById(MILO)).rejects.toThrow('provideTreatmentsRepository')
  })
})

interface FakeTreatmentsRepository {
  seed(input: TreatmentInput): Treatment
  getById: Mock<TreatmentsRepository['getById']>
  listByAnimal: Mock<TreatmentsRepository['listByAnimal']>
  create: Mock<TreatmentsRepository['create']>
  update: Mock<TreatmentsRepository['update']>
  remove: Mock<TreatmentsRepository['remove']>
}

// Même contrat que `treatments.repository.ts`, sans SQLite. `update` remplace l'objet : la liste du store ne bouge que si elle est relue.
function createFakeRepository(): FakeTreatmentsRepository {
  const treatments: Treatment[] = []

  const living = () => treatments.filter((treatment) => treatment.deletedAt === null)

  // Échéance figée, pas calculée : le store doit la reprendre telle quelle.
  const nextDueDate = (lastDoseDate: string) => `${lastDoseDate}#next`

  function seed(input: TreatmentInput): Treatment {
    const now = new Date().toISOString()
    const treatment: Treatment = {
      id: crypto.randomUUID(),
      animalId: input.animalId,
      name: input.name,
      type: input.type,
      frequency: input.frequency,
      lastDoseDate: input.lastDoseDate,
      nextDueDate: nextDueDate(input.lastDoseDate),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    treatments.push(treatment)
    return treatment
  }

  return {
    seed,
    getById: vi.fn<TreatmentsRepository['getById']>(
      async (id) => living().find((treatment) => treatment.id === id) ?? null,
    ),
    listByAnimal: vi.fn<TreatmentsRepository['listByAnimal']>(async (animalId) =>
      living()
        .filter((treatment) => treatment.animalId === animalId)
        .sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate)),
    ),
    create: vi.fn<TreatmentsRepository['create']>(async (input) => seed(input)),
    update: vi.fn<TreatmentsRepository['update']>(async (id, input) => {
      const index = treatments.findIndex(
        (treatment) => treatment.id === id && treatment.deletedAt === null,
      )
      if (index === -1) throw new Error(`Traitement introuvable : ${id}`)
      const updated: Treatment = {
        ...treatments[index]!,
        name: input.name,
        type: input.type,
        frequency: input.frequency,
        lastDoseDate: input.lastDoseDate,
        nextDueDate: nextDueDate(input.lastDoseDate),
        updatedAt: new Date().toISOString(),
      }
      treatments[index] = updated
      return updated
    }),
    remove: vi.fn<TreatmentsRepository['remove']>(async (id) => {
      const treatment = living().find((candidate) => candidate.id === id)
      if (treatment) treatment.deletedAt = new Date().toISOString()
    }),
  }
}
