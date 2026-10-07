import {
  isNoteLine,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
  type TreatmentSchedule,
} from './treatment-schedule'

/** Fin d'un traitement fini : sa date de fin une fois atteinte, sinon sa dernière échéance notée. */
export function endedOnOf(
  treatment: { periods: readonly Pick<TreatmentPeriodInput, 'id' | 'endsOn'>[] },
  schedule: Pick<TreatmentSchedule, 'phase' | 'currentPeriodId' | 'doses'>,
  today: string,
): string | null {
  const period = treatment.periods.find(({ id }) => id === schedule.currentPeriodId) ?? null
  if (schedule.phase !== 'ended' || period === null) return null
  if (period.endsOn !== null && period.endsOn <= today) return period.endsOn
  const noted = schedule.doses
    .filter((dose) => dose.periodId === period.id && isNoteLine(dose))
    .map(({ dueOn }) => dueOn)
    .sort()
  return noted.at(-1) ?? period.endsOn
}

/** Arrêté avant sa première échéance, sans aucune prise notée sur tout le traitement. */
export function isStoppedBeforeFirstDose(
  { firstDueOn, stoppedOn }: Pick<TreatmentPeriodInput, 'firstDueOn' | 'stoppedOn'>,
  doses: readonly Pick<TreatmentDoseInput, 'status'>[],
): boolean {
  const noted = doses.some((dose) => isNoteLine(dose) || dose.status === 'extra')
  return stoppedOn !== null && stoppedOn < firstDueOn && !noted
}
