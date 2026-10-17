import type { Line, Setting } from './types'

/** #867 : la réécriture d'un réglage contre un report ou un décalage écrit sous lui : `line`, la ligne
 * plus récente l'emporte ; `rewrite`, elle est sans effet. */
export function rewriteVerdict(line: Line, written: Setting): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn || line.dueOn >= firstDueOn) return null
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}
