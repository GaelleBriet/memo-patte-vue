import type { Animal } from '@/features/animals/schema/animal.schema'

export type PdfExportAnimal = { id: string; name: string }

export type PdfExportChoice = { kind: 'one'; name: string } | { kind: 'allOrOne' | 'oneOfSeveral' }

export function pdfExportChoice(
  followed: readonly PdfExportAnimal[],
  unfollowed: readonly PdfExportAnimal[],
): PdfExportChoice | null {
  const every = [...followed, ...unfollowed]
  if (every.length === 0) return null
  if (every.length === 1) return { kind: 'one', name: every[0]!.name }
  return { kind: followed.length >= 2 ? 'allOrOne' : 'oneOfSeveral' }
}

export function toPdfExportAnimals(animals: readonly Animal[]): PdfExportAnimal[] {
  return animals.map(({ id, name }) => ({ id, name }))
}
