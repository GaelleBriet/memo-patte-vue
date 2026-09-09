import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import {
  vaccinationInputSchema,
  vaccinationUpdateSchema,
  type Vaccination,
  type VaccinationInput,
  type VaccinationUpdateInput,
} from './vaccination.schema'

interface VaccinationRow {
  id: string
  animal_id: string
  name: string
  last_injection_date: string
  due_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

const COLUMNS =
  'id, animal_id, name, last_injection_date, due_date, created_at, updated_at, deleted_at'

/** Les vaccins supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

function toVaccination(row: VaccinationRow): Vaccination {
  return {
    id: row.id,
    animalId: row.animal_id,
    name: row.name,
    lastInjectionDate: row.last_injection_date,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export function createVaccinationsRepository(db: DbClient) {
  async function getById(id: string): Promise<Vaccination | null> {
    const rows = await db.query<VaccinationRow>(
      `SELECT ${COLUMNS} FROM vaccination WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toVaccination(row) : null
  }

  return {
    getById,

    async listByAnimal(animalId: string): Promise<Vaccination[]> {
      const rows = await db.query<VaccinationRow>(
        `SELECT ${COLUMNS} FROM vaccination
         WHERE animal_id = ? AND ${NOT_DELETED}
         ORDER BY last_injection_date DESC, name COLLATE NOCASE`,
        [animalId],
      )
      return rows.map(toVaccination)
    },

    async create(input: VaccinationInput): Promise<Vaccination> {
      const data = vaccinationInputSchema.parse(input)
      const now = new Date().toISOString()
      const vaccination: Vaccination = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO vaccination (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        vaccination.id,
        vaccination.animalId,
        vaccination.name,
        vaccination.lastInjectionDate,
        vaccination.dueDate,
        vaccination.createdAt,
        vaccination.updatedAt,
        vaccination.deletedAt,
      ])

      return vaccination
    },

    /** `animal_id` reste hors du `SET` : le rattachement est figé à la création. */
    async update(id: string, input: VaccinationUpdateInput): Promise<Vaccination> {
      const data = vaccinationUpdateSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE vaccination
         SET name = ?, last_injection_date = ?, due_date = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [data.name, data.lastInjectionDate, data.dueDate, updatedAt, id],
      )

      if (changes === 0) {
        throw new Error(`Vaccin introuvable : ${id}`)
      }

      const vaccination = await getById(id)
      if (!vaccination) {
        throw new Error(`Vaccin introuvable : ${id}`)
      }
      return vaccination
    },

    /** Sans effet sur un vaccin inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },

    /** Instruction fournie sans être exécutée : la suppression d'un animal la joue dans sa transaction. */
    markDeletedByAnimalStatement(animalId: string, deletedAt: string): SqlStatement {
      return {
        sql: `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE animal_id = ? AND ${NOT_DELETED}`,
        params: [deletedAt, deletedAt, animalId],
      }
    },
  }
}

export type VaccinationsRepository = ReturnType<typeof createVaccinationsRepository>

let repository: Promise<VaccinationsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getVaccinationsRepository(): Promise<VaccinationsRepository> {
  repository ??= getDb()
    .then(createVaccinationsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
