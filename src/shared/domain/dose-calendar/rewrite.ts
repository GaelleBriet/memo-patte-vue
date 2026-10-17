import type { Line, Setting } from './types'

/** #867, #882 : la réécriture d'un réglage contre un report ou un décalage écrit sous lui, dont elle a
 * ôté la journée de départ : `line`, la ligne plus récente l'emporte ; `rewrite`, elle est sans effet.
 * `inForce` : le réglage en vigueur ce jour-là ; après la première échéance, seul le réglage réécrit
 * lui-même contredit la ligne. */
export function rewriteVerdict(
  line: Line,
  written: Setting,
  inForce: Setting | undefined,
): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn) return null
  if (line.dueOn >= firstDueOn && inForce?.id !== written.id) return null
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}
