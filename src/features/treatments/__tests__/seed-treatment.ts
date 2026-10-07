import { addFrequency } from '../logic/treatment-frequency'
import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { currentPeriodIdSql } from '../repository/treatment-periods.repository'
import { createTreatmentsRepository } from '../repository/treatments.repository'
import type { Treatment, TreatmentFrequency, TreatmentInput } from '../schema/treatment.schema'

type DbClient = Parameters<typeof createTreatmentsRepository>[0]

export type SeedTreatment = TreatmentInput & { lastDoseDate: string }

type HeadEdit = Pick<Treatment, 'name' | 'type'> & {
  frequency: TreatmentFrequency
  nextDueDate: string
}

/** Traitement avec sa première prise, donnée le jour de `lastDoseDate`, de même identifiant que lui. */
export async function seedTreatmentWithDose(
  db: DbClient,
  input: SeedTreatment,
): Promise<Treatment> {
  const treatments = createTreatmentsRepository(db)
  const id = crypto.randomUUID()
  const created = await treatments.create({
    id,
    animalId: input.animalId,
    name: input.name,
    type: input.type,
    settings: {
      startsOn: input.lastDoseDate,
      firstDueOn: input.lastDoseDate,
      endsOn: null,
      frequency: input.frequency,
      times: [],
      doseQuantity: null,
      doseUnit: null,
      reminderOffsetMinutes: null,
      reminderTime: null,
    },
  })
  await db.runMany([
    createTreatmentDosesRepository(db).insertStatement({
      id,
      periodId: id,
      treatmentId: id,
      animalId: input.animalId,
      dueOn: input.lastDoseDate,
      dueTime: null,
      givenOn: input.lastDoseDate,
      status: 'given',
      nextDueDate: addFrequency(input.lastDoseDate, input.frequency),
      createdAt: created.createdAt,
      updatedAt: created.createdAt,
      deletedAt: null,
    }),
  ])
  const seeded = await treatments.getById(id)
  if (seeded === null) throw new Error('Traitement de test introuvable.')
  return seeded
}

function headDoseIdSql(periodId: string): string {
  return `(SELECT candidate.id FROM treatment_dose candidate
           WHERE candidate.period_id = ${periodId} AND candidate.deleted_at IS NULL
             AND candidate.status NOT IN ('shift', 'extra')
           ORDER BY candidate.due_on DESC, candidate.due_time DESC, candidate.created_at DESC,
             candidate.id DESC
           LIMIT 1)`
}

/** Nom, type et fréquence corrigés sur place, et la prochaine dose posée sur la dernière ligne de la période en cours. */
export async function seedHeadEdit(db: DbClient, id: string, edit: HeadEdit): Promise<void> {
  const at = new Date().toISOString()
  const { value, unit } = edit.frequency
  await db.runMany([
    {
      sql: `UPDATE treatment SET name = ?, type = ?, updated_at = ?
            WHERE id = ? AND (name <> ? OR type <> ?)`,
      params: [edit.name, edit.type, at, id, edit.name, edit.type],
    },
    {
      sql: `UPDATE treatment_period SET frequency_value = ?, frequency_unit = ?, updated_at = ?
            WHERE id = ${currentPeriodIdSql('?')} AND (frequency_value <> ? OR frequency_unit <> ?)`,
      params: [value, unit, at, id, value, unit],
    },
    {
      sql: `UPDATE treatment_dose SET next_due_date = ?, updated_at = ?
            WHERE id = ${headDoseIdSql(currentPeriodIdSql('?'))} AND next_due_date <> ?`,
      params: [edit.nextDueDate, at, id, edit.nextDueDate],
    },
  ])
}

/** Les deux écritures d'un carnet de test, pour une base donnée. */
export function seededTreatments(db: DbClient) {
  return {
    create: (input: SeedTreatment) => seedTreatmentWithDose(db, input),
    update: (id: string, edit: HeadEdit) => seedHeadEdit(db, id, edit),
  }
}
