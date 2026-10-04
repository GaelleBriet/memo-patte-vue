import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { treatmentSchedule, type TreatmentSchedule } from '@/shared/domain/treatment-schedule'

type History = Pick<TreatmentWithHistory, 'periods' | 'doses'>

/** Lève une `RangeError` quand une période ou une prise est illisible. */
export function treatmentScheduleOf(treatment: History, today: string): TreatmentSchedule {
  return treatmentSchedule({ periods: treatment.periods, doses: treatment.doses, today })
}

/** `null` sans traitement, ou quand le moteur d'échéances le refuse comme illisible. */
export function readableScheduleOf(
  treatment: History | null,
  today: string,
): TreatmentSchedule | null {
  if (treatment === null) return null
  try {
    return treatmentScheduleOf(treatment, today)
  } catch (cause) {
    if (cause instanceof RangeError) return null
    throw cause
  }
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'currentPeriodId'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
}

/** Fin d'un traitement fini : sa date de fin une fois atteinte, sinon sa dernière échéance notée. */
export function endedOnOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'phase' | 'currentPeriodId' | 'doses'>,
  today: string,
): string | null {
  const period = currentPeriodOf(treatment, schedule)
  if (schedule.phase !== 'ended' || period === null) return null
  if (period.endsOn !== null && period.endsOn <= today) return period.endsOn
  const noted = schedule.doses
    .filter((dose) => dose.periodId === period.id && dose.status !== 'postponed')
    .map(({ dueOn }) => dueOn)
    .sort()
  return noted.at(-1) ?? period.endsOn
}
