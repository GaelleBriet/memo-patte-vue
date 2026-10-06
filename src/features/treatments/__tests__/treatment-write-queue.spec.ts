import { describe, expect, it } from 'vitest'

import { createWriteQueue } from '../logic/treatment-write-queue'

describe('createWriteQueue', () => {
  it('lance chaque tâche après la fin de la précédente', async () => {
    const queue = createWriteQueue()
    const order: string[] = []
    let release!: () => void
    const first = queue(async () => {
      order.push('début 1')
      await new Promise<void>((resolve) => (release = resolve))
      order.push('fin 1')
    })
    const second = queue(async () => {
      order.push('2')
    })

    await Promise.resolve()
    release()
    await Promise.all([first, second])

    expect(order).toEqual(['début 1', 'fin 1', '2'])
  })

  it('une tâche qui échoue rend son erreur et ne bloque pas la suivante', async () => {
    const queue = createWriteQueue()

    const failed = queue(() => Promise.reject(new Error('raté')))
    const next = queue(() => Promise.resolve('fait'))

    await expect(failed).rejects.toThrow('raté')
    await expect(next).resolves.toBe('fait')
  })
})
