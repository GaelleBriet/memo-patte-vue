import { describe, expect, it, vi } from 'vitest'

import { useAnimalScopedList } from '../composables/use-animal-scoped-list'

type Entry = { id: string; animalId: string }

const MILO = 'milo'
const LUNA = 'luna'

function fakeRepository(entries: Entry[] = []) {
  return {
    entries,
    listByAnimal: vi.fn<(animalId: string) => Promise<Entry[]>>(async (animalId) =>
      entries.filter((entry) => entry.animalId === animalId),
    ),
  }
}

function listOn(repository: ReturnType<typeof fakeRepository>) {
  return useAnimalScopedList(
    () => Promise.resolve(repository),
    (opened, animalId) => opened.listByAnimal(animalId),
  )
}

describe('useAnimalScopedList', () => {
  it('commence vide, sans animal ni chargement', () => {
    const list = listOn(fakeRepository())

    expect(list.items.value).toEqual([])
    expect(list.animalId.value).toBeNull()
    expect(list.isLoading.value).toBe(false)
    expect(list.hasLoaded.value).toBe(false)
    expect(list.error.value).toBeNull()
  })

  it('charge la liste de l’animal demandé', async () => {
    const list = listOn(
      fakeRepository([
        { id: 'a', animalId: MILO },
        { id: 'b', animalId: LUNA },
      ]),
    )

    expect(await list.loadForAnimal(MILO)).toBe(true)

    expect(list.animalId.value).toBe(MILO)
    expect(list.items.value).toEqual([{ id: 'a', animalId: MILO }])
    expect(list.hasLoaded.value).toBe(true)
    expect(list.isLoading.value).toBe(false)
  })

  it('ne lève pas quand le chargement échoue : renvoie faux et renseigne l’erreur', async () => {
    const repository = fakeRepository()
    repository.listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const list = listOn(repository)

    expect(await list.loadForAnimal(MILO)).toBe(false)

    expect(list.error.value?.message).toBe('base fermée')
    expect(list.hasLoaded.value).toBe(false)
    expect(list.isLoading.value).toBe(false)
  })

  it('emballe un rejet qui n’est pas une erreur', async () => {
    const repository = fakeRepository()
    repository.listByAnimal.mockReturnValueOnce(Promise.reject('verrou'))
    const list = listOn(repository)

    await list.loadForAnimal(MILO)

    expect(list.error.value).toEqual(new Error('verrou'))
  })

  it('efface l’erreur au chargement suivant réussi', async () => {
    const repository = fakeRepository()
    repository.listByAnimal.mockRejectedValueOnce(new Error('base fermée'))
    const list = listOn(repository)
    await list.loadForAnimal(MILO)

    await list.loadForAnimal(MILO)

    expect(list.error.value).toBeNull()
  })

  it('ignore la réponse puis l’échec d’un animal dépassé par un autre', async () => {
    const repository = fakeRepository([{ id: 'b', animalId: LUNA }])
    let answerMilo: (entries: Entry[]) => void = () => {}
    let failMilo: (cause: Error) => void = () => {}
    repository.listByAnimal
      .mockReturnValueOnce(
        new Promise<Entry[]>((resolve) => {
          answerMilo = resolve
        }),
      )
      .mockReturnValueOnce(
        new Promise<Entry[]>((_resolve, reject) => {
          failMilo = reject
        }),
      )
    const list = listOn(repository)

    const first = list.loadForAnimal(MILO)
    const second = list.loadForAnimal(MILO)
    await list.loadForAnimal(LUNA)
    answerMilo([{ id: 'a', animalId: MILO }])
    failMilo(new Error('base fermée'))

    expect(await first).toBe(true)
    expect(await second).toBe(false)
    expect(list.animalId.value).toBe(LUNA)
    expect(list.items.value).toEqual([{ id: 'b', animalId: LUNA }])
    expect(list.error.value).toBeNull()
  })

  it('relit la liste affichée après une écriture qui touche cet animal', async () => {
    const repository = fakeRepository()
    const list = listOn(repository)
    await list.loadForAnimal(MILO)

    const result = await list.write(
      async () => {
        repository.entries.push({ id: 'a', animalId: MILO })
        return 'écrit'
      },
      () => MILO,
    )

    expect(result).toBe('écrit')
    expect(list.items.value).toEqual([{ id: 'a', animalId: MILO }])
  })

  it('ne relit pas la liste après une écriture sur un autre animal ou sans animal', async () => {
    const repository = fakeRepository()
    const list = listOn(repository)
    await list.loadForAnimal(MILO)
    repository.listByAnimal.mockClear()

    await list.write(
      async () => null,
      () => LUNA,
    )
    await list.write(
      async () => null,
      () => null,
    )

    expect(repository.listByAnimal).not.toHaveBeenCalled()
  })

  it('passe le repository à l’écriture et le résultat au choix de l’animal touché', async () => {
    const repository = fakeRepository()
    const list = listOn(repository)
    const touched = vi.fn<(result: string) => string | null>(() => null)

    await list.write(async (opened) => (opened === repository ? 'même' : 'autre'), touched)

    expect(touched).toHaveBeenCalledWith('même')
  })

  it('reste en chargement pendant l’écriture, puis lève son erreur sans toucher à `error`', async () => {
    const list = listOn(fakeRepository())
    let seenLoading = false

    await expect(
      list.write(
        async () => {
          seenLoading = list.isLoading.value
          throw new Error('base verrouillée')
        },
        () => MILO,
      ),
    ).rejects.toThrow('base verrouillée')

    expect(seenLoading).toBe(true)
    expect(list.isLoading.value).toBe(false)
    expect(list.error.value).toBeNull()
  })
})
