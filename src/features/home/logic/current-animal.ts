export type CurrentAnimalInput = {
  selectedId: string | null
  animalIds: readonly string[]
}

/** La chip sélectionnée si elle est encore dans le foyer, sinon le seul animal ; `null` : vue « tous ». */
export function currentAnimalId({ selectedId, animalIds }: CurrentAnimalInput): string | null {
  if (selectedId !== null && animalIds.includes(selectedId)) return selectedId
  return animalIds.length === 1 ? animalIds[0]! : null
}
