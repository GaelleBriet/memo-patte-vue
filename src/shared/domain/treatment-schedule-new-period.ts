import { isClockTime } from './clock-time'
import { checkFrequency, invalid } from './treatment-schedule-checks'
import { latestOf } from './calendar-day'
import { shiftDate } from './treatment-frequency'
import {
  isShift,
  mergeDoses,
  positionOf,
  sameRhythm,
  sequenceAt,
  shiftOn,
} from './treatment-schedule-timeline'
import { notedOn } from './treatment-schedule-state'
import type { Frequency, NewPeriod, State } from './treatment-schedule-types'

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

// #656 : une journée à venir entamée en avance reste la prochaine ; ses prises en couvrent les heures.
function scheduledDay(state: State): string | undefined {
  const day = state.currentDoses[0]?.dueOn
  if (day === undefined || state.open === null) return undefined
  return !state.open.noteDays.has(day) || day > state.input.today ? day : undefined
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
  const fromStart = { startsOn, firstDueOn: startsOn, referenceOn: startsOn }
  if (noted > 0 && noted < times.length) return fromStart
  const dueToday = state.currentDoses.some((due) => due.dueOn === today)
  if (noted === 0 && dueToday) return fromStart
  const scheduled = keepsSettings(state, frequency, times) ? scheduledDay(state) : undefined
  if (scheduled !== undefined && scheduled > startsOn && state.open !== null) {
    // Q37 : la suite en cours garde son jour de référence (le 31 d'un mensuel).
    const { origin } = sequenceAt(state.open, positionOf(`${scheduled} `, 0))
    return { startsOn, firstDueOn: scheduled, referenceOn: origin }
  }
  const proposed = scheduled ?? lastReference(state, frequency) ?? startsOn
  const firstDueOn = proposed > startsOn ? proposed : startsOn
  return { startsOn, firstDueOn, referenceOn: firstDueOn }
}
