import { doseFieldsOf } from './treatment-dose-writes'
import { carnetReadingOf, treatmentReadingOf } from './treatment-reading-adapter'
import { openedCarnet, startsTooFarBack, tooOld, withRhythm } from './treatment-settings'
import type { NewTreatmentPlan } from '../schema/treatment-plan.schema'
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
import { play, type Due, type TreatmentView } from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

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

function creationReading(settings: TreatmentPeriodSettings, today: string): TreatmentReading {
  const empty = treatmentReadingOf({ periods: [], doses: [] }, today)
  return carnetReadingOf(openedCarnet(empty.input, settings))
}

// Q42 : les doses non renseignées, et la dose du moment quand elle est déjà passée (jamais celle du jour).
function pastDuesOfView(view: TreatmentView, today: string): Due[] {
  return [...view.unloggedDoses, ...view.currentDoses.filter(({ dueOn }) => dueOn < today)]
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
    return pastDuesOfView(creationReading(settings, today).view, today)
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
  const reading = creationReading(settings, today)
  const pending = new Map(
    pastDuesOfView(reading.view, today).map((due) => [`${due.dueOn} ${due.dueTime ?? ''}`, due]),
  )
  return pastDoses.map(({ dueOn, dueTime, status }) => {
    const key = `${dueOn} ${dueTime ?? ''}`
    const due = pending.get(key)
    if (due === undefined) throw new RangeError(`Dose passée inconnue du calendrier : ${key}`)
    pending.delete(key)
    const noted = play(reading.input, {
      kind: 'note',
      due,
      status,
      givenOn: dueOn,
      shiftsFollowing: false,
    })
    const [change] = 'refusal' in noted ? [] : noted.changes
    if (change === undefined || change.action !== 'create') {
      throw new RangeError(`Dose passée refusée par le calendrier : ${key}`)
    }
    return { id: newId(), dose: { ...doseFieldsOf(change.line), periodId } }
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
