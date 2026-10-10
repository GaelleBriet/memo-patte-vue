/** Ce qu'un moteur montre d'un traitement, en clés `yyyy-MM-dd HH:mm` (ou `yyyy-MM-dd` sans heure), triées. */
export type Display = {
  phase: 'upcoming' | 'today' | 'overdue' | 'ended' | 'stopped'
  finished: boolean
  current: string[]
  unlogged: string[]
  upcoming: string[]
}

export type Reading = Display | { error: string }

/** Les échéances à venir sont lues jusqu'à ce nombre de jours après aujourd'hui. */
export const HORIZON_DAYS = 120

export function dueKey({ dueOn, dueTime }: { dueOn: string; dueTime: string | null }): string {
  return dueTime === null ? dueOn : `${dueOn} ${dueTime}`
}

const FIELDS = ['phase', 'finished', 'current', 'unlogged', 'upcoming'] as const

export type Field = (typeof FIELDS)[number] | 'error'

/** Ce qui sépare deux lectures : par champ, ce que l'une montre et pas l'autre. */
export type Gap = { field: Field; onlyA: string[]; onlyB: string[] }

export function gapsBetween(a: Reading, b: Reading): Gap[] {
  if ('error' in a || 'error' in b) {
    const text = (reading: Reading) => ('error' in reading ? [reading.error] : [])
    const same = 'error' in a && 'error' in b
    return same ? [] : [{ field: 'error', onlyA: text(a), onlyB: text(b) }]
  }
  return FIELDS.flatMap((field) => {
    const [left, right] = [a[field], b[field]].map((value) =>
      Array.isArray(value) ? value : [String(value)],
    ) as [string[], string[]]
    const onlyA = left.filter((key) => !right.includes(key))
    const onlyB = right.filter((key) => !left.includes(key))
    return onlyA.length === 0 && onlyB.length === 0 ? [] : [{ field, onlyA, onlyB }]
  })
}
