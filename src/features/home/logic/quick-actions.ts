export type QuickActionAnimalInput = {
  selectedId: string | null
  animalIds: readonly string[]
}

/**
 * Animal visé par « Nouveau traitement » ou « Rappel de vaccin » : la chip
 * sélectionnée si elle est encore dans le foyer, sinon le seul animal du foyer.
 * `null` : l'écran doit le demander.
 */
export function quickActionAnimalId({
  selectedId,
  animalIds,
}: QuickActionAnimalInput): string | null {
  if (selectedId !== null && animalIds.includes(selectedId)) return selectedId
  return animalIds.length === 1 ? animalIds[0]! : null
}
