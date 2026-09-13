export type QuickActionAnimalInput = {
  selectedId: string | null
  animalIds: readonly string[]
}

/**
 * Animal visé par « Nouveau traitement » ou « Rappel de vaccin » : la chip
 * sélectionnée, sinon le seul animal du foyer. `null` : l'écran doit le demander.
 */
export function quickActionAnimalId({
  selectedId,
  animalIds,
}: QuickActionAnimalInput): string | null {
  if (selectedId !== null) return selectedId
  return animalIds.length === 1 ? animalIds[0]! : null
}
