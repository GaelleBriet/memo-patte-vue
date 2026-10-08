import { treatmentScheduleOf } from './treatment-schedule-adapter'
import { draftPeriod, DRAFT_ID, startsTooFarBack, tooOld, withRhythm } from './treatment-settings'
import type { NewTreatmentPlan } from '../repository/treatments.repository'
import {
  treatmentCalendarSchema,
  treatmentCreationSchema,
  type PastDose,
  type TreatmentCalendarInput,
  type TreatmentCreationInput,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import {
  treatmentPeriodSettingsSchema,
  type TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

function creationSettings({
  firstDoseOn,
  ...rhythm
}: TreatmentRhythm & { firstDoseOn: string }): TreatmentPeriodSettings {
  return withRhythm(
    {
      startsOn: firstDoseOn,
      firstDueOn: firstDoseOn,
      reminderOffsetMinutes: null,
      reminderTime: null,
      ...rhythm,
    },
    rhythm,
  )
}

/** Le schéma de création, qui refuse une première prise que le moteur ne saurait pas relire. */
export function treatmentCreationSchemaFor(today: string) {
  return treatmentCreationSchema.superRefine((data, context) => {
    if (startsTooFarBack({ periods: [], doses: [] }, creationSettings(data), today)) {
      context.addIssue(tooOld())
    }
  })
}

function creationSchedule(
  settings: TreatmentPeriodSettings,
  periodId: string,
  today: string,
): TreatmentSchedule {
  const period = { ...draftPeriod(settings, `${today}T23:59:59.999Z`), id: periodId }
  return treatmentScheduleOf({ periods: [period], doses: [] }, today)
}

// Q42 : les doses non renseignées, et la dose du moment quand elle est déjà passée (jamais celle du jour).
function pastDuesOfSchedule(schedule: TreatmentSchedule, today: string): Due[] {
  return [...schedule.unloggedDoses, ...schedule.currentDoses.filter(({ dueOn }) => dueOn < today)]
}

/**
 * Échéances déjà passées d'un traitement en cours de saisie (TR-3). Vide tant que la saisie ne fait
 * pas un calendrier que le moteur sait lire.
 */
export function creationPastDues(calendar: TreatmentCalendarInput, today: string): Due[] {
  const parsed = treatmentCalendarSchema.safeParse(calendar)
  if (!parsed.success) return []
  const settings = creationSettings({ ...parsed.data, doseQuantity: null, doseUnit: null })
  if (!treatmentPeriodSettingsSchema.safeParse(settings).success) return []
  try {
    return pastDuesOfSchedule(creationSchedule(settings, DRAFT_ID, today), today)
  } catch (cause) {
    if (cause instanceof RangeError) return []
    throw cause
  }
}

function pastDoseWrites(
  settings: TreatmentPeriodSettings,
  pastDoses: readonly PastDose[],
  periodId: string,
  today: string,
  newId: () => string,
): NonNullable<NewTreatmentPlan['doses']> {
  if (pastDoses.length === 0) return []
  const schedule = creationSchedule(settings, periodId, today)
  const pending = new Map(
    pastDuesOfSchedule(schedule, today).map((due) => [`${due.dueOn} ${due.dueTime ?? ''}`, due]),
  )
  return pastDoses.map(({ dueOn, dueTime, status }) => {
    const key = `${dueOn} ${dueTime ?? ''}`
    const due = pending.get(key)
    if (due === undefined) throw new RangeError(`Dose passée inconnue du calendrier : ${key}`)
    pending.delete(key)
    return {
      id: newId(),
      dose: schedule.doseFor(
        status === 'given' ? { kind: 'given', due, givenOn: dueOn } : { kind: 'missed', due },
      ).dose,
    }
  })
}

/** Lève, sans plan, pour une saisie refusée ou une dose passée qui n'est pas une échéance déjà tombée. */
export function creationPlan(
  input: TreatmentCreationInput,
  id: string,
  today: string,
  newId: () => string = () => crypto.randomUUID(),
): NewTreatmentPlan {
  const { animalId, name, type, pastDoses, ...plan } =
    treatmentCreationSchemaFor(today).parse(input)
  const settings = creationSettings(plan)
  return {
    id,
    animalId,
    name,
    type,
    settings,
    doses: pastDoseWrites(settings, pastDoses ?? [], id, today, newId),
  }
}
