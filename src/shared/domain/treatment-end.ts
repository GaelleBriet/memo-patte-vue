import {
  isNoteLine,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from './treatment-schedule'
import { byStartDescending, periodLastDay } from './treatment-periods'

/** Fin d'un traitement fini : sa date de fin une fois atteinte, sinon sa dernière échéance notée. */
export function endedOnOf(
  treatment: { periods: readonly Pick<TreatmentPeriodInput, 'id' | 'endsOn'>[] },
  schedule: Pick<TreatmentSchedule, 'phase' | 'currentPeriodId' | 'doses'>,
  today: string,
): string | null {
  const period = treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
  if (schedule.phase !== 'ended' || period === null) return null
  if (period.endsOn !== null && period.endsOn <= today) return period.endsOn
  const noted = schedule.doses
    .filter((dose) => dose.periodId === period.id && isNoteLine(dose))
    .map(({ dueOn }) => dueOn)
    .sort()
  return noted.at(-1) ?? period.endsOn
}

type PeriodDays = Pick<
  TreatmentPeriodInput,
  'id' | 'startsOn' | 'createdAt' | 'firstDueOn' | 'endsOn' | 'stoppedOn'
>

/** Arrêtée, finie ou remplacée par `next` avant sa première échéance. */
export function periodClosedBeforeFirstDue(
  period: Pick<TreatmentPeriodInput, 'firstDueOn' | 'endsOn' | 'stoppedOn'>,
  next: Pick<TreatmentPeriodInput, 'startsOn'> | undefined,
): boolean {
  const last = periodLastDay(period, next)
  return last !== null && last < period.firstDueOn
}

/** `period` arrêtée avant sa première échéance, et aucune dose jamais due ni notée sur tout le traitement. */
export function isStoppedBeforeFirstDose(
  period: Pick<TreatmentPeriodInput, 'firstDueOn' | 'stoppedOn'>,
  periods: readonly PeriodDays[],
  schedule: Pick<TreatmentSchedule, 'unloggedDoses'> & {
    doses: readonly Pick<TreatmentDoseInput, 'status'>[]
  },
): boolean {
  const noted = schedule.doses.some((dose) => isNoteLine(dose) || dose.status === 'extra')
  const sorted = [...periods].sort(byStartDescending)
  const neverDue =
    schedule.unloggedDoses.length === 0 &&
    sorted.every((each, index) => periodClosedBeforeFirstDue(each, sorted[index - 1]))
  return period.stoppedOn !== null && period.stoppedOn < period.firstDueOn && !noted && neverDue
}
