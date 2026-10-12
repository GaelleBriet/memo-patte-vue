import type { TreatmentPeriodInput } from '@/shared/domain/treatment-schedule'

import { shifted, type Book } from './carnet'
import { idleShiftIds } from './ecarts-lignes'

type Period = TreatmentPeriodInput

export const sameFrequency = (a: Period, b: Period) =>
  a.frequency.value === b.frequency.value && a.frequency.unit === b.frequency.unit

function onLattice(origin: string, period: Period, day: string): boolean {
  let reached = origin
  for (let step = 1; reached < day; step += 1) reached = shifted(origin, period.frequency, step)
  return reached === day
}

// La grille d'une période comme le moteur actuel la lit : sa première échéance, puis la grille de
// `referenceOn` quand elle la suit (G23) ou passe par elle, sinon celle de la première échéance.
export function ownGrid(period: Period, day: string): boolean {
  const { firstDueOn, referenceOn } = period
  if (day <= firstDueOn) return day === firstDueOn
  if (referenceOn > firstDueOn) return day >= referenceOn && onLattice(referenceOn, period, day)
  const origin = onLattice(referenceOn, period, firstDueOn) ? referenceOn : firstDueOn
  return onLattice(origin, period, day)
}

// R3, R6 : la grille en vigueur avant le changement, celle du premier réglage d'une suite de même
// fréquence, chaque décalage que le moteur v2 applique la faisant repartir de son ancrage.
export function inForceGrid(book: Book, before: Period[], day: string): boolean {
  const last = before.at(-1)
  if (last === undefined) return false
  let first = before.length - 1
  while (first > 0 && sameFrequency(before[first - 1]!, last)) first -= 1
  const ids = new Set(before.slice(first).map(({ id }) => id))
  const idle = idleShiftIds(book)
  const turn = book.doses
    .filter((line) => line.status === 'shift' && ids.has(line.periodId) && line.dueOn < day)
    .filter(({ id }) => !idle.has(id))
    .sort((a, b) => a.dueOn.localeCompare(b.dueOn))
    .at(-1)
  const head = before[first]!
  if (turn === undefined) {
    return ownGrid(head, day) || (day < head.firstDueOn && onLattice(day, head, head.firstDueOn))
  }
  return day > turn.nextDueDate && onLattice(turn.nextDueDate, last, day)
}
