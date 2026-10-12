import type { Due, TreatmentView, TreatmentViewInput } from '@/shared/domain/dose-calendar'

import { plusDays } from './carnet'
import { dueKey, HORIZON_DAYS, type Display } from './display'

/** Un invariant de la campagne v2 (plan §6.3) qui ne tient pas, avec ce qui le montre. */
export type Broken = { invariant: string; detail: string }

export const horizonOf = (input: TreatmentViewInput) => plusDays(input.today, HORIZON_DAYS)
export const firstDayOf = (input: TreatmentViewInput) =>
  input.settings.flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn]).sort()[0]!

export function displayOf(view: TreatmentView, until: string): Display {
  const keys = (dues: Due[]) => dues.map(dueKey).sort()
  return {
    phase: view.phase,
    finished: view.finished,
    current: keys(view.currentDoses),
    unlogged: keys(view.unloggedDoses),
    upcoming: keys(view.upcoming({ to: until })),
  }
}

/** Le calendrier entier jusqu'à l'horizon (échéances et états) et l'effet de chaque ligne, sans identifiants. */
export function calendarOf(
  view: TreatmentView,
  input: TreatmentViewInput,
  until: string,
): string[] {
  const slots = view
    .slots(firstDayOf(input), until)
    .map(({ due, state }) => `${dueKey(due)} ${state}`)
  const history = view.history
    .map(({ line, effect }) =>
      JSON.stringify([line.status, line.dueOn, line.dueTime, line.givenOn, line.targetOn, effect]),
    )
    .sort()
  return [...slots, ...history]
}

export function compare(invariant: string, a: unknown, b: unknown): Broken | null {
  const [left, right] = [JSON.stringify(a), JSON.stringify(b)]
  return left === right
    ? null
    : { invariant, detail: `${left.slice(0, 600)}\n≠ ${right.slice(0, 600)}` }
}
