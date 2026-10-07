/** Animal affiché par le Carnet quand `leavingId` le quitte ; `null` : il ne reste aucun animal suivi. */
export function nextFollowedAnimalId(
  followed: readonly { id: string }[],
  leavingId: string,
): string | null {
  return followed.find(({ id }) => id !== leavingId)?.id ?? null
}
