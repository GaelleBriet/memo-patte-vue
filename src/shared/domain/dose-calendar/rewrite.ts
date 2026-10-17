import type { Line, Setting } from './types'

/**
 * #867, principe du 17 octobre 2026 : la réécriture d'un réglage a ôté du calendrier la journée d'une
 * ligne écrite sous lui. `line` : la ligne l'emporte et garde son échéance telle qu'écrite (une prise
 * donnée toujours, un report ou un décalage plus récent) ; `rewrite` : elle est sans effet.
 */
export function rewriteVerdict(line: Line, written: Setting): 'line' | 'rewrite' | null {
  const { updatedAt, createdAt, startsOn, firstDueOn } = written
  if (updatedAt === undefined || updatedAt <= createdAt) return null
  if (line.dueOn < startsOn || line.dueOn >= firstDueOn) return null
  if (line.status === 'given') return 'line'
  return line.updatedAt > updatedAt ? 'line' : 'rewrite'
}
