import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'
import { treatmentSchedule, type TreatmentSchedule } from '@/shared/domain/treatment-schedule'

export { endedOnOf } from '@/shared/domain/treatment-end'

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
  return readableTreatmentSchedule({ periods: treatment.periods, doses: treatment.doses, today })
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'currentPeriodId'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
}
