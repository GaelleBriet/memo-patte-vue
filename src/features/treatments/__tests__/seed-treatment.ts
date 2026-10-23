import { createTreatmentDosesRepository } from '../repository/treatment-doses.repository'
import { currentPeriodIdSql } from '../repository/treatment-periods.repository'
import {
  createTreatmentsRepository,
  type TreatmentsRepository,
} from '../repository/treatments.repository'
import type { Treatment, TreatmentFrequency, TreatmentInput } from '../schema/treatment.schema'

type DbClient = Parameters<typeof createTreatmentsRepository>[0]

export type SeedTreatment = TreatmentInput & { lastDoseDate: string }

type HeadEdit = Pick<Treatment, 'name' | 'type'> & { frequency: TreatmentFrequency }

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
      targetOn: null,
      previousTargetOn: null,
      previousTargetTime: null,
      dueRank: null,
      createdAt: created.createdAt,
      updatedAt: created.createdAt,
      deletedAt: null,
    }),
  ])
  const seeded = await treatments.getById(id)
  if (seeded === null) throw new Error('Traitement de test introuvable.')
  return seeded
}

/** Nom, type et fréquence corrigés sur place, et la prochaine dose posée sur la prise du seed. */
async function seedHeadEdit(db: DbClient, id: string, edit: HeadEdit): Promise<void> {
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
  ])
}

/** Dernière prise ou report de la période en cours, hors décalages et prises en plus. */
export async function headDose(treatments: TreatmentsRepository, treatmentId: string) {
  const [treatment, doses] = await Promise.all([
    treatments.getById(treatmentId),
    treatments.listDoses(treatmentId),
  ])
  const head = doses.find(
    ({ periodId, status }) =>
      periodId === treatment?.periodId && status !== 'shift' && status !== 'extra',
  )
  return head ? { givenOn: head.givenOn, targetOn: head.targetOn } : null
}

/** Les deux écritures d'un carnet de test, pour une base donnée. */
export function seededTreatments(db: DbClient) {
  return {
    create: (input: SeedTreatment) => seedTreatmentWithDose(db, input),
    update: (id: string, edit: HeadEdit) => seedHeadEdit(db, id, edit),
  }
}
