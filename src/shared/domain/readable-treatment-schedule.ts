import {
  treatmentSchedule,
  type TreatmentSchedule,
  type TreatmentScheduleInput,
} from './treatment-schedule'

/** `null` quand le moteur d'échéances refuse le traitement comme illisible (`RangeError`). */
export function readableTreatmentSchedule(input: TreatmentScheduleInput): TreatmentSchedule | null {
  try {
    return treatmentSchedule(input)
  } catch (cause) {
    if (cause instanceof RangeError) return null
    throw cause
  }
}
