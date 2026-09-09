import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { addFrequency } from './treatment-frequency'
import {
  treatmentInputSchema,
  treatmentUpdateSchema,
  type FrequencyUnit,
  type Treatment,
  type TreatmentInput,
  type TreatmentType,
  type TreatmentUpdateInput,
} from './treatment.schema'

interface TreatmentRow {
  id: string
  animal_id: string
  name: string
  type: TreatmentType
  frequency_value: number
  frequency_unit: FrequencyUnit
  last_dose_date: string
  next_due_date: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const COLUMNS =
  'id, animal_id, name, type, frequency_value, frequency_unit, last_dose_date, next_due_date, created_at, updated_at, deleted_at'

/** Les traitements supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toTreatment(row: TreatmentRow): Treatment {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    type: row.type,
    frequency: { value: row.frequency_value, unit: row.frequency_unit },
    lastDoseDate: row.last_dose_date,
    nextDueDate: row.next_due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function createTreatmentsRepository(db: DbClient) {
  async function getById(id: string): Promise<Treatment | null> {
    const rows = await db.query<TreatmentRow>(
      `SELECT ${COLUMNS} FROM treatment WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toTreatment(row) : null
  }

  return {
    getById,

    /** Le plus urgent d'abord : l'ordre de la section « Traitements en cours » et de l'accueil. */
    async listByAnimal(animalId: string): Promise<Treatment[]> {
      const rows = await db.query<TreatmentRow>(
        `SELECT ${COLUMNS} FROM treatment
         WHERE animal_id = ? AND ${NOT_DELETED}
         ORDER BY next_due_date, created_at`,
        [animalId],
      )
      return rows.map(toTreatment)
    },

    async create(input: TreatmentInput): Promise<Treatment> {
      const data = treatmentInputSchema.parse(input)
      const now = new Date().toISOString()
      const treatment: Treatment = {
        ...data,
        id: crypto.randomUUID(),
        nextDueDate: addFrequency(data.lastDoseDate, data.frequency),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO treatment (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        treatment.id,
        treatment.animalId,
        treatment.name,
        treatment.type,
        treatment.frequency.value,
        treatment.frequency.unit,
        treatment.lastDoseDate,
        treatment.nextDueDate,
        treatment.createdAt,
        treatment.updatedAt,
        treatment.deletedAt,
      ])

      return treatment
    },

    /** `animal_id` reste hors du `SET` : le rattachement est figé à la création. */
    async update(id: string, input: TreatmentUpdateInput): Promise<Treatment> {
      const data = treatmentUpdateSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE treatment
         SET name = ?, type = ?, frequency_value = ?, frequency_unit = ?,
             last_dose_date = ?, next_due_date = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [
          data.name,
          data.type,
          data.frequency.value,
          data.frequency.unit,
          data.lastDoseDate,
          addFrequency(data.lastDoseDate, data.frequency),
          updatedAt,
          id,
        ],
      )

      if (changes === 0) {
        throw new Error(`Traitement introuvable : ${id}`)
      }

      const treatment = await getById(id)
      if (!treatment) {
        throw new Error(`Traitement introuvable : ${id}`)
      }
      return treatment
    },

    /** Sans effet sur un traitement inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE treatment SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },
  }
}

export type TreatmentsRepository = ReturnType<typeof createTreatmentsRepository>

let repository: Promise<TreatmentsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getTreatmentsRepository(): Promise<TreatmentsRepository> {
  repository ??= getDb()
    .then(createTreatmentsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
