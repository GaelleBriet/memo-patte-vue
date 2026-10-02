// @vitest-environment node
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest'

import type {
  TreatmentCreationInput,
  TreatmentEditionInput,
  TreatmentResumptionInput,
} from '../schema/treatment-form.schema'
import type { Treatment, TreatmentInput } from '../schema/treatment.schema'
import type { TreatmentPlanService } from '../service/treatment-plan.service'
import type { TreatmentDosesService } from '../service/treatment-doses.service'
import type { TreatmentRemindersService } from '../service/treatment-reminders.service'
import type { TreatmentStopService } from '../service/treatment-stop.service'
import type {
  TreatmentsRepository,
  TreatmentWithHistory,
} from '../repository/treatments.repository'
import {
  provideTreatmentDosesService,
  provideTreatmentPlanService,
  provideTreatmentRemindersService,
  provideTreatmentStopService,
  provideTreatmentsRepository,
  useTreatmentsStore,
} from '../store/treatments.store'
import { track } from '@/core/analytics'
import type { Animal } from '@/features/animals/schema/animal.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'

vi.mock('@/core/analytics', () => ({
  track: vi.fn<(event: string, properties?: Record<string, unknown>) => void>(),
}))

const MILO = '11111111-1111-4111-8111-111111111111'
const LUNA = '33333333-3333-4333-8333-333333333333'

const MILO_ANIMAL: Animal = {
  id: MILO,
  name: 'Milo',
  species: 'dog',
  breed: null,
  birthDate: null,
  photoPath: null,
  createdAt: '2026-09-09T09:00:00.000Z',
  updatedAt: '2026-09-09T09:00:00.000Z',
  deletedAt: null,
}

let repository: FakeTreatmentsRepository
let reminders: {
  reschedule: Mock<TreatmentRemindersService['reschedule']>
}

beforeEach(() => {
  vi.mocked(track).mockClear()
  setActivePinia(createPinia())
  repository = createFakeRepository()
  provideTreatmentsRepository(() => repository)
  provideTreatmentPlanService(() => repository)
  reminders = {
    reschedule: vi.fn<TreatmentRemindersService['reschedule']>().mockResolvedValue(),
  }
  provideTreatmentRemindersService(() => reminders)
})

afterEach(() => {
  provideTreatmentsRepository(null)
  provideTreatmentPlanService(null)
  provideTreatmentRemindersService(null)
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

const REGLAGES = {
  frequency: { value: 3, unit: 'month' },
  times: [],
  doseQuantity: null,
  doseUnit: null,
  endsOn: null,
} satisfies Partial<TreatmentCreationInput>

function creation(
  animalId = MILO,
  surcharges: Partial<TreatmentCreationInput> = {},
): TreatmentCreationInput {
  return {
    animalId,
    name: 'Milbemax',
    type: 'deworming',
    firstDoseOn: '2026-03-12',
    ...REGLAGES,
    ...surcharges,
  }
}

function edition(surcharges: Partial<TreatmentEditionInput> = {}): TreatmentEditionInput {
  return {
    name: 'Milbemax',
    type: 'deworming',
    ...REGLAGES,
    nextDoseOn: '2026-06-12',
    ...surcharges,
  }
}

function reprise(surcharges: Partial<TreatmentResumptionInput> = {}): TreatmentResumptionInput {
  return { firstDoseOn: '2026-10-01', ...REGLAGES, ...surcharges }
}

describe('useTreatmentsStore', () => {
  it('garde la liste du dernier animal demandé quand la réponse du précédent arrive après', async () => {
    repository.seed(vermifuge(LUNA))
    let finishMilo: (items: Treatment[]) => void = () => {}
    repository.listByAnimal.mockReturnValueOnce(
      new Promise<Treatment[]>((resolve) => {
        finishMilo = resolve
      }),
    )
    const store = useTreatmentsStore()

    const milo = store.loadForAnimal(MILO)
    await store.loadForAnimal(LUNA)
    finishMilo([])
    await milo

    expect(store.animalId).toBe(LUNA)
    expect(store.treatments).toHaveLength(1)
    expect(store.treatments[0]?.animalId).toBe(LUNA)
  })

  it('garde le dernier animal demandé quand le repository du précédent s’ouvre après', async () => {
    repository.seed(vermifuge(LUNA))
    let openFirst: () => void = () => {}
    let calls = 0
    provideTreatmentsRepository(() => {
      calls += 1
      if (calls > 1) return repository
      return new Promise((resolve) => {
        openFirst = () => resolve(repository)
      })
    })
    const store = useTreatmentsStore()

    const milo = store.loadForAnimal(MILO)
    await store.loadForAnimal(LUNA)
    openFirst()
    await milo

    expect(store.animalId).toBe(LUNA)
    expect(store.treatments[0]?.animalId).toBe(LUNA)
  })

  it('ignore l’échec d’un chargement dépassé par celui d’un autre animal', async () => {
    let failMilo: (cause: Error) => void = () => {}
    repository.listByAnimal.mockReturnValueOnce(
      new Promise<Treatment[]>((_resolve, reject) => {
        failMilo = reject
      }),
    )
    const store = useTreatmentsStore()

    const milo = store.loadForAnimal(MILO)
    await store.loadForAnimal(LUNA)
    failMilo(new Error('base fermée'))
    await milo

    expect(store.animalId).toBe(LUNA)
    expect(store.error).toBeNull()
  })

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

    const created = await store.create(creation(MILO))

    expect(repository.create).toHaveBeenCalledWith(creation(MILO))
    expect(created.name).toBe('Milbemax')
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('transmet la création aux statistiques, avec l’espèce de l’animal', async () => {
    useAnimalsStore().animals = [MILO_ANIMAL]
    const store = useTreatmentsStore()

    await store.create(creation(MILO))

    expect(track).toHaveBeenCalledExactlyOnceWith('treatment_created', { species: 'dog' })
  })

  it('ne transmet rien aux statistiques quand l’animal est inconnu du store', async () => {
    const store = useTreatmentsStore()

    await store.create(creation(MILO))

    expect(track).not.toHaveBeenCalled()
  })

  it('crée un traitement pour un animal jamais chargé sans relire une liste', async () => {
    const store = useTreatmentsStore()

    await store.create(creation(MILO))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.treatments).toEqual([])
  })

  it('ne mélange pas les animaux : créer pour Luna ne recharge pas la liste de Milo', async () => {
    repository.seed(vermifuge(MILO))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    await store.create(creation(LUNA, { name: 'Frontline' }))

    expect(repository.listByAnimal).not.toHaveBeenCalled()
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('met à jour un traitement et rafraîchit la liste', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    const input = edition({
      name: 'Milbemax (chiot)',
      frequency: { value: 1, unit: 'month' },
      nextDoseOn: '2026-04-12',
    })

    const updated = await store.update(seme.id, input)

    expect(repository.update).toHaveBeenCalledWith(seme.id, input)
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

  it('programme les rappels du traitement créé sur sa prochaine échéance', async () => {
    const store = useTreatmentsStore()

    const created = await store.create(creation())

    expect(reminders.reschedule).toHaveBeenCalledWith(created.id)
  })

  it('reprogramme les rappels quand « Modifier » déplace l’échéance', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()

    const updated = await store.update(seme.id, edition({ nextDoseOn: '2026-07-12' }))

    expect(reminders.reschedule).toHaveBeenCalledWith(updated.id)
    expect(repository.update.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('reprogramme, donc retire, les rappels du traitement supprimé, après l’écriture en base', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()

    await store.remove(seme.id)

    expect(reminders.reschedule).toHaveBeenCalledWith(seme.id)
    expect(repository.remove.mock.invocationCallOrder[0]).toBeLessThan(
      reminders.reschedule.mock.invocationCallOrder[0]!,
    )
  })

  it('ne touche pas aux rappels quand l’écriture échoue', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    repository.update.mockRejectedValueOnce(new Error('traitement introuvable'))
    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))

    await expect(store.update(seme.id, edition())).rejects.toThrow('traitement introuvable')
    await expect(store.remove(seme.id)).rejects.toThrow('base verrouillée')

    expect(reminders.reschedule).not.toHaveBeenCalled()
  })

  it('propage l’erreur d’une création et garde la liste intacte', async () => {
    repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(creation(MILO, { name: '' }))).rejects.toThrow('nom invalide')

    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
    expect(store.isLoading).toBe(false)
  })

  it('propage l’erreur d’une mise à jour et d’une suppression', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    repository.update.mockRejectedValueOnce(new Error('traitement introuvable'))
    await expect(store.update(seme.id, edition())).rejects.toThrow('traitement introuvable')

    repository.remove.mockRejectedValueOnce(new Error('base verrouillée'))
    await expect(store.remove(seme.id)).rejects.toThrow('base verrouillée')

    expect(store.isLoading).toBe(false)
  })

  it('laisse la bannière de chargement intacte quand une écriture échoue', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.create.mockRejectedValueOnce(new Error('nom invalide'))

    await expect(store.create(creation())).rejects.toThrow('nom invalide')

    expect(store.error?.message).toBe('base indisponible')
  })

  it('efface la bannière de chargement dès qu’une écriture réussit', async () => {
    repository.listByAnimal.mockRejectedValueOnce(new Error('base indisponible'))
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)

    await store.create(creation(MILO))

    expect(store.error).toBeNull()
    expect(store.treatments.map((treatment) => treatment.name)).toEqual(['Milbemax'])
  })

  it('compte les prises de chaque traitement avec la liste', async () => {
    const seme = repository.seed(vermifuge())
    repository.countDosesByAnimal.mockResolvedValue({ [seme.id]: 14 })
    const store = useTreatmentsStore()

    await store.loadForAnimal(MILO)

    expect(repository.countDosesByAnimal).toHaveBeenCalledWith(MILO)
    expect(store.doseCounts).toEqual({ [seme.id]: 14 })
  })

  it('lit les prises d’un traitement sans changer la liste affichée', async () => {
    repository.listDoses.mockResolvedValue([])
    const store = useTreatmentsStore()

    await expect(store.listDoses('t1')).resolves.toEqual([])

    expect(repository.listDoses).toHaveBeenCalledWith('t1')
  })

  it('reprend un traitement arrêté, reprogramme ses rappels et relit la liste', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    const repris = await store.resume(seme.id, reprise())

    expect(repository.resume).toHaveBeenCalledWith(seme.id, reprise())
    expect(repris).toMatchObject({ id: seme.id, stoppedOn: null, nextDueDate: '2026-10-01' })
    expect(reminders.reschedule).toHaveBeenCalledWith(seme.id)
    expect(repository.listByAnimal).toHaveBeenCalledWith(MILO)
  })

  it('nomme le câblage manquant quand aucun repository n’est injecté', async () => {
    provideTreatmentsRepository(null)
    const store = useTreatmentsStore()

    await expect(store.loadForAnimal(MILO)).resolves.toBe(false)
    expect(store.error?.message).toContain('provideTreatmentsRepository')

    await expect(store.create(creation())).rejects.toThrow('provideTreatmentsRepository')
    await expect(store.getById(MILO)).rejects.toThrow('provideTreatmentsRepository')
  })
})

describe('useTreatmentsStore — gestes d’un rappel', () => {
  const doses = {
    noteMoment: vi.fn<TreatmentDosesService['noteMoment']>(),
    apply: vi.fn<TreatmentDosesService['apply']>(),
    undoBatch: vi.fn<TreatmentDosesService['undoBatch']>().mockResolvedValue(),
  }
  const stop = {
    stop: vi.fn<TreatmentStopService['stop']>(),
    undo: vi.fn<TreatmentStopService['undo']>().mockResolvedValue(),
  }

  beforeEach(() => {
    provideTreatmentDosesService(() => doses)
    provideTreatmentStopService(() => stop)
  })

  afterEach(() => {
    provideTreatmentDosesService(null)
    provideTreatmentStopService(null)
    vi.clearAllMocks()
  })

  it('note la dose du moment par son service puis relit la liste affichée de l’animal', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    const noted = {
      animalId: MILO,
      undo: [{ action: 'delete' as const, id: 'p1' }],
      alreadyGivenOn: null,
      postponement: null,
      moved: null,
      due: { periodId: seme.periodId, dueOn: '2026-09-20', dueTime: null },
      severalTimes: false,
    }
    doses.noteMoment.mockResolvedValue(noted)
    repository.listByAnimal.mockClear()

    await expect(store.noteMomentDose(seme.id, '2026-09-20')).resolves.toEqual(noted)

    expect(doses.noteMoment).toHaveBeenCalledWith(seme.id, '2026-09-20')
    expect(repository.listByAnimal).toHaveBeenCalledWith(MILO)
  })

  it('arrête un traitement puis annule l’arrêt par son service', async () => {
    stop.stop.mockResolvedValue({ animalId: MILO, stopped: true })
    const store = useTreatmentsStore()

    await expect(store.stop('t1')).resolves.toEqual({ animalId: MILO, stopped: true })
    await store.undoStop('t1')

    expect(stop.stop).toHaveBeenCalledWith('t1')
    expect(stop.undo).toHaveBeenCalledWith('t1')
  })

  it('applique un geste de la fiche puis son annulation par son service, et relit la liste', async () => {
    const seme = repository.seed(vermifuge())
    const store = useTreatmentsStore()
    await store.loadForAnimal(MILO)
    const applied = {
      animalId: MILO,
      undo: [{ action: 'restore' as const, id: 'p1' }],
      alreadyGivenOn: null,
      postponement: null,
      moved: null,
    }
    doses.apply.mockResolvedValue(applied)
    repository.listByAnimal.mockClear()

    await expect(store.applyDoseAction(seme.id, { kind: 'remove', doseId: 'p1' })).resolves.toEqual(
      applied,
    )
    await store.undoDoseAction(seme.id, applied.undo)

    expect(doses.apply).toHaveBeenCalledWith(seme.id, { kind: 'remove', doseId: 'p1' })
    expect(doses.undoBatch).toHaveBeenCalledWith(seme.id, applied.undo)
    expect(repository.listByAnimal).toHaveBeenCalledTimes(2)
  })

  it('propage l’échec d’un geste', async () => {
    doses.noteMoment.mockRejectedValue(new Error('base verrouillée'))
    const store = useTreatmentsStore()

    await expect(store.noteMomentDose('t1', '2026-09-20')).rejects.toThrow('base verrouillée')
    expect(store.isLoading).toBe(false)
  })
})

describe('useTreatmentsStore — traitement avec ses périodes et ses prises', () => {
  const METACAM: TreatmentWithHistory = {
    id: 't1',
    animalId: LUNA,
    name: 'Métacam',
    type: 'medication',
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    periods: [],
    doses: [],
  }

  it('lit un traitement tel que le repository le rend, sans toucher à la liste affichée', async () => {
    repository.getWithHistory.mockResolvedValue(METACAM)
    const store = useTreatmentsStore()

    await expect(store.getWithHistory('t1')).resolves.toBe(METACAM)
    expect(repository.getWithHistory).toHaveBeenCalledExactlyOnceWith('t1')
    expect(store.treatments).toEqual([])
    expect(store.isLoading).toBe(false)
  })

  it('lit les traitements d’un animal', async () => {
    repository.listWithHistoryByAnimal.mockResolvedValue([METACAM])
    const store = useTreatmentsStore()

    await expect(store.listWithHistoryByAnimal(LUNA)).resolves.toEqual([METACAM])
    expect(repository.listWithHistoryByAnimal).toHaveBeenCalledExactlyOnceWith(LUNA)
    expect(store.animalId).toBeNull()
  })

  it('laisse remonter l’échec de la lecture', async () => {
    repository.getWithHistory.mockRejectedValue(new Error('base verrouillée'))

    await expect(useTreatmentsStore().getWithHistory('t1')).rejects.toThrow('base verrouillée')
  })
})

interface FakeTreatmentsRepository {
  seed(input: TreatmentInput): Treatment
  getById: Mock<TreatmentsRepository['getById']>
  listByAnimal: Mock<TreatmentsRepository['listByAnimal']>
  create: Mock<TreatmentPlanService['create']>
  update: Mock<TreatmentPlanService['update']>
  remove: Mock<TreatmentsRepository['remove']>
  resume: Mock<TreatmentPlanService['resume']>
  listDoses: Mock<TreatmentsRepository['listDoses']>
  countDosesByAnimal: Mock<TreatmentsRepository['countDosesByAnimal']>
  getWithHistory: Mock<TreatmentsRepository['getWithHistory']>
  listWithHistoryByAnimal: Mock<TreatmentsRepository['listWithHistoryByAnimal']>
}

// Repository et service des écritures du formulaire, sans SQLite. `update` remplace l'objet : la liste du store ne bouge que si elle est relue.
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
      periodId: crypto.randomUUID(),
      frequency: input.frequency,
      lastDoseDate: input.lastDoseDate,
      nextDueDate: nextDueDate(input.lastDoseDate),
      stoppedOn: null,
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
    create: vi.fn<TreatmentPlanService['create']>(async ({ firstDoseOn, ...input }) =>
      seed({ ...input, lastDoseDate: firstDoseOn }),
    ),
    update: vi.fn<TreatmentPlanService['update']>(async (id, input) => {
      const index = treatments.findIndex(
        (treatment) => treatment.id === id && treatment.deletedAt === null,
      )
      if (index === -1) throw new Error(`Traitement introuvable : ${id}`)
      const updated: Treatment = {
        ...treatments[index]!,
        name: input.name,
        type: input.type,
        frequency: input.frequency,
        nextDueDate: input.nextDoseOn ?? treatments[index]!.nextDueDate,
        updatedAt: new Date().toISOString(),
      }
      treatments[index] = updated
      return updated
    }),
    remove: vi.fn<TreatmentsRepository['remove']>(async (id) => {
      const treatment = living().find((candidate) => candidate.id === id)
      if (treatment) treatment.deletedAt = new Date().toISOString()
    }),
    resume: vi.fn<TreatmentPlanService['resume']>(async (id, input) => {
      const treatment = living().find((candidate) => candidate.id === id)
      if (!treatment) throw new Error(`Traitement introuvable : ${id}`)
      Object.assign(treatment, {
        frequency: input.frequency,
        nextDueDate: input.firstDoseOn,
        stoppedOn: null,
      })
      return { ...treatment }
    }),
    listDoses: vi.fn<TreatmentsRepository['listDoses']>(async () => []),
    countDosesByAnimal: vi.fn<TreatmentsRepository['countDosesByAnimal']>(async () => ({})),
    getWithHistory: vi.fn<TreatmentsRepository['getWithHistory']>(async () => null),
    listWithHistoryByAnimal: vi.fn<TreatmentsRepository['listWithHistoryByAnimal']>(async () => []),
  }
}
