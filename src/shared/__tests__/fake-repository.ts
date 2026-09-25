import { vi, type Mock } from 'vitest'

type Method = (...args: never[]) => unknown

export type FakeRepository<T> = {
  [K in keyof T]: T[K] extends Method ? Mock<T[K]> : T[K]
}

// Clés que `Promise.resolve`, Vue ou Vitest sondent : inventées, le faux passerait pour une promesse.
const PROBED_KEYS = new Set<PropertyKey>(['then', 'toJSON', 'asymmetricMatch', 'constructor'])

/**
 * Faux repository : chaque méthode fournie devient un espion qui garde son comportement, et toute
 * autre méthode est un `vi.fn()` créé au premier accès. Une méthode ajoutée au repository ne casse
 * donc aucun test qui ne s'en sert pas.
 */
export function fakeRepository<T extends object>(methods: Partial<T> = {}): FakeRepository<T> {
  const mocks = new Map<PropertyKey, unknown>(
    Object.entries(methods).map(([key, value]) => [
      key,
      typeof value === 'function' && !vi.isMockFunction(value) ? vi.fn(value as Method) : value,
    ]),
  )
  return new Proxy({} as FakeRepository<T>, {
    get(_target, key) {
      if (mocks.has(key)) return mocks.get(key)
      if (typeof key === 'symbol' || PROBED_KEYS.has(key)) return undefined
      const method = vi.fn()
      mocks.set(key, method)
      return method
    },
    has(_target, key) {
      return mocks.has(key)
    },
  })
}
