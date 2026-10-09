import { invalid } from './treatment-schedule-checks'
import { nextDay, previousDay } from './calendar-day'
import { dueId, sameDue } from './treatment-schedule-dues'
import {
  closingDay,
  isExtraLine,
  isNoteLine,
  isShiftLine,
  mergeDoses,
  nextDueAfter,
  notesOf,
  orderPeriods,
  pendingDues,
  coveredKeys,
  refixingNotes,
  planPeriod,
} from './treatment-schedule-timeline'
import type {
  Due,
  PeriodTimeline,
  State,
  TreatmentDoseInput,
  TreatmentPeriodInput,
  TreatmentPhase,
  TreatmentScheduleInput,
} from './treatment-schedule-types'

function latestFallenKey(plan: PeriodTimeline, today: string): string {
  return plan.fallenKeys.filter((key) => key.slice(0, 10) <= today).at(-1) ?? ''
}

// Q23 : la dernière journée d'échéance arrivée reste entière la dose du moment.
function dosesOfTheMoment(plan: PeriodTimeline, fallen: Due[], today: string): Due[] {
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
function notesSinceLastStop(
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): TreatmentDoseInput[] {
  const sinceLastStop = earlier.slice(
    earlier.map((period) => period.stoppedOn !== null).lastIndexOf(true) + 1,
  )
  const changed = new Set(sinceLastStop.map(({ id }) => id))
  return doses.filter((dose) => isNoteLine(dose) && changed.has(dose.periodId))
}

export function notedOn(
  day: string,
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): number {
  return notesSinceLastStop(earlier, doses).filter((dose) => dose.dueOn === day).length
}

// G24 : les prises d'une journée à venir qui n'ont pas décalé la suite (Q8).
export function startedAheadOn(
  day: string,
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): number {
  const refixing = refixingNotes(doses)
  return notesSinceLastStop(earlier, doses).filter(
    (dose) => dose.dueOn === day && !refixing.has(dose),
  ).length
}

export function build(input: TreatmentScheduleInput): State {
  const { today } = input
  const periods = orderPeriods(input.periods)
  // Une prise en plus ne change jamais le calendrier : le moteur ne la lit pas.
  const doses = mergeDoses(input.doses).filter((dose) => !isExtraLine(dose))
  const refixing = refixingNotes(doses)
  const plans = periods.map((period, index) =>
    planPeriod(
      period,
      closingDay(period, periods[index + 1]),
      doses.filter((dose) => dose.periodId === period.id),
      coveredKeys(
        period,
        periods[index - 1],
        notesSinceLastStop(periods.slice(0, index), doses),
        refixing,
      ),
    ),
  )
  const current = plans.at(-1)
  const unlogged = plans
    .slice(0, -1)
    .flatMap((plan) => pendingDues(plan, { to: previousDay(today) }))
  const noted = new Set(plans.flatMap(notesOf).map(dueId))
  const lines = new Set(plans.flatMap(({ steps }) => steps.map(({ dose }) => dueId(dose))))
  const closed = { input, noted, lines, plans, open: null, currentDoses: [] }

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

export function planOf(state: State, periodId: string): PeriodTimeline {
  const plan = state.plans.find(({ period }) => period.id === periodId)
  if (plan === undefined) throw invalid(`période inconnue ${periodId}`)
  return plan
}

// La prochaine échéance du calendrier après celle-ci, prises comprises : reports et décalages en vigueur.
export function nextInSequence(state: State, due: Due): string {
  return nextDueAfter(planOf(state, due.periodId), due).dueOn
}

// Une prise en plus est rangée sous sa date réelle : elle n'est jamais une ligne de l'échéance retirée.
export function stateWithoutDues(state: State, dues: Due[]): State {
  const doses = state.input.doses.filter(
    (dose) => isExtraLine(dose) || !dues.some((due) => sameDue(dose, due)),
  )
  return build({ ...state.input, doses })
}

// Le carnet sans aucune ligne de cette échéance.
export function stateWithout(state: State, due: Due): State {
  if (!state.lines.has(dueId(due))) return state
  return stateWithoutDues(state, [due])
}

// Le carnet sans la prise de cette échéance, ni le report qu'elle bat (Q5) : son décalage reste.
export function stateWithoutNote(state: State, due: Due): State {
  if (!state.lines.has(dueId(due))) return state
  const doses = state.input.doses.filter(
    (dose) => !sameDue(dose, due) || isShiftLine(dose) || isExtraLine(dose),
  )
  return build({ ...state.input, doses })
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
