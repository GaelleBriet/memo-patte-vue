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

export function isStoppedBeforeItsFirstDue({
  firstDueOn,
  stoppedOn,
}: Pick<TreatmentPeriodInput, 'firstDueOn' | 'stoppedOn'>): boolean {
  return stoppedOn !== null && stoppedOn < firstDueOn
}

/** `period` arrêtée avant sa première échéance, et aucune dose jamais due ni notée sur tout le traitement. */
export function isStoppedBeforeFirstDose(
  period: Pick<TreatmentPeriodInput, 'firstDueOn' | 'stoppedOn'>,
  treatment: {
    periods: readonly PeriodDays[]
    doses: readonly Pick<TreatmentDoseInput, 'status'>[]
  },
): boolean {
  const noted = treatment.doses.some((dose) => isNoteLine(dose) || dose.status === 'extra')
  const sorted = [...treatment.periods].sort(byStartDescending)
  const neverDue = sorted.every((each, index) => {
    const last = periodLastDay(each, sorted[index - 1])
    return last !== null && last < each.firstDueOn
  })
  return isStoppedBeforeItsFirstDue(period) && !noted && neverDue
}
