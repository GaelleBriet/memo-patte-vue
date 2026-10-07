import { isNoteLine, type TreatmentPeriodInput, type TreatmentSchedule } from './treatment-schedule'

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

/** Arrêté avant son début : aucune dose n'a jamais été due (#594). */
export function isStoppedBeforeStart({
  startsOn,
  stoppedOn,
}: Pick<TreatmentPeriodInput, 'startsOn' | 'stoppedOn'>): boolean {
  return stoppedOn !== null && stoppedOn < startsOn
}
