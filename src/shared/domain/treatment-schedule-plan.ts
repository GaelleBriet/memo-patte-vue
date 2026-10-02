import { compareText, dueId, keyOf, latestOf, uniqueSorted } from './treatment-schedule-dues'
import {
  cursorOn,
  duesLeftBefore,
  fixesSuiteFromItsDate,
  initialSequence,
  referenceOf,
  sequenceAfter,
  sequenceDues,
} from './treatment-schedule-sequence'
import type {
  Due,
  Frequency,
  PeriodPlan,
  Sequence,
  Step,
  TreatmentDoseInput,
  TreatmentPeriodInput,
  Window,
} from './treatment-schedule-types'

function compareDoses(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return (
    compareText(keyOf(a), keyOf(b)) ||
    compareText(a.createdAt, b.createdAt) ||
    compareText(a.id, b.id)
  )
}

function isMoreRecent(a: TreatmentDoseInput, b: TreatmentDoseInput): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)
}

export function mergeDoses(doses: readonly TreatmentDoseInput[]): TreatmentDoseInput[] {
  const latest = new Map<string, TreatmentDoseInput>()
  for (const dose of doses) {
    const kept = latest.get(dueId(dose))
    if (kept === undefined || isMoreRecent(dose, kept)) latest.set(dueId(dose), dose)
  }
  return [...latest.values()].sort(compareDoses)
}

export function orderPeriods(periods: readonly TreatmentPeriodInput[]): TreatmentPeriodInput[] {
  return [...periods].sort(
    (a, b) =>
      compareText(a.startsOn, b.startsOn) ||
      compareText(a.createdAt, b.createdAt) ||
      compareText(a.id, b.id),
  )
}

export function positionOf(key: string, rank: 0 | 1): string {
  return `${key}#${rank}`
}

export function compareCreation(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
}

// Avancé (Q17), un déplacement agit au début de sa nouvelle date ; reporté, après les prises de son jour d'origine.
function stepOf(dose: TreatmentDoseInput): Step {
  if (dose.status !== 'postponed') {
    return { kind: 'note', dose, position: positionOf(keyOf(dose), 1) }
  }
  const actsOn = dose.nextDueDate < dose.dueOn ? `${dose.nextDueDate} ` : `${dose.dueOn} ~`
  return { kind: 'move', dose, position: positionOf(actsOn, 0) }
}

function stepsOf(doses: TreatmentDoseInput[]): Step[] {
  return doses
    .map(stepOf)
    .sort((a, b) => compareText(a.position, b.position) || compareCreation(a.dose, b.dose))
}

function isNote(step: Step): boolean {
  return step.kind === 'note'
}

export function isMove(step: Step): boolean {
  return step.kind === 'move'
}

// Un report laisse tomber l'échéance qu'il remplace ; une dose avancée, non.
export function hasFallen({ kind, dose }: Step): boolean {
  return kind === 'note' || dose.nextDueDate > dose.dueOn
}

// TR-24 bis : un déplacement qui ne tombe plus après la prise qui fixait sa suite est dépassé.
function isOvertaken(step: Step, previous: Step | undefined, frequency: Frequency): boolean {
  return (
    step.kind === 'move' &&
    previous?.kind === 'note' &&
    fixesSuiteFromItsDate(previous.dose, frequency) &&
    step.dose.nextDueDate <= referenceOf(previous.dose)
  )
}

// Sans effet : revenu à sa date d'origine, ou arrivé sur ce qui le précède (dose sans prise, ligne d'avant).
function hasNoEffect(step: Step, previous: Step | undefined, left: Due[]): boolean {
  if (step.kind === 'note') return false
  const { dueOn, nextDueDate } = step.dose
  const before = latestOf([left.at(-1)?.dueOn, previous?.dose.dueOn])
  return nextDueDate === dueOn || (before !== undefined && nextDueDate <= before)
}

// Q21 : la journée part avec sa première heure sans prise.
function leavesWith(move: TreatmentDoseInput, due: Due): boolean {
  return due.dueOn === move.dueOn && keyOf(due) >= keyOf(move)
}

// Q24 : les prises du jour du changement comptent pour les premières heures du nouveau réglage.
function coveredKeys(period: TreatmentPeriodInput, notedThatDay: number): Set<string> {
  if (period.firstDueOn !== period.startsOn) return new Set()
  const times = period.times.length === 0 ? [null] : [...period.times].sort(compareText)
  return new Set(
    times.slice(0, notedThatDay).map((dueTime) => keyOf({ dueOn: period.startsOn, dueTime })),
  )
}

// Q21 : une journée n'a qu'une ligne de déplacement, la plus récente ; les autres sont sans effet.
function olderMovesOfSameDay(doses: TreatmentDoseInput[]): TreatmentDoseInput[] {
  const moves = doses.filter((dose) => dose.status === 'postponed')
  return moves.filter((move) =>
    moves.some((other) => other.dueOn === move.dueOn && isMoreRecent(other, move)),
  )
}

export function planPeriod(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
  notedOnStart: number,
): PeriodPlan {
  const steps: Step[] = []
  // Q25 : sa dose d'arrivée notée, un déplacement reste dans l'historique, jamais dépassé ni sans effet.
  const logged = new Set(
    doses.filter((dose) => dose.status !== 'postponed').map((dose) => dose.dueOn),
  )
  const isLoggedMove = (dose: TreatmentDoseInput) =>
    dose.status === 'postponed' && logged.has(dose.nextDueDate)
  const stale = olderMovesOfSameDay(doses).filter((dose) => !isLoggedMove(dose))
  const anchors: PeriodPlan['anchors'] = []
  let between: Due[] = []
  let sequence = initialSequence(period)
  let cursor = cursorOn(sequence, period)
  for (const step of stepsOf(doses.filter((dose) => !stale.includes(dose)))) {
    const previous = steps.at(-1)
    const left = duesLeftBefore(step, cursor)
    const isStale =
      hasNoEffect(step, previous, left) || isOvertaken(step, previous, period.frequency)
    if (isStale && !isLoggedMove(step.dose)) {
      stale.push(step.dose)
      continue
    }
    between.push(...left)
    if (step.kind === 'move') between = between.filter((due) => !leavesWith(step.dose, due))
    sequence = sequenceAfter(step, period, sequence)
    cursor = cursorOn(sequence, period)
    anchors.push({ position: step.position, sequence })
    steps.push(step)
  }
  const notes = steps.filter(isNote).map(({ dose }) => dose)
  return {
    period,
    closesOn,
    steps,
    stale,
    anchors,
    between,
    noteKeys: new Set(notes.map(keyOf)),
    noteDays: new Set(notes.map((dose) => dose.dueOn)),
    covered: coveredKeys(period, notedOnStart),
    fallenKeys: steps
      .filter(hasFallen)
      .map(({ dose }) => keyOf(dose))
      .sort(compareText),
  }
}

export function closingDay(
  period: TreatmentPeriodInput,
  next: TreatmentPeriodInput | undefined,
): string | null {
  const bounds = [period.stoppedOn, next?.startsOn ?? null].filter((day) => day !== null)
  return bounds.sort(compareText)[0] ?? null
}

function isWithinPeriod(plan: PeriodPlan, dueOn: string): boolean {
  const { endsOn } = plan.period
  return (endsOn === null || dueOn <= endsOn) && (plan.closesOn === null || dueOn < plan.closesOn)
}

export function sequenceAt(plan: PeriodPlan, position: string): Sequence {
  let low = 0
  let high = plan.anchors.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((plan.anchors[middle]?.position ?? position) < position) low = middle + 1
    else high = middle
  }
  return plan.anchors[low - 1]?.sequence ?? initialSequence(plan.period)
}

// Une période ouverte sans date de fin est infinie : `to` ou `limit` la bornent.
export function pendingDues(plan: PeriodPlan, { from = '', to, limit = Infinity }: Window): Due[] {
  const isPending = (due: Due) =>
    isWithinPeriod(plan, due.dueOn) &&
    !plan.noteKeys.has(keyOf(due)) &&
    !plan.covered.has(keyOf(due)) &&
    due.dueOn >= from &&
    (to === undefined || due.dueOn <= to)
  const tail: Due[] = []
  const lastSequence = plan.anchors.at(-1)?.sequence ?? initialSequence(plan.period)
  for (const due of sequenceDues(lastSequence, plan.period, from)) {
    if (!isWithinPeriod(plan, due.dueOn) || (to !== undefined && due.dueOn > to)) break
    if (tail.length >= limit) break
    if (isPending(due)) tail.push(due)
  }
  return uniqueSorted([...plan.between.filter(isPending), ...tail]).slice(0, limit)
}

export function notesOf(plan: PeriodPlan): TreatmentDoseInput[] {
  return plan.steps.filter(isNote).map(({ dose }) => dose)
}
