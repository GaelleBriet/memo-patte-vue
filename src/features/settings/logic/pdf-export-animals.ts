import type { Animal } from '@/features/animals/schema/animal.schema'

type PdfAnimal = { id: string; name: string }

export function pdfExportAnimals(animals: readonly Animal[]): {
  followed: PdfAnimal[]
  unfollowed: PdfAnimal[]
} {
  const followed: PdfAnimal[] = []
  const unfollowed: PdfAnimal[] = []
  for (const { id, name, unfollowedOn } of animals) {
    ;(unfollowedOn === null ? followed : unfollowed).push({ id, name })
  }
  return { followed, unfollowed }
}
