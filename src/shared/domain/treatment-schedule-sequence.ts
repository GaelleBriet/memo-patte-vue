import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { previousDay, toDate } from './calendar-day'
import { shiftDate } from './treatment-frequency'
import { keyOf } from './treatment-schedule-dues'
import type {
  Due,
  Frequency,
  Sequence,
  TreatmentDoseInput,
  TreatmentPeriodInput,
} from './treatment-schedule-types'

// La grille part du jour de référence quand elle passe par la première échéance (le 31 d'un mensuel).
// Hors de la grille (G23), la première échéance est seule et la grille reprend après elle.
export function initialSequence(period: TreatmentPeriodInput): Sequence {
  const { firstDueOn, referenceOn } = period
  if (referenceOn === firstDueOn) return { origin: firstDueOn, firstStep: 0, floor: '' }
  if (referenceOn < firstDueOn) {
    const fromReference = {
      origin: referenceOn,
      firstStep: 0,
      floor: `${previousDay(firstDueOn)} ~`,
    }
    if (firstDueOf(fromReference, period).dueOn === firstDueOn) return fromReference
  }
  return {
    origin: referenceOn,
    firstStep: referenceOn > firstDueOn ? 1 : 0,
    floor: `${firstDueOn} ~`,
  }
}

export function isOffGrid(period: TreatmentPeriodInput): boolean {
  return firstDueOf(initialSequence(period), period).dueOn !== period.firstDueOn
}

// Après la journée d'origine (`floor`), les échéances suivent le rythme ancré : ancrage + 1 pas, + 2 pas…
export function shiftedSequence(
  shift: Pick<TreatmentDoseInput, 'dueOn' | 'nextDueDate'>,
  floor = `${shift.dueOn} ~`,
): Sequence {
  return { origin: shift.nextDueDate, firstStep: 1, floor }
}

function firstStepFrom(sequence: Sequence, { value, unit }: Frequency, day: string): number {
  if (day <= sequence.origin) return sequence.firstStep
  const origin = toDate(sequence.origin)
  const target = toDate(day)
  const elapsed =
    unit === 'month'
      ? differenceInCalendarMonths(target, origin)
      : differenceInCalendarDays(target, origin) / (unit === 'week' ? 7 : 1)
  return Math.max(sequence.firstStep, Math.floor(elapsed / value) - 1)
}

export function* sequenceDues(
  sequence: Sequence,
  period: TreatmentPeriodInput,
  fromDay = '',
): Generator<Due, never> {
  const times = period.times.length > 0 ? [...period.times].sort() : [null]
  const floorDay = sequence.floor.slice(0, 10)
  const startDay = fromDay > floorDay ? fromDay : floorDay
  for (let step = firstStepFrom(sequence, period.frequency, startDay); ; step += 1) {
    const dueOn = shiftDate(sequence.origin, period.frequency, step)
    for (const dueTime of times) {
      const due = { periodId: period.id, dueOn, dueTime }
      if (keyOf(due) > sequence.floor) yield due
    }
  }
}

export function firstDueOf(sequence: Sequence, period: TreatmentPeriodInput): Due {
  return sequenceDues(sequence, period).next().value
}

// Échéances d'une suite jusqu'au début de la suivante (`end`, clé incluse).
export function duesUntil(sequence: Sequence, period: TreatmentPeriodInput, end: string): Due[] {
  const dues: Due[] = []
  for (const due of sequenceDues(sequence, period)) {
    if (keyOf(due) > end) break
    dues.push(due)
  }
  return dues
}
