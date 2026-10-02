import { invalid } from './treatment-schedule-checks'
import { dueId, keyOf, nextDay, previousDay, sameDue } from './treatment-schedule-dues'
import {
  closingDay,
  mergeDoses,
  notesOf,
  orderPeriods,
  pendingDues,
  planPeriod,
  positionOf,
  sequenceAt,
} from './treatment-schedule-plan'
import { sequenceDues } from './treatment-schedule-sequence'
import type {
  Due,
  PeriodPlan,
  State,
  TreatmentDoseInput,
  TreatmentPeriodInput,
  TreatmentPhase,
  TreatmentScheduleInput,
} from './treatment-schedule-types'

function latestFallenKey(plan: PeriodPlan, today: string): string {
  return plan.fallenKeys.filter((key) => key.slice(0, 10) <= today).at(-1) ?? ''
}

// Q23 : la dernière journée d'échéance arrivée reste entière la dose du moment.
function dosesOfTheMoment(plan: PeriodPlan, fallen: Due[], today: string): Due[] {
  const lastDay = fallen.at(-1)?.dueOn
  if (lastDay !== undefined && lastDay >= latestFallenKey(plan, today).slice(0, 10)) {
    return fallen.filter((due) => due.dueOn === lastDay)
  }
  return pendingDues(plan, { from: nextDay(today), limit: 1 })
}

function phaseOf(current: Due | undefined, today: string): TreatmentPhase {
  if (current === undefined) return 'ended'
  if (current.dueOn === today) return 'today'
  return current.dueOn < today ? 'overdue' : 'upcoming'
}

// Une reprise après un arrêt (TR-30) garde sa première prise : seul un changement de réglage compte.
export function notedOn(
  day: string,
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): number {
  const sinceLastStop = earlier.slice(
    earlier.map((period) => period.stoppedOn !== null).lastIndexOf(true) + 1,
  )
  const changed = new Set(sinceLastStop.map(({ id }) => id))
  return doses.filter(
    (dose) => dose.status !== 'postponed' && dose.dueOn === day && changed.has(dose.periodId),
  ).length
}

export function build(input: TreatmentScheduleInput): State {
  const { today } = input
  const periods = orderPeriods(input.periods)
  const doses = mergeDoses(input.doses)
  const plans = periods.map((period, index) =>
    planPeriod(
      period,
      closingDay(period, periods[index + 1]),
      doses.filter((dose) => dose.periodId === period.id),
      notedOn(period.startsOn, periods.slice(0, index), doses),
    ),
  )
  const current = plans.at(-1)
  const unlogged = plans
    .slice(0, -1)
    .flatMap((plan) => pendingDues(plan, { to: previousDay(today) }))
  const noted = new Set(plans.flatMap(notesOf).map(dueId))
  const closed = { input, noted, plans, open: null, currentDoses: [] }

  if (current === undefined) return { ...closed, phase: 'ended', unloggedDoses: unlogged }
  const { stoppedOn, endsOn } = current.period
  if (stoppedOn !== null) {
    const before = pendingDues(current, { to: previousDay(today) })
    return { ...closed, phase: 'stopped', unloggedDoses: [...unlogged, ...before] }
  }
  if (endsOn !== null && endsOn < today) {
    return { ...closed, phase: 'ended', unloggedDoses: [...unlogged, ...pendingDues(current, {})] }
  }

  const fallen = pendingDues(current, { to: today })
  const currentDoses = dosesOfTheMoment(current, fallen, today)
  const missedHere = fallen.filter(
    (due) => due.dueOn < today && !currentDoses.some((moment) => sameDue(moment, due)),
  )
  return {
    ...closed,
    open: current,
    phase: phaseOf(currentDoses[0], today),
    currentDoses,
    unloggedDoses: [...unlogged, ...missedHere],
  }
}

export function planOf(state: State, periodId: string): PeriodPlan {
  const plan = state.plans.find(({ period }) => period.id === periodId)
  if (plan === undefined) throw invalid(`période inconnue ${periodId}`)
  return plan
}

export function nextInSequence(state: State, due: Due): string {
  const plan = planOf(state, due.periodId)
  const key = keyOf(due)
  const dues = sequenceDues(sequenceAt(plan, positionOf(key, 1)), plan.period, due.dueOn)
  let next = dues.next().value
  while (keyOf(next) <= key) next = dues.next().value
  return next.dueOn
}

export function stateWithoutDues(state: State, dues: Due[]): State {
  const doses = state.input.doses.filter((dose) => !dues.some((due) => sameDue(dose, due)))
  return build({ ...state.input, doses })
}

export function stateWithout(state: State, due: Due, today = state.input.today): State {
  if (!state.noted.has(dueId(due)) && today === state.input.today) return state
  const doses = state.input.doses.filter((dose) => !sameDue(dose, due))
  return build({ ...state.input, doses, today })
}

// Une prise en avance vise le prochain jour d'échéance : deux jours couvrent chaque heure.
export function nearUpcoming(state: State): Due[] {
  const { open, input } = state
  if (open === null) return []
  const perDay = Math.max(1, open.period.times.length)
  return pendingDues(open, { from: nextDay(input.today), limit: 2 * perDay })
}

export function visiblePending(state: State): Due[] {
  return [...state.unloggedDoses, ...state.currentDoses, ...nearUpcoming(state)]
}

export function knownDues(state: State): Set<string> {
  return new Set([...state.noted, ...visiblePending(state).map(dueId)])
}
