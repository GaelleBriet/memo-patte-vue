import { compareText, keyOf, shiftDate } from '@/shared/domain/treatment-schedule-dues'
import {
  firstDueOf,
  initialSequence,
  sequenceDues,
  shiftedSequence,
} from '@/shared/domain/treatment-schedule-sequence'
import type {
  Due,
  Frequency,
  Sequence,
  TreatmentPeriodInput,
} from '@/shared/domain/treatment-schedule-types'
import { anchorBefore, shiftLine, type DoseLine } from './export-upgrade-doses'

/**
 * Rejoue le moteur de la v3 (0.1.56) sur les lignes d'une période : chaque ligne y refixait la suite
 * à sa façon. Là où la suite qu'il en tirait diffère de celle que le moteur v4 lit dans les lignes
 * converties, une ligne de décalage ancre la suite v4 au même endroit.
 */
type Step = { kind: 'note' | 'move'; dose: DoseLine; position: string }
type Cursor = { dues: Generator<Due, never>; ahead: Due[] }

const COMPARED_DUES = 4

function compareCreation(a: DoseLine, b: DoseLine): number {
  return compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
}

function isMoreRecent(a: DoseLine, b: DoseLine): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)
}

/** La v3 ne lisait qu'une ligne par échéance, la plus récente. */
export function readByV3(doses: DoseLine[]): DoseLine[] {
  const latest = new Map<string, DoseLine>()
  for (const dose of doses) {
    const id = `${dose.periodId} ${keyOf(dose)}`
    const kept = latest.get(id)
    if (kept === undefined || isMoreRecent(dose, kept)) latest.set(id, dose)
  }
  return [...latest.values()]
}

function stepOf(dose: DoseLine): Step {
  if (dose.status !== 'postponed') return { kind: 'note', dose, position: `${keyOf(dose)}#1` }
  const actsOn = dose.nextDueDate < dose.dueOn ? `${dose.nextDueDate} ` : `${dose.dueOn} ~`
  return { kind: 'move', dose, position: `${actsOn}#0` }
}

function referenceOf(dose: DoseLine): string {
  return dose.status === 'given' && typeof dose.givenOn === 'string' ? dose.givenOn : dose.dueOn
}

function fixesSuiteFromItsDate(dose: DoseLine, frequency: Frequency): boolean {
  return shiftDate(referenceOf(dose), frequency, 1) === dose.nextDueDate
}

function sequenceAfter(
  { kind, dose }: Step,
  period: TreatmentPeriodInput,
  current: Sequence,
): Sequence {
  if (kind === 'move') return { origin: dose.nextDueDate, firstStep: 0, floor: current.floor }
  const reference = referenceOf(dose)
  const floor = keyOf(dose)
  const restarted = { origin: reference, firstStep: 1, floor }
  const restarts = shiftDate(reference, period.frequency, 1) === dose.nextDueDate
  const clamps = period.frequency.unit === 'month' && reference === dose.dueOn
  if (restarts && !clamps) return restarted
  const continued = { ...current, floor }
  if (firstDueOf(continued, period).dueOn === dose.nextDueDate) return continued
  return restarts ? restarted : { origin: dose.nextDueDate, firstStep: 0, floor }
}

function duesLeftBefore({ dose }: Step, cursor: Cursor): Due[] {
  const key = keyOf(dose)
  let after = cursor.ahead.at(-1)
  while (after === undefined || keyOf(after) <= key) {
    after = cursor.dues.next().value
    cursor.ahead.push(after)
  }
  return cursor.ahead.filter((due) => keyOf(due) < key)
}

function hasNoEffect(step: Step, previous: Step | undefined, left: Due[]): boolean {
  if (step.kind === 'note') return false
  const { dueOn, nextDueDate } = step.dose
  const before = [left.at(-1)?.dueOn, previous?.dose.dueOn]
    .filter((day) => day !== undefined)
    .sort(compareText)
    .at(-1)
  return nextDueDate === dueOn || (before !== undefined && nextDueDate <= before)
}

function isOvertaken(step: Step, previous: Step | undefined, frequency: Frequency): boolean {
  return (
    step.kind === 'move' &&
    previous?.kind === 'note' &&
    fixesSuiteFromItsDate(previous.dose, frequency) &&
    step.dose.nextDueDate <= referenceOf(previous.dose)
  )
}

function olderMovesOfSameDay(doses: DoseLine[]): DoseLine[] {
  const moves = doses.filter((dose) => dose.status === 'postponed')
  return moves.filter((move) =>
    moves.some((other) => other.dueOn === move.dueOn && isMoreRecent(other, move)),
  )
}

const MAX_STEPS_BACK = 12

/**
 * Ancre v4 qui redonne les échéances v3 au-delà de la journée de la ligne. En mois, aucun jour plus un
 * mois ne tombe parfois sur l'origine (le 29 mars) : on recule alors de plusieurs pas.
 */
function anchorOf(
  step: Step,
  sequence: Sequence,
  period: TreatmentPeriodInput,
  target: string[],
): string {
  const { origin } = sequence
  if (step.kind === 'move') return origin
  const candidates = [
    ...(sequence.firstStep >= 1 || origin <= step.dose.dueOn ? [origin] : []),
    anchorBefore(origin, period.frequency),
    ...Array.from({ length: MAX_STEPS_BACK }, (_, back) =>
      shiftDate(origin, period.frequency, -(back + 1)),
    ),
  ]
  const fits = (anchor: string) =>
    sameDues(
      duesAfter(
        shiftedSequence({ dueOn: step.dose.dueOn, nextDueDate: anchor }),
        period,
        step.dose.dueOn,
      ),
      target,
    )
  return candidates.find(fits) ?? candidates[0]!
}

function duesAfter(sequence: Sequence, period: TreatmentPeriodInput, day: string): string[] {
  const floor = `${day} ~`
  const dues: string[] = []
  for (const due of sequenceDues(sequence, period, day)) {
    if (keyOf(due) <= floor) continue
    dues.push(keyOf(due))
    if (dues.length === COMPARED_DUES) break
  }
  return dues
}

function sameDues(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((key, index) => key === b[index])
}

export function shiftsOfV3Period(period: TreatmentPeriodInput, lines: DoseLine[]): DoseLine[] {
  const { frequency } = period
  const doses = readByV3(lines)
  const logged = new Set(doses.filter(({ status }) => status !== 'postponed').map((d) => d.dueOn))
  const isLoggedMove = (dose: DoseLine) =>
    dose.status === 'postponed' && logged.has(dose.nextDueDate)
  const stale = new Set(olderMovesOfSameDay(doses).filter((dose) => !isLoggedMove(dose)))
  const steps = doses
    .filter((dose) => !stale.has(dose))
    .map(stepOf)
    .sort((a, b) => compareText(a.position, b.position) || compareCreation(a.dose, b.dose))

  const shifts = new Map<string, DoseLine>()
  let previous: Step | undefined
  let old = initialSequence(period)
  let cursor: Cursor = { dues: sequenceDues(old, period), ahead: [] }
  let current = old
  for (const step of steps) {
    const left = duesLeftBefore(step, cursor)
    const isStale = hasNoEffect(step, previous, left) || isOvertaken(step, previous, frequency)
    if (isStale && !isLoggedMove(step.dose)) continue
    old = sequenceAfter(step, period, old)
    cursor = { dues: sequenceDues(old, period), ahead: [] }
    previous = step
    const { dueOn } = step.dose
    const target =
      step.kind === 'move'
        ? duesAfter(shiftedSequence({ dueOn, nextDueDate: old.origin }), period, dueOn)
        : duesAfter(old, period, dueOn)
    if (sameDues(target, duesAfter(current, period, dueOn))) continue
    const anchor = anchorOf(step, old, period, target)
    const wanted = shiftedSequence({ dueOn, nextDueDate: anchor })
    shifts.set(dueOn, shiftLine(step.dose, step.dose, anchor))
    current = wanted
  }
  return [...shifts.values()]
}
