import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import { legacyRecordsOf } from '@/shared/domain/dose-calendar'
import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'
import type { TreatmentSchedule } from '@/shared/domain/treatment-schedule'

type History = Pick<TreatmentWithHistory, 'periods' | 'doses'>

/** Les rappels lisent encore l'ancien moteur : le pas 8 de l'épic #758 les passe à la vue. */
export function readableScheduleOf(
  treatment: History | null,
  today: string,
): TreatmentSchedule | null {
  if (treatment === null) return null
  return readableTreatmentSchedule({ ...legacyRecordsOf(treatment), today })
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  schedule: Pick<TreatmentSchedule, 'currentPeriodId'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
}
