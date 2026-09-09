import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import {
  weightEntryInputSchema,
  weightEntryUpdateSchema,
  type WeightEntry,
  type WeightEntryInput,
  type WeightEntryUpdateInput,
} from './weight.schema'

interface WeightEntryRow {
  id: string
  animal_id: string
  weight_kg: number
  measured_on: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const COLUMNS = 'id, animal_id, weight_kg, measured_on, created_at, updated_at, deleted_at'

/** Les pesées supprimées restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toWeightEntry(row: WeightEntryRow): WeightEntry {
  return {
    id: row.id,
    animalId: row.animal_id,
    weightKg: row.weight_kg,
    measuredOn: row.measured_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function createWeightRepository(db: DbClient) {
  async function getById(id: string): Promise<WeightEntry | null> {
    const rows = await db.query<WeightEntryRow>(
      `SELECT ${COLUMNS} FROM weight_entry WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toWeightEntry(row) : null
  }

  return {
    getById,

    /** Ordre chronologique croissant : celui de la courbe, la liste inversée se fait à l'affichage. */
    async listByAnimal(animalId: string): Promise<WeightEntry[]> {
      const rows = await db.query<WeightEntryRow>(
        `SELECT ${COLUMNS} FROM weight_entry
         WHERE animal_id = ? AND ${NOT_DELETED}
         ORDER BY measured_on, created_at`,
        [animalId],
      )
      return rows.map(toWeightEntry)
    },

    async create(input: WeightEntryInput): Promise<WeightEntry> {
      const data = weightEntryInputSchema.parse(input)
      const now = new Date().toISOString()
      const entry: WeightEntry = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO weight_entry (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?)`, [
        entry.id,
        entry.animalId,
        entry.weightKg,
        entry.measuredOn,
        entry.createdAt,
        entry.updatedAt,
        entry.deletedAt,
      ])

      return entry
    },

    /** `animal_id` reste hors du `SET` : le rattachement est figé à la création. */
    async update(id: string, input: WeightEntryUpdateInput): Promise<WeightEntry> {
      const data = weightEntryUpdateSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE weight_entry
         SET weight_kg = ?, measured_on = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [data.weightKg, data.measuredOn, updatedAt, id],
      )

      if (changes === 0) {
        throw new Error(`Pesée introuvable : ${id}`)
      }

      const entry = await getById(id)
      if (!entry) {
        throw new Error(`Pesée introuvable : ${id}`)
      }
      return entry
    },

    /** Sans effet sur une pesée inconnue ou déjà supprimée : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE weight_entry SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },
  }
}

export type WeightRepository = ReturnType<typeof createWeightRepository>

let repository: Promise<WeightRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getWeightRepository(): Promise<WeightRepository> {
  repository ??= getDb()
    .then(createWeightRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
