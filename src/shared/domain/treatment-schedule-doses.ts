import { differenceInCalendarDays, differenceInCalendarMonths } from 'date-fns'

import { MAX_DUES, checkPastDay, invalid, isClockTime } from './treatment-schedule-checks'
import {
  DAYS_PER_STEP,
  compareText,
  dueId,
  dueOf,
  keyOf,
  sameDue,
  shiftDate,
  toDate,
  uniqueSorted,
} from './treatment-schedule-dues'
import { isLocked, movedFields } from './treatment-schedule-moves'
import { compareCreation, hasFallen, pendingDues } from './treatment-schedule-plan'
import { firstDueOf, fixesSuiteFromItsDate } from './treatment-schedule-sequence'
import {
  build,
  nearUpcoming,
  nextInSequence,
  planOf,
  stateWithout,
} from './treatment-schedule-state'
import type {
  DoseFields,
  DoseGesture,
  Due,
  DueEntry,
  Frequency,
  PeriodPlan,
  RedatedDose,
  State,
  TreatmentDoseInput,
} from './treatment-schedule-types'

function landsOn(from: string, day: string, frequency: Frequency): boolean {
  const { value, unit } = frequency
  if (day <= from) return false
  const start = toDate(from)
  const target = toDate(day)
  if (unit === 'month') {
    const months = differenceInCalendarMonths(target, start)
    return months % value === 0 && shiftDate(from, frequency, months / value) === day
  }
  return differenceInCalendarDays(target, start) % (value * DAYS_PER_STEP[unit]) === 0
}

// La suite ne repart de la date réelle (T2) que pour la dernière heure du jour, si la dose suivante
// tombe après l'échéance couverte, et jamais sur l'échéance d'origine d'un déplacement (sa ligne).
function givenNextDueDate(others: State, due: Due, givenOn: string): string {
  const next = nextInSequence(others, due)
  const plan = planOf(others, due.periodId)
  const { frequency } = plan.period
  const restarted = shiftDate(givenOn, frequency, 1)
  const coversCurrent = others.currentDoses.some((current) => sameDue(current, due))
  const hitsAMove = plan.steps.some(
    ({ kind, dose }) =>
      kind === 'move' && dose.dueOn > due.dueOn && landsOn(givenOn, dose.dueOn, frequency),
  )
  const dayIsComplete = pendingDues(plan, { from: due.dueOn, to: due.dueOn }).every((other) =>
    sameDue(other, due),
  )
  const restarts =
    coversCurrent &&
    givenOn !== due.dueOn &&
    next !== due.dueOn &&
    dayIsComplete &&
    restarted > due.dueOn &&
    !hitsAMove
  return restarts ? restarted : next
}

function checkKnown(known: () => Set<string>, due: Due): void {
  if (!known().has(dueId(due))) {
    throw new RangeError(`Échéance inconnue du calendrier : ${JSON.stringify(due)}`)
  }
}

export function doseFor(state: State, known: () => Set<string>, gesture: DoseGesture): DoseFields {
  const { due } = gesture
  checkKnown(known, due)
  switch (gesture.kind) {
    case 'given': {
      checkPastDay(gesture.givenOn, state.input.today, 'date réelle')
      const nextDueDate = givenNextDueDate(stateWithout(state, due), due, gesture.givenOn)
      return { ...dueOf(due), givenOn: gesture.givenOn, status: 'given', nextDueDate }
    }
    case 'missed': {
      const nextDueDate = nextInSequence(stateWithout(state, due), due)
      return { ...dueOf(due), givenOn: null, status: 'missed', nextDueDate }
    }
  }
}

// TR-24 bis ne vaut que pour une prise qui a fixé la suite, avant le déplacement (Q8).
function followingMove(plan: PeriodPlan, index: number): TreatmentDoseInput | null {
  const step = plan.steps[index]
  const next = plan.steps[index + 1]
  const anchor = plan.anchors[index]?.sequence
  if (step?.kind !== 'note' || next?.kind !== 'move' || anchor === undefined) return null
  const { dose } = step
  const fixedTheSuite =
    compareCreation(dose, next.dose) < 0 && fixesSuiteFromItsDate(dose, plan.period.frequency)
  const nothingBetween = keyOf(firstDueOf(anchor, plan.period)) === keyOf(next.dose)
  return fixedTheSuite && nothingBetween ? next.dose : null
}

function movesLostBy(
  state: State,
  redated: TreatmentDoseInput,
  kept: TreatmentDoseInput | null,
): string[] {
  const doses = state.input.doses.map((dose) =>
    dose.id === kept?.id ? kept : sameDue(dose, redated) ? redated : dose,
  )
  const after = planOf(build({ ...state.input, doses }), redated.periodId)
  const stale = new Set(after.stale.map(({ id }) => id))
  return planOf(state, redated.periodId)
    .steps.map(({ dose }) => dose.id)
    .filter((id) => stale.has(id))
}

export function redate(state: State, doseId: string, givenOn: string): RedatedDose {
  checkPastDay(givenOn, state.input.today, 'date réelle')
  for (const plan of state.plans) {
    const index = plan.steps.findIndex((step) => step.kind === 'note' && step.dose.id === doseId)
    const dose = plan.steps[index]?.dose
    if (dose?.status !== 'given') continue
    const following = followingMove(plan, index)
    const next = following !== null && isLocked(plan, following) ? null : following
    const overtakes = next !== null && next.nextDueDate <= givenOn
    const nextDueDate = overtakes
      ? shiftDate(givenOn, plan.period.frequency, 1)
      : givenNextDueDate(stateWithout(state, dose, givenOn), dose, givenOn)
    const fields: DoseFields = { ...dueOf(dose), givenOn, status: 'given', nextDueDate }
    const firstTime = [...plan.period.times].sort(compareText)[0] ?? null
    const followed = { periodId: dose.periodId, dueOn: nextDueDate, dueTime: firstTime }
    const fixesFromItsDate =
      nextDueDate !== dose.dueOn && shiftDate(givenOn, plan.period.frequency, 1) === nextDueDate
    // Suivi d'une autre ligne, le déplacement garde son échéance : la suite d'après pourrait retomber dessus.
    const isPending =
      next !== null && !plan.noteDays.has(next.nextDueDate) && plan.steps.at(-1)?.dose === next
    const line =
      next === null
        ? null
        : movedFields(fixesFromItsDate && isPending ? followed : next, next.nextDueDate)
    const kept = next === null || line === null ? null : { ...next, ...line }
    const lost = movesLostBy(state, { ...dose, ...fields }, kept)
    if (next !== null && line !== null && !lost.includes(next.id)) {
      return { dose: fields, postponement: { doseIds: [next.id], kept: true, line } }
    }
    return { dose: fields, postponement: lost.length > 0 ? { doseIds: lost, kept: false } : null }
  }
  throw new RangeError(`Aucune prise donnée à redater : ${doseId}`)
}

export function upcoming(state: State, limit: number): Due[] {
  if (!Number.isInteger(limit) || limit < 0 || limit > MAX_DUES) throw invalid(`upcoming(${limit})`)
  const { open, input } = state
  return open === null ? [] : pendingDues(open, { from: input.today, limit })
}

export function dueForDate(state: State, date: string, time: string | null): Due | null {
  const { today } = state.input
  checkPastDay(date, today, 'date de la prise')
  if (time !== null && !isClockTime(time)) throw invalid(`heure ${JSON.stringify(time)}`)
  const matches = (due: Due) => time === null || due.dueTime === time
  const pending = uniqueSorted([...state.unloggedDoses, ...state.currentDoses])
  const entries: DueEntry[] = [
    ...pending.map((due) => ({ due, status: null })),
    ...state.plans
      .flatMap((plan) => plan.steps.filter(hasFallen))
      .map(({ dose }) => ({ due: dueOf(dose), status: dose.status })),
  ]
    .filter(({ due }) => matches(due))
    .sort((a, b) => compareText(keyOf(a.due), keyOf(b.due)))
  const last = entries.filter(({ due }) => due.dueOn <= date).at(-1)
  if (last !== undefined && (last.status === null || last.status === 'missed')) return last.due
  const ahead = entries.find(({ due, status }) => status === null && due.dueOn > date)
  if (ahead !== undefined) return ahead.due
  return nearUpcoming(state).find(matches) ?? null
}
