import { z } from 'zod'

import { treatmentFrequencySchema } from './treatment.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import type { GridBefore } from '@/shared/domain/dose-calendar'
import { instantSchema } from '@/shared/domain/instant'

/** Au-delà, la grille gardée se lit vide : elle ne sert qu'à une réécriture le jour même. */
export const MAX_GRID_BEFORE_LENGTH = 20_000

const day = z.string().refine(isCalendarDay)

const run = z.tuple([day, day.nullable()]).refine(([from, to]) => to === null || from <= to)

const inOrder = (runs: readonly (readonly [string, string | null])[]) =>
  runs.every(([from], index) => {
    if (index === 0) return true
    const previousEnd = runs[index - 1]![1]
    return previousEnd !== null && previousEnd < from
  })

export const gridBeforeSchema = z
  .object({
    frequency: treatmentFrequencySchema,
    endsOn: day.nullable(),
    writtenAt: instantSchema,
    runs: z.array(run).refine(inOrder),
  })
  .strict()

/** La grille telle que la colonne `grid_before` la garde. */
export function gridBeforeColumn(grid: GridBefore | null): string | null {
  return grid === null ? null : JSON.stringify(grid)
}

/** Une valeur illisible ou trop longue se lit vide, sans erreur : elle ne fait que priver d'héritage. */
export function gridBeforeFromValue(value: unknown): GridBefore | null {
  const text = JSON.stringify(value ?? null)
  if (text.length > MAX_GRID_BEFORE_LENGTH) return null
  const parsed = gridBeforeSchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

/** La colonne `grid_before` relue : même règle qu'à l'import. */
export function gridBeforeFromColumn(column: unknown): GridBefore | null {
  if (typeof column !== 'string' || column.length > MAX_GRID_BEFORE_LENGTH) return null
  try {
    return gridBeforeFromValue(JSON.parse(column))
  } catch {
    return null
  }
}
