import { addDays, differenceInCalendarDays, formatISO, parseISO } from 'date-fns'

import { treatmentReadingOf } from './treatment-reading-adapter'
import {
  currentPeriod,
  lastNotedDueOn,
  settingsOf,
  startsTooFarBack,
  tooOld,
  withRhythm,
  type PlanIds,
} from './treatment-settings'
import { openingOf } from './treatment-settings-writes'
import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import {
  treatmentResumptionSchema,
  type TreatmentResumptionInput,
  type TreatmentRhythm,
} from '../schema/treatment-form.schema'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { isCalendarDay, latestOf, nextDay } from '@/shared/domain/calendar-day'
import type { Phase } from '@/shared/domain/dose-calendar'

export type ResumptionDraft = {
  period: TreatmentPeriodRecord
  /** Faux tant que le traitement est en cours. */
  canResume: boolean
  startedOn: string
  /** Fin de la dernière période : son arrêt, sinon sa date de fin. */
  endedOn: string | null
  /** Durée à reproduire, première et dernière journée comprises ; `null` sans date de fin. */
  durationDays: number | null
  /** Première date acceptée pour la première prise de la reprise. */
  earliestOn: string
  /** Date de fin qui reproduit cette durée à partir de la première prise choisie. */
  endsOnFor(firstDoseOn: string): string | null
}

// La nouvelle période ne retire rien à la précédente : dès le jour de l'arrêt (G3), qui garde ses
// prises même notées en avance, ou au lendemain de la date de fin et de la dernière prise notée
// d'une période finie.
function resumptionEarliestOn(
  treatment: TreatmentWithPeriods,
  period: TreatmentPeriodRecord,
): string {
  if (period.stoppedOn !== null)
    return latestOf([period.startsOn, period.stoppedOn]) ?? period.stoppedOn
  const after = latestOf([lastNotedDueOn(treatment, period.id), period.endsOn]) ?? null
  return latestOf([period.startsOn, after === null ? null : nextDay(after)]) ?? period.startsOn
}

export function isResumablePhase(phase: Phase): boolean {
  return phase === 'stopped' || phase === 'ended'
}

export function resumptionDraft(treatment: TreatmentWithPeriods, today: string): ResumptionDraft {
  const { view } = treatmentReadingOf(treatment, today)
  const period = currentPeriod(treatment, view)
  const durationDays =
    period.endsOn === null
      ? null
      : differenceInCalendarDays(parseISO(period.endsOn), parseISO(period.firstDueOn)) + 1
  return {
    period,
    canResume: isResumablePhase(view.phase),
    startedOn: period.firstDueOn,
    endedOn: period.stoppedOn ?? period.endsOn,
    earliestOn: resumptionEarliestOn(treatment, period),
    durationDays,
    endsOnFor: (firstDoseOn) =>
      durationDays === null || durationDays < 1 || !isCalendarDay(firstDoseOn)
        ? null
        : formatISO(addDays(parseISO(firstDoseOn), durationDays - 1), { representation: 'date' }),
  }
}

function resumedSettings(
  period: TreatmentPeriodRecord,
  { firstDoseOn, ...rhythm }: TreatmentRhythm & { firstDoseOn: string },
): TreatmentPeriodSettings {
  return withRhythm(
    { ...settingsOf(period), startsOn: firstDoseOn, firstDueOn: firstDoseOn },
    rhythm,
  )
}

/** Le schéma de « Reprendre », la première prise après la dernière période. */
export function treatmentResumptionSchemaFor(treatment: TreatmentWithPeriods, today: string) {
  const { period, earliestOn } = resumptionDraft(treatment, today)
  return treatmentResumptionSchema
    .refine(({ firstDoseOn }) => firstDoseOn >= earliestOn, {
      path: ['firstDoseOn'],
      message: 'tooEarly',
    })
    .superRefine((data, context) => {
      const settings = resumedSettings(period, data)
      if (data.firstDoseOn >= earliestOn && startsTooFarBack(treatment, settings, today)) {
        context.addIssue(tooOld())
      }
    })
}

/** Lève pour un traitement en cours ou une saisie refusée ; la période précédente n'est jamais touchée. */
export function resumptionPlan(
  treatment: TreatmentWithPeriods,
  input: TreatmentResumptionInput,
  today: string,
  ids: PlanIds,
): TreatmentPlanWrite {
  const { period, canResume } = resumptionDraft(treatment, today)
  if (!canResume) throw new Error(`Traitement en cours, rien à reprendre : ${treatment.id}`)
  const data = treatmentResumptionSchemaFor(treatment, today).parse(input)
  const settings = resumedSettings(period, data)
  return { treatment: null, period: openingOf(settings, ids.periodId), doses: [] }
}
