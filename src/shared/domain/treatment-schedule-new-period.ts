import { isClockTime } from './clock-time'
import { checkFrequency, invalid } from './treatment-schedule-checks'
import { latestOf, nextDay } from './calendar-day'
import { shiftDate } from './treatment-frequency'
import { firstDueOf, isOffGrid, sequenceDues } from './treatment-schedule-sequence'
import {
  isShift,
  mergeDoses,
  positionOf,
  sameRhythm,
  sequenceAt,
  shiftOn,
} from './treatment-schedule-timeline'
import { dueOf } from './treatment-schedule-dues'
import { notedOn } from './treatment-schedule-state'
import type { Frequency, NewPeriod, PeriodTimeline, State } from './treatment-schedule-types'

// Q8 : une prise qui n'a pas décalé la suite compte par son échéance, pas par sa date réelle.
function lastReference(state: State, frequency: Frequency): string | undefined {
  const lines = (steps: State['plans'][number]['steps']) => steps.filter((step) => !isShift(step))
  const plan = state.plans.filter(({ steps }) => lines(steps).length > 0).at(-1)
  const last = plan === undefined ? undefined : lines(plan.steps).at(-1)
  if (plan === undefined || last === undefined) return undefined
  if (last.kind === 'move') return last.dose.nextDueDate
  const reference = shiftOn(plan, last.dose)?.nextDueDate ?? last.dose.dueOn
  return shiftDate(reference, frequency, 1)
}

function keepsSettings(state: State, frequency: Frequency, times: readonly string[]): boolean {
  const current = state.open?.period
  return current !== undefined && sameRhythm(current, { frequency, times })
}

// G23 : l'arrivée d'un report seul garde sa date ; la grille en vigueur après ce jour reprend ensuite,
// sans la dose qu'il a avancée.
function heldReference(open: PeriodTimeline, day: string): string | undefined {
  const move = open.steps.find(
    ({ kind, dose }) => kind === 'move' && dose.nextDueDate === day,
  )?.dose
  const lone = move !== undefined && shiftOn(open, dueOf(move)) === undefined
  const offGridStart = day === open.period.firstDueOn && isOffGrid(open.period)
  if (!lone && !offGridStart) return undefined
  const after = sequenceAt(open, positionOf(`${nextDay(day)} `, 0))
  const resumesOn = firstDueOf({ ...after, floor: `${day} ~` }, open.period).dueOn
  return lone && move.dueOn > day && resumesOn === move.dueOn ? move.dueOn : after.origin
}

// G22 : une journée à venir entamée en avance reste la prochaine, si elle est sur la suite en vigueur.
function scheduledDay(state: State): string | undefined {
  const { open } = state
  const day = state.currentDoses[0]?.dueOn
  if (day === undefined || open === null) return undefined
  if (!open.noteDays.has(day)) return day
  if (day <= state.input.today) return undefined
  if (open.steps.some(({ kind, dose }) => kind === 'shift' && dose.nextDueDate === day)) return day
  const dues = sequenceDues(sequenceAt(open, positionOf(`${day} `, 0)), open.period, day)
  let next = dues.next().value
  while (next.dueOn < day) next = dues.next().value
  return next.dueOn === day ? day : undefined
}

// Q24 : la nouvelle période commence aujourd'hui ; ses heures au-delà des prises du jour restent à donner.
export function newPeriod(state: State, frequency: Frequency, times: readonly string[]): NewPeriod {
  checkFrequency(frequency, '')
  if (!times.every(isClockTime) || new Set(times).size !== times.length) {
    throw invalid(`heures ${JSON.stringify(times)}`)
  }
  const { today } = state.input
  const startsOn = latestOf([today, state.plans.at(-1)?.period.startsOn]) ?? today
  const periods = state.plans.map(({ period }) => period)
  const noted = notedOn(startsOn, periods, mergeDoses(state.input.doses))
  const { open } = state
  const kept = open !== null && keepsSettings(state, frequency, times)
  const next = state.currentDoses[0]?.dueOn
  if (kept && next !== undefined && next >= startsOn) {
    const referenceOn = heldReference(open, next)
    if (referenceOn !== undefined) return { startsOn, firstDueOn: next, referenceOn }
  }
  const fromStart = { startsOn, firstDueOn: startsOn, referenceOn: startsOn }
  if (noted > 0 && noted < times.length) return fromStart
  const dueToday = state.currentDoses.some((due) => due.dueOn === today)
  if (noted === 0 && dueToday) return fromStart
  const scheduled = kept ? scheduledDay(state) : undefined
  if (scheduled !== undefined && scheduled > startsOn && open !== null) {
    // Q37 : la suite en cours garde son jour de référence (le 31 d'un mensuel).
    const { origin } = sequenceAt(open, positionOf(`${scheduled} `, 0))
    return { startsOn, firstDueOn: scheduled, referenceOn: origin }
  }
  const proposed = scheduled ?? lastReference(state, frequency) ?? startsOn
  const firstDueOn = proposed > startsOn ? proposed : startsOn
  return { startsOn, firstDueOn, referenceOn: firstDueOn }
}
