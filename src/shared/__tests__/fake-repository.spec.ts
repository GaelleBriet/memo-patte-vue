// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'

import { fakeRepository } from './fake-repository'

interface Repository {
  list(animalId: string): Promise<string[]>
  remove(id: string): Promise<void>
}

describe('fakeRepository', () => {
  it('garde le comportement des méthodes fournies et les espionne', async () => {
    const repository = fakeRepository<Repository>({ list: async (id) => [`${id}-a`] })

    await expect(repository.list('milo')).resolves.toEqual(['milo-a'])
    expect(repository.list).toHaveBeenCalledWith('milo')
  })

  it('invente un espion stable pour une méthode non fournie', async () => {
    const repository = fakeRepository<Repository>()

    await repository.remove('p1')

    expect(repository.remove).toHaveBeenCalledWith('p1')
    expect(vi.isMockFunction(repository.remove)).toBe(true)
  })

  it('ne passe pas pour une promesse : `await` rend le faux lui-même', async () => {
    const repository = fakeRepository<Repository>()

    await expect(Promise.resolve(repository)).resolves.toBe(repository)
  })

  it('reprend tel quel un espion fourni', () => {
    const list = vi.fn<Repository['list']>()

    expect(fakeRepository<Repository>({ list }).list).toBe(list)
  })
})
