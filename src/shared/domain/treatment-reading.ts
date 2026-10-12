import { differenceInCalendarDays } from 'date-fns'

import { isCalendarDay, toDate } from './calendar-day'
import { isClockTime } from './clock-time'
import {
  treatmentView,
  viewInputOf,
  type HistoryLine,
  type LegacyInput,
  type Line,
  type TreatmentView,
} from './dose-calendar'
import { DAYS_PER_STEP, FREQUENCY_UNITS, MAX_FREQUENCY_VALUE } from './treatment-frequency'

type Period = LegacyInput['periods'][number]
type Dose = LegacyInput['doses'][number]

/** Les périodes et les prises d'un traitement telles que la base les rend. */
export type TreatmentRecords = { periods: readonly Period[]; doses: readonly Dose[] }

const MAX_DUES = 50_000
const STATUSES: readonly string[] = ['given', 'missed', 'postponed', 'extra', 'shift']
const UNITS: readonly string[] = FREQUENCY_UNITS

const isOptionalDay = (day: unknown) => day === null || isCalendarDay(day)

function isReadablePeriod({ frequency, times, ...days }: Period): boolean {
  const { value, unit } = frequency ?? {}
  return (
    [days.startsOn, days.firstDueOn, days.referenceOn].every(isCalendarDay) &&
    isOptionalDay(days.endsOn) &&
    isOptionalDay(days.stoppedOn) &&
    Number.isInteger(value) &&
    value! >= 1 &&
    value! <= MAX_FREQUENCY_VALUE &&
    UNITS.includes(unit ?? '') &&
    Array.isArray(times) &&
    times.every(isClockTime) &&
    new Set(times).size === times.length
  )
}

function isReadableDose(dose: Dose): boolean {
  const moves = dose.status === 'postponed' || dose.status === 'shift'
  return (
    STATUSES.includes(dose.status) &&
    isCalendarDay(dose.dueOn) &&
    isOptionalDay(dose.givenOn) &&
    (dose.dueTime === null || isClockTime(dose.dueTime)) &&
    (!moves || isCalendarDay(dose.nextDueDate))
  )
}

function estimatedDues({ periods, doses }: TreatmentRecords, today: string): number {
  const days = [
    today,
    ...periods.flatMap(({ firstDueOn, endsOn }) => [firstDueOn, endsOn ?? today]),
    ...doses.map(({ dueOn }) => dueOn),
  ].sort()
  const span = differenceInCalendarDays(toDate(days.at(-1)!), toDate(days[0]!))
  const step = Math.min(...periods.map(({ frequency }) => DAYS_PER_STEP[frequency.unit]))
  const perDay = Math.max(1, ...periods.map(({ times }) => times.length))
  return (Math.floor(span / step) + 2) * perDay + doses.length
}

/** R12 : la lecture d'un traitement enregistré ; `null` quand ses données sont illisibles. */
export function treatmentReading(treatment: TreatmentRecords, today: string): TreatmentView | null {
  const readable =
    treatment.periods.every(isReadablePeriod) &&
    treatment.doses.every(isReadableDose) &&
    (treatment.periods.length === 0 || estimatedDues(treatment, today) <= MAX_DUES)
  if (!readable) return null
  return treatmentView(viewInputOf({ ...treatment, today }))
}

// « · sans effet » n'a pas encore de texte : une ligne sans effet reste cachée comme avant, sauf une prise (R4).
function isShown({ line, effect }: HistoryLine): boolean {
  if (effect.kind !== 'idle') return true
  if (effect.reason === 'superseded') return false
  return line.status !== 'postponed' && line.status !== 'shift'
}

/** Les lignes que l'historique montre, dans l'ordre chronologique. */
export function shownLines(view: Pick<TreatmentView, 'history'>): Line[] {
  return view.history.filter(isShown).map(({ line }) => line)
}

/** L'enregistrement du réglage en cours, avec les colonnes que le moteur ne lit pas (posologie, rappel). */
export function currentPeriodIn<P extends { id: string }>(
  periods: readonly P[],
  view: Pick<TreatmentView, 'currentSetting'>,
): P | null {
  return periods.find(({ id }) => id === view.currentSetting?.id) ?? null
}
