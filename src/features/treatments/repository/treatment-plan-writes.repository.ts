import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { TreatmentDosesRepository } from './treatment-doses.repository'
import type { TreatmentPeriodsRepository } from './treatment-periods.repository'
import { COLUMNS, NOT_DELETED } from './treatment-row.repository'
import { treatmentFirstPeriodSettingsSchema } from '../schema/treatment-period.schema'
import {
  treatmentNameSchema,
  treatmentTypeSchema,
  type Treatment,
} from '../schema/treatment.schema'
import type {
  NewTreatmentPlan,
  PlannedDoseWrite,
  TreatmentPlanWrite,
} from '../schema/treatment-plan.schema'

interface PlanWritesCollaborators {
  periods: Pick<TreatmentPeriodsRepository, 'insertStatement' | 'correctSettingsStatement'>
  doses: Pick<
    TreatmentDosesRepository,
    'createStatement' | 'rewriteStatement' | 'markDeletedStatement'
  >
  getById: (id: string) => Promise<Treatment | null>
}

export function createTreatmentPlanWrites(
  db: DbClient,
  deviceId: () => string,
  { periods, doses, getById }: PlanWritesCollaborators,
) {
  async function requireVisible(id: string): Promise<Treatment> {
    const treatment = await getById(id)
    if (!treatment) {
      throw new Error(`Traitement introuvable : ${id}`)
    }
    return treatment
  }

  function identityOf({ name, type }: Pick<Treatment, 'name' | 'type'>) {
    return {
      name: treatmentNameSchema.parse(name),
      type: treatmentTypeSchema.parse(type),
    }
  }

  function doseStatement(
    write: PlannedDoseWrite,
    { id: treatmentId, animalId }: Treatment,
    at: string,
  ): SqlStatement {
    switch (write.action) {
      case 'create':
        return doses.createStatement({ id: write.id, treatmentId, animalId, dose: write.dose, at })
      case 'rewrite':
        return doses.rewriteStatement(write.id, write.dose, at, at)
      case 'delete':
        return doses.markDeletedStatement([write.id], at)
    }
  }

  return {
    /** Le traitement, sa première période, de même identifiant, et les prises du plan : tout ou rien. */
    async create(plan: NewTreatmentPlan): Promise<Treatment> {
      const { name, type } = identityOf(plan)
      treatmentFirstPeriodSettingsSchema.parse(plan.settings)
      const now = new Date().toISOString()

      await db.runMany([
        {
          sql: `INSERT INTO treatment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)`,
          params: [plan.id, plan.animalId, name, type, now, now, deviceId(), deviceId()],
        },
        periods.insertStatement({
          ...plan.settings,
          gridOriginOn: plan.settings.firstDueOn,
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          id: plan.id,
          treatmentId: plan.id,
          animalId: plan.animalId,
          stoppedOn: null,
          createdAt: now,
          updatedAt: now,
          deletedAt: null,
        }),
        ...(plan.doses ?? []).map(({ id, dose }) =>
          doses.createStatement({
            id,
            treatmentId: plan.id,
            animalId: plan.animalId,
            dose,
            at: now,
          }),
        ),
      ])

      return requireVisible(plan.id)
    },

    /**
     * Nom et type, réglages de la période en cours ou nouvelle période, lignes de déplacement :
     * tout ou rien. Une ligne que rien ne change n'est pas datée ; `animal_id` reste figé.
     */
    async applyPlan(id: string, plan: TreatmentPlanWrite): Promise<Treatment> {
      const current = await requireVisible(id)
      const at = new Date().toISOString()
      const statements: SqlStatement[] = []

      if (plan.treatment !== null) {
        const { name, type } = identityOf(plan.treatment)
        statements.push({
          sql: `UPDATE treatment SET name = ?, type = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED} AND (name <> ? OR type <> ?)`,
          params: [name, type, at, deviceId(), id, name, type],
        })
      }
      if (plan.period?.action === 'correct') {
        const { id: periodId, settings, judgedGrid, ...origin } = plan.period
        statements.push(
          periods.correctSettingsStatement(periodId, settings, at, origin, judgedGrid),
        )
      }
      if (plan.period?.action === 'open') {
        statements.push(
          periods.insertStatement({
            ...plan.period.settings,
            gridOriginOn: plan.period.gridOriginOn,
            firstDueChosen: plan.period.firstDueChosen,
            fallenDosesAnswer: plan.period.fallenDosesAnswer,
            id: plan.period.id,
            treatmentId: id,
            animalId: current.animalId,
            stoppedOn: null,
            createdAt: at,
            updatedAt: at,
            gridWrittenAt: plan.period.judgedGrid ?? at,
            gridBefore: plan.period.gridBefore ?? null,
            deletedAt: null,
          }),
        )
      }
      statements.push(...plan.doses.map((write) => doseStatement(write, current, at)))

      if (statements.length > 0) await db.runMany(statements)
      return requireVisible(id)
    },
  }
}
