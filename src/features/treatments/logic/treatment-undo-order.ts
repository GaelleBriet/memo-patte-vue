/**
 * TR-25 : rang de chaque ligne, de la moins à la plus récemment modifiée ; « Annuler » les date dans
 * cet ordre pour que la ligne en vigueur avant le geste le soit de nouveau. Même instant, même rang.
 */
export function undoRanks(
  lines: readonly { id: string; updatedAt: string }[],
): (id: string) => number {
  const stamps = [...new Set(lines.map(({ updatedAt }) => updatedAt))].sort()
  const byId = new Map(lines.map(({ id, updatedAt }) => [id, stamps.indexOf(updatedAt)]))
  return (id) => byId.get(id)!
}

/** L'instant d'écriture d'une ligne de rang `rank` : `at` plus `rank` millisecondes. */
export function rankedStamp(at: string, rank = 0): string {
  return rank === 0 ? at : new Date(Date.parse(at) + rank).toISOString()
}
