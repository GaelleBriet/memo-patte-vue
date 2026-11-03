import type { Line } from './types'

export const isMoreRecent = (a: Line, b: Line): boolean =>
  a.decidedAt > b.decidedAt || (a.decidedAt === b.decidedAt && a.id > b.id)

/** TR-25 : par clé, la ligne modifiée le plus récemment ; triées par jour d'échéance. */
export function latestBy(lines: readonly Line[], keyOfLine: (line: Line) => string): Line[] {
  const latest = new Map<string, Line>()
  for (const line of lines) {
    const kept = latest.get(keyOfLine(line))
    if (kept === undefined || isMoreRecent(line, kept)) latest.set(keyOfLine(line), line)
  }
  return [...latest.values()].sort((a, b) => a.dueOn.localeCompare(b.dueOn))
}
