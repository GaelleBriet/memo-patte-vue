export const USER_ID = '4d1c6a52-8f0e-4b8e-9a51-2f6a3c9d7e10'
export const OTHER_USER_ID = '9b2e7f14-3c5a-4d6b-8e1f-0a7c2d4e6f81'

export type MemoryStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> & {
  keys(): string[]
}

export function memoryStorage(): MemoryStorage {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
    removeItem: (key) => void items.delete(key),
    keys: () => [...items.keys()],
  }
}
