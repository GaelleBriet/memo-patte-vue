import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { treatmentSchedule, type TreatmentSchedule } from '@/shared/domain/treatment-schedule'

type History = Pick<TreatmentWithHistory, 'periods' | 'doses'>

/** Lève une `RangeError` quand une période ou une prise est illisible. */
export function treatmentScheduleOf(treatment: History, today: string): TreatmentSchedule {
  return treatmentSchedule({ periods: treatment.periods, doses: treatment.doses, today })
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'currentPeriodId'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
}
