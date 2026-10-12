import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentView } from '@/shared/domain/dose-calendar'
import { readTreatment, type TreatmentReading } from '@/shared/domain/treatment-reading'

type History = Pick<TreatmentWithHistory, 'periods' | 'doses'>

/** Lève une `RangeError` quand une période ou une prise est illisible. */
export function treatmentReadingOf(treatment: History, today: string): TreatmentReading {
  const reading = readTreatment(treatment, today)
  if (reading === null) throw new RangeError('Traitement illisible')
  return reading
}

/** `null` sans traitement, ou quand le moteur d'échéances le refuse comme illisible. */
export function readableReadingOf(
  treatment: History | null,
  today: string,
): TreatmentReading | null {
  return treatment === null ? null : readTreatment(treatment, today)
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  view: Pick<TreatmentView, 'currentSetting'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === view.currentSetting?.id) ?? null
}
