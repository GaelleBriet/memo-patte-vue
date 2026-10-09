import { compareOrdinal } from './calendar-day'
import { dueId, dueOf, keyOf, uniqueSorted } from './treatment-schedule-dues'
import {
  duesUntil,
  initialSequence,
  isOffGrid,
  sequenceDues,
  shiftedSequence,
} from './treatment-schedule-sequence'
import type {
  DoseStatus,
  Due,
  PeriodTimeline,
  Sequence,
  Step,
  TreatmentDoseInput,
  TreatmentPeriodInput,
  Window,
} from './treatment-schedule-types'

function compareDoses(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return (
    compareOrdinal(keyOf(a), keyOf(b)) ||
    compareOrdinal(a.createdAt, b.createdAt) ||
    compareOrdinal(a.id, b.id)
  )
}

function isMoreRecent(a: TreatmentDoseInput, b: TreatmentDoseInput): boolean {
  return a.updatedAt > b.updatedAt || (a.updatedAt === b.updatedAt && a.id > b.id)
}

/** Prise, prise en plus, report, décalage : chaque famille se fusionne à part sur une même échéance. */
export type Family = 'note' | 'extra' | 'move' | 'shift'

const FAMILIES: Record<DoseStatus, Family> = {
  given: 'note',
  missed: 'note',
  extra: 'extra',
  postponed: 'move',
  shift: 'shift',
}

export function familyOf({ status }: Pick<TreatmentDoseInput, 'status'>): Family {
  return FAMILIES[status]
}

export function isNoteLine(dose: Pick<TreatmentDoseInput, 'status'>): boolean {
  return familyOf(dose) === 'note'
}

export function isShiftLine(dose: Pick<TreatmentDoseInput, 'status'>): boolean {
  return dose.status === 'shift'
}

export function isExtraLine(dose: Pick<TreatmentDoseInput, 'status'>): boolean {
  return dose.status === 'extra'
}

export function mergeDoses(doses: readonly TreatmentDoseInput[]): TreatmentDoseInput[] {
  const latest = new Map<string, TreatmentDoseInput>()
  for (const dose of doses) {
    const id = `${dueId(dose)} ${familyOf(dose)}`
    const kept = latest.get(id)
    if (kept === undefined || isMoreRecent(dose, kept)) latest.set(id, dose)
  }
  return [...latest.values()].sort(compareDoses)
}

export function orderPeriods(periods: readonly TreatmentPeriodInput[]): TreatmentPeriodInput[] {
  return [...periods].sort(
    (a, b) =>
      compareOrdinal(a.startsOn, b.startsOn) ||
      compareOrdinal(a.createdAt, b.createdAt) ||
      compareOrdinal(a.id, b.id),
  )
}

export function positionOf(key: string, rank: 0 | 1): string {
  return `${key}#${rank}`
}

export function compareCreation(a: TreatmentDoseInput, b: TreatmentDoseInput): number {
  return compareOrdinal(a.createdAt, b.createdAt) || compareOrdinal(a.id, b.id)
}

// Avancé (Q17), un report agit au début de sa nouvelle date ; reporté, après les prises de son jour
// d'origine. Un décalage agit après toute sa journée d'origine, et après le report de cette journée.
function stepOf(dose: TreatmentDoseInput): Step {
  switch (familyOf(dose)) {
    case 'move': {
      const actsOn = dose.nextDueDate < dose.dueOn ? `${dose.nextDueDate} ` : `${dose.dueOn} ~`
      return { kind: 'move', dose, position: positionOf(actsOn, 0) }
    }
    case 'shift':
      return { kind: 'shift', dose, position: positionOf(`${dose.dueOn} ~`, 1) }
    default:
      return { kind: 'note', dose, position: positionOf(keyOf(dose), 1) }
  }
}

function stepsOf(doses: TreatmentDoseInput[]): Step[] {
  return doses
    .map(stepOf)
    .sort((a, b) => compareOrdinal(a.position, b.position) || compareCreation(a.dose, b.dose))
}

function isNote(step: Step): boolean {
  return step.kind === 'note'
}

export function isMove(step: Step): boolean {
  return step.kind === 'move'
}

export function isShift(step: Step): boolean {
  return step.kind === 'shift'
}

// Un report laisse tomber l'échéance qu'il remplace ; une dose avancée, non ; un décalage n'est pas une dose.
export function hasFallen({ kind, dose }: Step): boolean {
  return kind === 'note' || (kind === 'move' && dose.nextDueDate > dose.dueOn)
}

export function sameTimes(
  a: Pick<TreatmentPeriodInput, 'times'>,
  b: Pick<TreatmentPeriodInput, 'times'>,
): boolean {
  return [...a.times].sort().join() === [...b.times].sort().join()
}

export function sameRhythm(
  a: Pick<TreatmentPeriodInput, 'frequency' | 'times'>,
  b: Pick<TreatmentPeriodInput, 'frequency' | 'times'>,
): boolean {
  return (
    a.frequency.value === b.frequency.value &&
    a.frequency.unit === b.frequency.unit &&
    sameTimes(a, b)
  )
}

// Q24, G24 : les prises de la première journée couvrent les premières heures du nouveau réglage (G4).
// G22 : au même rythme, une prise d'une ancienne période couvre son heure, chaque journée de la nouvelle.
export function coveredKeys(
  period: TreatmentPeriodInput,
  previous: TreatmentPeriodInput | undefined,
  earlierNotes: readonly TreatmentDoseInput[],
): Set<string> {
  const keepsRhythm = previous !== undefined && sameRhythm(previous, period)
  const keepsTimes = previous !== undefined && sameTimes(previous, period)
  const times = period.times.length === 0 ? [null] : [...period.times].sort(compareOrdinal)
  const days = keepsRhythm
    ? uniqueDays(earlierNotes.filter(({ dueOn }) => dueOn >= period.startsOn))
    : startedDays(period)
  return new Set(
    days.flatMap((day) => {
      const ofDay = earlierNotes.filter(({ dueOn }) => dueOn === day)
      const exact = keepsTimes
        ? times.filter((time) => ofDay.some(({ dueTime }) => dueTime === time))
        : []
      const earliest = times.filter((time) => !exact.includes(time))
      const covered = [...exact, ...earliest.slice(0, ofDay.length - exact.length)]
      return covered.map((dueTime) => keyOf({ dueOn: day, dueTime }))
    }),
  )
}

// G24 : un jour de référence avant la première échéance marque la journée entamée en avance qui
// ouvre la période, à rythme changé ; après elle, une journée qui ne couvre rien (Q8).
function startedDays(period: TreatmentPeriodInput): string[] {
  if (period.referenceOn > period.firstDueOn) return []
  if (period.firstDueOn === period.startsOn) return [period.startsOn]
  return period.referenceOn < period.firstDueOn ? [period.firstDueOn] : []
}

function uniqueDays(doses: readonly TreatmentDoseInput[]): string[] {
  return [...new Set(doses.map(({ dueOn }) => dueOn))]
}

// G5 : un report qui part et arrive après la fermeture de la période.
function isClosedOut(move: TreatmentDoseInput, closesOn: string | null): boolean {
  return closesOn !== null && move.dueOn >= closesOn && move.nextDueDate >= closesOn
}

// G17 : une journée n'a qu'une ligne de chaque famille, la plus récente ; les autres sont sans effet.
function olderOfSameDay(lines: TreatmentDoseInput[]): TreatmentDoseInput[] {
  return lines.filter((line) =>
    lines.some((other) => other.dueOn === line.dueOn && isMoreRecent(other, line)),
  )
}

// Les lignes que le moteur ne lit pas, à supprimer avec la prochaine écriture : un report revenu à sa
// date, un report battu par une prise de la même échéance (Q5), une ligne plus ancienne de la même
// journée (G17), un report qui part et arrive après la fermeture de la période (G5). Q25 : sa dose
// d'arrivée notée, un report reste dans l'historique.
function staleLines(
  doses: TreatmentDoseInput[],
  noteKeys: Set<string>,
  noteDays: Set<string>,
  closesOn: string | null,
) {
  const moves = doses.filter((dose) => familyOf(dose) === 'move')
  const isLogged = (move: TreatmentDoseInput) => noteDays.has(move.nextDueDate)
  const older = olderOfSameDay(moves)
  const staleMoves = moves.filter(
    (move) =>
      noteKeys.has(keyOf(move)) ||
      (!isLogged(move) &&
        (move.nextDueDate === move.dueOn || older.includes(move) || isClosedOut(move, closesOn))),
  )
  return [...staleMoves, ...olderOfSameDay(doses.filter(isShiftLine))]
}

function removalsOf(moves: TreatmentDoseInput[]): Map<string, string> {
  const removals = new Map<string, string>()
  for (const move of moves) {
    const first = removals.get(move.dueOn)
    if (first === undefined || keyOf(move) < first) removals.set(move.dueOn, keyOf(move))
  }
  return removals
}

function dayDues(period: TreatmentPeriodInput, days: string[]): Due[] {
  const times = period.times.length > 0 ? [...period.times].sort(compareOrdinal) : [null]
  return days.flatMap((dueOn) => times.map((dueTime) => ({ periodId: period.id, dueOn, dueTime })))
}

// G25 : un report seul n'emporte que les heures qu'il retire à sa journée ; avec son décalage, la
// journée d'arrivée a toutes ses heures (Q21).
function arrivalDues(
  period: TreatmentPeriodInput,
  move: TreatmentDoseInput,
  steps: Step[],
  kept: Set<string>,
): Due[] {
  const dues = dayDues(period, [move.nextDueDate])
  const shifted = steps.some((step) => isShift(step) && dueId(step.dose) === dueId(move))
  if (shifted) return dues
  return dues.filter(({ dueTime }) => {
    const origin = keyOf({ dueOn: move.dueOn, dueTime })
    return origin >= keyOf(move) && !kept.has(origin)
  })
}

/** Les reports qui arrivent ce jour-là, y compris ceux que la période suivante a fermés (G5). */
export function movesInto(plan: PeriodTimeline, day: string): TreatmentDoseInput[] {
  const live = plan.steps.filter(isMove).map(({ dose }) => dose)
  const stale = plan.stale.filter((line) => familyOf(line) === 'move')
  const older = olderOfSameDay([...live, ...stale])
  const closedOut = stale.filter(
    (move) =>
      isClosedOut(move, plan.closesOn) && !plan.noteKeys.has(keyOf(move)) && !older.includes(move),
  )
  return [...live, ...closedOut].filter((move) => move.nextDueDate === day && move.dueOn !== day)
}

/** G25 : les heures du jour d'arrivée de ce report qu'il n'a pas emportées (seul, sans décalage). */
export function stayedKeys(plan: PeriodTimeline, move: TreatmentDoseInput): string[] {
  const kept = new Set([...plan.noteKeys, ...plan.covered])
  const arrived = new Set(arrivalDues(plan.period, move, plan.steps, kept).map(keyOf))
  // Fermée par la période suivante, la journée d'origine ne garde plus ses heures sans prise.
  const closedOut = isClosedOut(move, plan.closesOn)
  return dayDues(plan.period, [move.nextDueDate])
    .filter(({ dueTime }) => !arrived.has(keyOf({ dueOn: move.nextDueDate, dueTime })))
    .filter(({ dueTime }) => !closedOut || kept.has(keyOf({ dueOn: move.dueOn, dueTime })))
    .map(keyOf)
}

export function planPeriod(
  period: TreatmentPeriodInput,
  closesOn: string | null,
  doses: TreatmentDoseInput[],
  covered: Set<string>,
): PeriodTimeline {
  const notes = doses.filter(isNoteLine)
  const noteKeys = new Set(notes.map(keyOf))
  const noteDays = new Set(notes.map((dose) => dose.dueOn))
  const stale = staleLines(doses, noteKeys, noteDays, closesOn)
  const unread = new Set(stale)
  const steps = stepsOf(doses.filter((dose) => !unread.has(dose)))
  const anchors = [
    { position: '', sequence: initialSequence(period) },
    ...steps.filter(isShift).map(({ position, dose }) => ({
      position,
      sequence: shiftedSequence(dose),
    })),
  ]
  const sequences = anchors.map(({ sequence }) => sequence)
  const moves = steps.filter(isMove).map(({ dose }) => dose)
  const between = [
    ...sequences.slice(0, -1).flatMap((sequence, index) => {
      const end = sequences[index + 1]?.floor ?? ''
      return duesUntil(sequence, period, end)
    }),
    ...moves.flatMap((move) =>
      arrivalDues(period, move, steps, new Set([...noteKeys, ...covered])),
    ),
    ...dayDues(period, isOffGrid(period) ? [period.firstDueOn] : []),
  ]
  return {
    period,
    closesOn,
    steps,
    stale,
    anchors,
    between: uniqueSorted(between),
    removals: removalsOf(moves),
    noteKeys,
    noteDays,
    covered,
    fallenKeys: steps
      .filter(hasFallen)
      .map(({ dose }) => keyOf(dose))
      .sort(compareOrdinal),
  }
}

export function closingDay(
  period: TreatmentPeriodInput,
  next: TreatmentPeriodInput | undefined,
): string | null {
  const bounds = [period.stoppedOn, next?.startsOn ?? null].filter((day) => day !== null)
  return bounds.sort(compareOrdinal)[0] ?? null
}

function isWithinPeriod(plan: PeriodTimeline, dueOn: string): boolean {
  const { endsOn } = plan.period
  return (endsOn === null || dueOn <= endsOn) && (plan.closesOn === null || dueOn < plan.closesOn)
}

function isRemoved(plan: PeriodTimeline, due: Due): boolean {
  const first = plan.removals.get(due.dueOn)
  return first !== undefined && keyOf(due) >= first
}

export function sequenceAt(plan: PeriodTimeline, position: string): Sequence {
  let low = 0
  let high = plan.anchors.length
  while (low < high) {
    const middle = Math.floor((low + high) / 2)
    if ((plan.anchors[middle]?.position ?? position) < position) low = middle + 1
    else high = middle
  }
  return (plan.anchors[low - 1] ?? plan.anchors[0]!).sequence
}

// Une période ouverte sans date de fin est infinie : `to` ou `limit` la bornent.
export function pendingDues(
  plan: PeriodTimeline,
  { from = '', to, limit = Infinity }: Window,
): Due[] {
  const isPending = (due: Due) =>
    isWithinPeriod(plan, due.dueOn) &&
    !plan.noteKeys.has(keyOf(due)) &&
    !plan.covered.has(keyOf(due)) &&
    !isRemoved(plan, due) &&
    due.dueOn >= from &&
    (to === undefined || due.dueOn <= to)
  const tail: Due[] = []
  for (const due of sequenceDues(plan.anchors.at(-1)!.sequence, plan.period, from)) {
    if (!isWithinPeriod(plan, due.dueOn) || (to !== undefined && due.dueOn > to)) break
    if (tail.length >= limit) break
    if (isPending(due)) tail.push(due)
  }
  return uniqueSorted([...plan.between.filter(isPending), ...tail]).slice(0, limit)
}

/** Dernière journée d'échéance de la période, prises comprises ; `null` pour une période sans fin. */
export function lastDueDay(plan: PeriodTimeline): string | null {
  if (plan.period.endsOn === null && plan.closesOn === null) return null
  const isKept = (due: Due) => isWithinPeriod(plan, due.dueOn) && !isRemoved(plan, due)
  let last = plan.between.filter(isKept).at(-1)?.dueOn ?? null
  for (const due of sequenceDues(plan.anchors.at(-1)!.sequence, plan.period)) {
    if (!isWithinPeriod(plan, due.dueOn)) break
    if (isKept(due) && (last === null || due.dueOn > last)) last = due.dueOn
  }
  return last
}

export function nextDueAfter(plan: PeriodTimeline, due: Due): Due {
  const key = keyOf(due)
  const isAfter = (other: Due) =>
    keyOf(other) > key && !isRemoved(plan, other) && !plan.covered.has(keyOf(other))
  const bounded = plan.between.find(isAfter)
  const tail = sequenceDues(plan.anchors.at(-1)!.sequence, plan.period, due.dueOn)
  for (;;) {
    const other = tail.next().value
    if (bounded !== undefined && keyOf(other) >= keyOf(bounded)) return bounded
    if (isAfter(other)) return other
  }
}

export function notesOf(plan: PeriodTimeline): TreatmentDoseInput[] {
  return plan.steps.filter(isNote).map(({ dose }) => dose)
}

/** L'échéance qui porte le décalage d'une prise : pour une dose avancée, son échéance d'origine. */
export function shiftDueOf(plan: PeriodTimeline, due: Due): Due {
  const advanced = plan.steps.find(
    ({ kind, dose }) =>
      kind === 'move' && dose.nextDueDate === due.dueOn && dose.nextDueDate < dose.dueOn,
  )
  return advanced === undefined ? due : dueOf(advanced.dose)
}

/** La ligne de décalage en vigueur sur cette échéance. */
export function shiftOn(plan: PeriodTimeline, due: Due): TreatmentDoseInput | undefined {
  return plan.steps.find((step) => isShift(step) && dueId(step.dose) === dueId(due))?.dose
}
