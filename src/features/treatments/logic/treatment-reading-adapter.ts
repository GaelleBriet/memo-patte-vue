import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentView, TreatmentViewInput } from '@/shared/domain/dose-calendar'
import { readCarnet, readTreatment, type TreatmentReading } from '@/shared/domain/treatment-reading'

type TreatmentToRead = Pick<TreatmentWithPeriods, 'periods' | 'doses'>

function readable(reading: TreatmentReading | null): TreatmentReading {
  if (reading === null) throw new RangeError('Traitement illisible')
  return reading
}

/** Lève une `RangeError` quand une période ou une prise est illisible ; `device` : celui du geste. */
export function treatmentReadingOf(
  treatment: TreatmentToRead,
  today: string,
  device?: string,
): TreatmentReading {
  return readable(readTreatment(treatment, today, device))
}

/** Lève une `RangeError` quand un réglage ou une ligne du carnet est illisible. */
export function carnetReadingOf(input: TreatmentViewInput): TreatmentReading {
  return readable(readCarnet(input))
}

/** `null` sans traitement, ou quand le moteur d'échéances le refuse comme illisible. */
export function readableReadingOf(
  treatment: TreatmentToRead | null,
  today: string,
): TreatmentReading | null {
  return treatment === null ? null : readTreatment(treatment, today)
}

export function currentPeriodOf(
  treatment: Pick<TreatmentWithPeriods, 'periods'>,
  view: Pick<TreatmentView, 'currentSetting'>,
): TreatmentPeriodRecord | null {
  return treatment.periods.find(({ id }) => id === view.currentSetting?.id) ?? null
}
