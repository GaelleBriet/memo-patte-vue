export type CurrentAnimalInput = {
  selectedId: string | null
  animalIds: readonly string[]
}

/**
 * Animal dont parle l'accueil (chip, « À faire », actions rapides) : la chip
 * sélectionnée si elle est encore dans le foyer, sinon le seul animal du foyer.
 * `null` : vue « tous », l'animal d'une action rapide reste à demander.
 */
export function currentAnimalId({ selectedId, animalIds }: CurrentAnimalInput): string | null {
  if (selectedId !== null && animalIds.includes(selectedId)) return selectedId
  return animalIds.length === 1 ? animalIds[0]! : null
}
