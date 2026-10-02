import { isClockTime } from './clock-time'
import { checkFrequency, invalid } from './treatment-schedule-checks'
import { latestOf, shiftDate } from './treatment-schedule-dues'
import { mergeDoses } from './treatment-schedule-plan'
import { fixesSuiteFromItsDate, referenceOf } from './treatment-schedule-sequence'
import { notedOn } from './treatment-schedule-state'
import type { Frequency, NewPeriod, State } from './treatment-schedule-types'

// Q8 : une prise qui n'a pas fixé la suite compte par son échéance, pas par sa date réelle.
function lastReference(state: State, frequency: Frequency): string | undefined {
  const plan = state.plans.filter(({ steps }) => steps.length > 0).at(-1)
  const last = plan?.steps.at(-1)
  if (plan === undefined || last === undefined) return undefined
  if (last.kind === 'move') return last.dose.nextDueDate
  const fixed = fixesSuiteFromItsDate(last.dose, plan.period.frequency)
  return shiftDate(fixed ? referenceOf(last.dose) : last.dose.dueOn, frequency, 1)
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
  if (noted > 0 && noted < times.length) return { startsOn, firstDueOn: startsOn }
  const dueToday = state.currentDoses.some((due) => due.dueOn === today)
  if (noted === 0 && dueToday) return { startsOn, firstDueOn: startsOn }
  const proposed = lastReference(state, frequency) ?? startsOn
  return { startsOn, firstDueOn: proposed > startsOn ? proposed : startsOn }
}
