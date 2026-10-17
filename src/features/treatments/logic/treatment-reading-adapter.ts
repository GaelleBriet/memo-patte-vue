import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentView, TreatmentViewInput } from '@/shared/domain/dose-calendar'
import { readCarnet, readTreatment, type TreatmentReading } from '@/shared/domain/treatment-reading'

type History = Pick<TreatmentWithHistory, 'periods' | 'doses'>

function readable(reading: TreatmentReading | null): TreatmentReading {
  if (reading === null) throw new RangeError('Traitement illisible')
  return reading
}

/** Lève une `RangeError` quand une période ou une prise est illisible. */
export function treatmentReadingOf(treatment: History, today: string): TreatmentReading {
  return readable(readTreatment(treatment, today))
}

/** Lève une `RangeError` quand un réglage ou une ligne du carnet est illisible. */
export function carnetReadingOf(input: TreatmentViewInput): TreatmentReading {
  return readable(readCarnet(input))
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
