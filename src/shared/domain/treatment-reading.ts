import { differenceInCalendarDays } from 'date-fns'

import { isCalendarDay, previousDay, toDate } from './calendar-day'
import { isClockTime } from './clock-time'
import {
  treatmentView,
  viewInputOf,
  type HistoryLine,
  type IdleReason,
  type LegacyInput,
  type Line,
  type TreatmentView,
  type TreatmentViewInput,
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

function byStart(a: Period, b: Period): number {
  const key = ({ startsOn, createdAt, id }: Period) => `${startsOn} ${createdAt} ${id}`
  return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0
}

function estimatedPeriodDues(
  period: Period,
  next: Period | undefined,
  doses: readonly Dose[],
  today: string,
): number {
  const keys = doses.map(({ dueOn }) => dueOn)
  const arrivals = doses.filter(({ status }) => status === 'postponed').map((d) => d.nextDueDate)
  const first = [period.firstDueOn, ...keys, ...arrivals].sort()[0]!
  const closesOn = [period.stoppedOn, next?.startsOn ?? null]
    .filter((day) => day !== null)
    .sort()[0]
  const close = closesOn === undefined ? null : previousDay(closesOn)
  const end = [period.endsOn, close, today].filter((day) => day !== null).sort()[0]!
  const last = [end, ...keys].sort().at(-1)!
  const span = Math.max(0, differenceInCalendarDays(toDate(last), toDate(first)))
  const stepDays = DAYS_PER_STEP[period.frequency.unit] * period.frequency.value
  const perDay = Math.max(1, period.times.length)
  return (Math.floor(span / stepDays) + 2) * perDay + doses.length
}

/** Réglage par réglage, jusqu'à aujourd'hui ou sa fin : la même borne que l'ancien moteur. */
function estimatedDues({ periods, doses }: TreatmentRecords, today: string): number {
  const ordered = [...periods].sort(byStart)
  return ordered.reduce((sum, period, index) => {
    const own = doses.filter(({ periodId }) => periodId === period.id)
    return sum + estimatedPeriodDues(period, ordered[index + 1], own, today)
  }, 0)
}

/** Ce qui range les réglages d'un traitement et fait hériter l'origine de l'un à l'autre. */
export type OrderedPeriod = Pick<
  Period,
  'id' | 'startsOn' | 'createdAt' | 'stoppedOn' | 'frequency' | 'referenceOn'
>

const sameRhythm = (a: OrderedPeriod, b: OrderedPeriod) =>
  a.frequency.value === b.frequency.value && a.frequency.unit === b.frequency.unit

// R1, R9 : un réglage remplacé avant son premier jour cède sa place à un réglage écrit après lui.
function inOrder<P extends OrderedPeriod>(periods: readonly P[]): P[] {
  const startOf = (period: P) =>
    periods
      .filter(({ createdAt }) => createdAt > period.createdAt)
      .reduce((day, newer) => (newer.startsOn < day ? newer.startsOn : day), period.startsOn)
  return [...periods].sort(
    (a, b) =>
      startOf(a).localeCompare(startOf(b)) ||
      a.createdAt.localeCompare(b.createdAt) ||
      a.id.localeCompare(b.id),
  )
}

/** Le réglage qui précède celui-ci dans l'ordre que lit le moteur : celui dont il hérite l'origine. */
export function previousPeriod<P extends OrderedPeriod>(
  periods: readonly P[],
  period: P,
): P | undefined {
  const others = periods.filter(({ id }) => id !== period.id)
  const ordered = inOrder([...others, period])
  return ordered[ordered.indexOf(period) - 1]
}

// Le schéma v11 n'a que `reference_on` pour l'origine de la grille : hériter la recopie, la poser l'écrit.
function withOrigins(input: TreatmentViewInput, periods: readonly Period[]): TreatmentViewInput {
  const ordered = inOrder(periods)
  const origins = new Map(
    ordered.map((period, index) => {
      const previous = ordered[index - 1]
      const inherits =
        previous !== undefined &&
        previous.stoppedOn === null &&
        sameRhythm(previous, period) &&
        period.referenceOn === previous.referenceOn
      const own = viewInputOf({ periods: [period], doses: [], today: input.today }).settings[0]!
      return [period.id, inherits ? null : own.gridOriginOn] as const
    }),
  )
  return {
    ...input,
    settings: input.settings.map((setting) =>
      origins.has(setting.id)
        ? { ...setting, gridOriginOn: origins.get(setting.id) ?? null }
        : setting,
    ),
  }
}

/** La vue d'un traitement et le carnet qu'elle lit : les gestes et leur aperçu jouent sur ce carnet. */
export type TreatmentReading = { view: TreatmentView; input: TreatmentViewInput }

/** R12 : la lecture d'un traitement enregistré ; `null` quand ses données sont illisibles. */
export function readTreatment(treatment: TreatmentRecords, today: string): TreatmentReading | null {
  const readable =
    treatment.periods.every(isReadablePeriod) &&
    treatment.doses.every(isReadableDose) &&
    estimatedDues(treatment, today) <= MAX_DUES
  if (!readable) return null
  const input = withOrigins(viewInputOf({ ...treatment, today }), treatment.periods)
  return { view: treatmentView(input), input }
}

export function treatmentReading(treatment: TreatmentRecords, today: string): TreatmentView | null {
  return readTreatment(treatment, today)?.view ?? null
}

// La fiche grise ces lignes « · sans effet » (R11) ; le PDF et les feuilles, qui comptent des prises, ne les montrent pas.
const HIDDEN: readonly IdleReason[] = ['superseded', 'back-to-date', 'beaten']

function isShown({ effect }: HistoryLine): boolean {
  return effect.kind !== 'idle' || !HIDDEN.includes(effect.reason)
}

/** Les lignes que l'historique montre, dans l'ordre chronologique. */
export function shownLines(view: Pick<TreatmentView, 'history'>): Line[] {
  return view.history.filter(isShown).map(({ line }) => line)
}
