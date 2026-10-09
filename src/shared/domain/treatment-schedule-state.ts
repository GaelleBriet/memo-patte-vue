import { invalid } from './treatment-schedule-checks'
import { compareOrdinal, nextDay, previousDay } from './calendar-day'
import { dueId, keyOf, sameDue } from './treatment-schedule-dues'
import {
  closingDay,
  familyOf,
  isExtraLine,
  isNoteLine,
  isShiftLine,
  mergeDoses,
  nextDueAfter,
  notesOf,
  orderPeriods,
  pendingDues,
  coveredKeys,
  sameRhythm,
  planPeriod,
  stayedKeys,
  movesInto,
  sameTimes,
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

// Q8 : une prise qui a décalé la suite (la ligne de décalage de son échéance, ou de la dose qu'elle a
// avancée, G18, est ancrée à sa date réelle) compte à cette date, et toute sa journée avec elle.
function refixesDay(doses: TreatmentDoseInput[], periodId: string, day: string): boolean {
  const origins = doses
    .filter(
      (dose) => familyOf(dose) === 'move' && dose.periodId === periodId && dose.nextDueDate === day,
    )
    .map(({ dueOn }) => dueOn)
  return doses.some(
    (note) =>
      isNoteLine(note) &&
      note.periodId === periodId &&
      note.dueOn === day &&
      note.givenOn !== null &&
      note.givenOn !== day &&
      doses.some(
        (shift) =>
          isShiftLine(shift) &&
          shift.periodId === periodId &&
          shift.nextDueDate === note.givenOn &&
          ((shift.dueOn === day && shift.dueTime === note.dueTime) ||
            origins.includes(shift.dueOn)),
      ),
  )
}

// G24 : les prises d'une journée à venir donnée en partie en avance, sauf si elle a décalé la suite.
export function startedAheadOn(
  day: string,
  earlier: TreatmentPeriodInput[],
  doses: TreatmentDoseInput[],
): number {
  const notes = notesSinceLastStop(earlier, doses).filter((dose) => dose.dueOn === day)
  const refixed = notes.some(({ periodId }) => refixesDay(doses, periodId, day))
  return refixed ? 0 : notes.length
}

// G22 : au même rythme, la nouvelle période garde ce que la précédente tenait pour donné, heure par
// heure, à partir de son début.
function keepsCoverage(previous: TreatmentPeriodInput, period: TreatmentPeriodInput): boolean {
  return previous.stoppedOn === null && sameRhythm(previous, period)
}

function inheritedKeys(previous: PeriodTimeline, period: TreatmentPeriodInput): Set<string> {
  return new Set([
    ...[...previous.noteKeys, ...previous.covered].filter(
      (key) => key.slice(0, 10) >= period.startsOn,
    ),
    ...stayedOnFirstDay(previous, period),
  ])
}

function keepsFrequency(previous: TreatmentPeriodInput, period: TreatmentPeriodInput): boolean {
  const { value, unit } = previous.frequency
  return (
    previous.stoppedOn === null &&
    value === period.frequency.value &&
    unit === period.frequency.unit
  )
}

// G25 : les heures qu'un report seul a laissées derrière lui au premier jour de la période ; heures
// changées, les doses reportées prennent les dernières heures du nouveau réglage.
function stayedOnFirstDay(previous: PeriodTimeline, period: TreatmentPeriodInput): string[] {
  const day = period.firstDueOn
  const stayed = new Set(movesInto(previous, day).flatMap((move) => stayedKeys(previous, move)))
  if (stayed.size === 0 || sameTimes(previous.period, period)) return [...stayed]
  const carried = Math.max(1, previous.period.times.length) - stayed.size
  return [...period.times]
    .sort(compareOrdinal)
    .slice(0, Math.max(0, period.times.length - carried))
    .map((dueTime) => keyOf({ dueOn: day, dueTime }))
}

// G25 : un report seul fermé par la période suivante (G5) garde sa ligne tant que son arrivée l'ouvre.
export function carriedMoveIds(plans: PeriodTimeline[]): Set<string> {
  return new Set(
    plans.slice(1).flatMap((next, index) => {
      const previous = plans[index]!
      if (!keepsFrequency(previous.period, next.period)) return []
      return movesInto(previous, next.period.firstDueOn)
        .filter((move) => previous.stale.includes(move) && stayedKeys(previous, move).length > 0)
        .map(({ id }) => id)
    }),
  )
}

export function build(input: TreatmentScheduleInput): State {
  const { today } = input
  const periods = orderPeriods(input.periods)
  // Une prise en plus ne change jamais le calendrier : le moteur ne la lit pas.
  const doses = mergeDoses(input.doses).filter((dose) => !isExtraLine(dose))
  const plans: PeriodTimeline[] = []
  periods.forEach((period, index) => {
    const previous = plans[index - 1]
    plans.push(
      planPeriod(
        period,
        closingDay(period, periods[index + 1]),
        doses.filter((dose) => dose.periodId === period.id),
        previous !== undefined && keepsCoverage(previous.period, period)
          ? inheritedKeys(previous, period)
          : new Set([
              ...coveredKeys(
                period,
                periods[index - 1],
                notesSinceLastStop(periods.slice(0, index), doses),
              ),
              ...(previous !== undefined && keepsFrequency(previous.period, period)
                ? stayedOnFirstDay(previous, period)
                : []),
            ]),
      ),
    )
  })
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
