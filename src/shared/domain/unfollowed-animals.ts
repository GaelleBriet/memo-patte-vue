export type UnfollowedEntry = {
  count: number
  target: { kind: 'carnet'; animalId: string } | { kind: 'list' }
}

/** AN-10 : la ligne « Animaux que tu ne suis plus (N) » ouvre le carnet s'il n'y en a qu'un. */
export function unfollowedEntry(unfollowed: readonly { id: string }[]): UnfollowedEntry | null {
  const [only] = unfollowed
  if (only === undefined) return null
  return {
    count: unfollowed.length,
    target: unfollowed.length === 1 ? { kind: 'carnet', animalId: only.id } : { kind: 'list' },
  }
}
