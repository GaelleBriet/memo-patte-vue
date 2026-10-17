import type { Line, Setting } from './types'

/**
 * #867, principe du 17 octobre 2026 : la réécriture d'un réglage a ôté du calendrier la journée d'un
 * report ou d'un décalage écrit sous lui. `line` : la ligne, plus récente, l'emporte et garde sa
 * journée telle qu'écrite ; `rewrite` : elle est sans effet.
 */
export function rewriteVerdict(line: Line, written: Setting): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn || line.dueOn >= firstDueOn) return null
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}
