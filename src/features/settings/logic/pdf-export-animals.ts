import type { Animal } from '@/features/animals/schema/animal.schema'

export function followedPdfAnimals(animals: readonly Animal[]): { id: string; name: string }[] {
  return animals.map(({ id, name }) => ({ id, name }))
}
