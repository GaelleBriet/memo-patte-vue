import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { keyOf, shiftDate, toDate } from './treatment-schedule-dues'
import type {
  Due,
  Frequency,
  Sequence,
  Step,
  TreatmentDoseInput,
  TreatmentPeriodInput,
} from './treatment-schedule-types'

export function referenceOf(dose: TreatmentDoseInput): string {
  return dose.status === 'given' && dose.givenOn !== null ? dose.givenOn : dose.dueOn
}

export function fixesSuiteFromItsDate(dose: TreatmentDoseInput, frequency: Frequency): boolean {
  return shiftDate(referenceOf(dose), frequency, 1) === dose.nextDueDate
}

export function initialSequence(period: TreatmentPeriodInput): Sequence {
  return { origin: period.firstDueOn, firstStep: 0, floor: '' }
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

export function sequenceAfter(
  { kind, dose }: Step,
  period: TreatmentPeriodInput,
  current: Sequence,
): Sequence {
  if (kind === 'move') return { origin: dose.nextDueDate, firstStep: 0, floor: current.floor }
  const reference = referenceOf(dose)
  const floor = keyOf(dose)
  const restarted = { origin: reference, firstStep: 1, floor }
  const restarts = shiftDate(reference, period.frequency, 1) === dose.nextDueDate
  if (restarts && period.frequency.unit !== 'month') return restarted
  // En mois, le 31 août plus 1 mois vaut aussi le 30 sept. de la suite du 30 : la suite qui continue l'emporte.
  const continued = { ...current, floor }
  if (firstDueOf(continued, period).dueOn === dose.nextDueDate) return continued
  return restarts ? restarted : { origin: dose.nextDueDate, firstStep: 0, floor }
}

// Les échéances déjà produites restent sous la main : une ligne sans effet ne fait rien recalculer.
type Cursor = { dues: Generator<Due, never>; ahead: Due[] }

export function cursorOn(sequence: Sequence, period: TreatmentPeriodInput): Cursor {
  return { dues: sequenceDues(sequence, period), ahead: [] }
}

export function duesLeftBefore({ dose }: Step, cursor: Cursor): Due[] {
  const key = keyOf(dose)
  let after = cursor.ahead.at(-1)
  while (after === undefined || keyOf(after) <= key) {
    after = cursor.dues.next().value
    cursor.ahead.push(after)
  }
  return cursor.ahead.filter((due) => keyOf(due) < key)
}
