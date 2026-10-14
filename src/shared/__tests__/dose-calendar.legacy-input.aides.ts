import {
  gridOriginsOf,
  targetOnOf,
  type LegacyDose,
  type LegacyPeriod,
  type TreatmentViewInput,
} from '../domain/dose-calendar'

/** Un carnet au schéma v11, comme les carnets gelés de l'ancien moteur et le jeu de recette. */
export type LegacyInput = {
  periods: readonly LegacyPeriod[]
  doses: readonly LegacyDose[]
  today: string
}

/** Le carnet lu par le moteur v2, avec la conversion v11 → v12 de l'app. */
export function viewInputOf({ periods, doses, today }: LegacyInput): TreatmentViewInput {
  const origins = gridOriginsOf(periods)
  return {
    settings: periods.map((period) => {
      const { referenceOn: _, ...setting } = period
      return { ...setting, gridOriginOn: origins.get(period.id)! }
    }),
    lines: doses.map(({ periodId, nextDueDate, ...dose }) => ({
      id: dose.id,
      settingId: periodId,
      dueOn: dose.dueOn,
      dueTime: dose.dueTime,
      status: dose.status,
      givenOn: dose.givenOn,
      targetOn: targetOnOf({ status: dose.status, nextDueDate }),
      updatedAt: dose.updatedAt,
    })),
    today,
  }
}
