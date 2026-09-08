import type { DbClient } from '@/core/db/db-client'
import {
  vaccinationInputSchema,
  type Vaccination,
  type VaccinationInput,
} from './vaccination.schema'

/** Ligne brute de la table `vaccination` (colonnes en snake_case). */
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

/**
 * Seul point d'accès à la table `vaccination`.
 *
 * Le client de base est injecté : l'application lui passe `getDb()`
 * (`core/db/sqlite.ts`), les tests une base sql.js en mémoire.
 *
 * La suppression est logique (`deleted_at`) : la ligne survit pour que la
 * synchronisation Plus puisse propager la suppression aux autres appareils,
 * mais un vaccin supprimé est invisible pour tout le reste de l'application.
 */
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

    /** Vaccins d'un animal, injection la plus récente en tête. */
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

    /** Un vaccin supprimé est traité comme inexistant : la mise à jour échoue. */
    async update(id: string, input: VaccinationInput): Promise<Vaccination> {
      const data = vaccinationInputSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE vaccination
         SET animal_id = ?, name = ?, last_injection_date = ?, due_date = ?, updated_at = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [data.animalId, data.name, data.lastInjectionDate, data.dueDate, updatedAt, id],
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

    /**
     * Marque le vaccin comme supprimé. Sans effet sur un identifiant inconnu ou
     * sur un vaccin déjà supprimé (la date de suppression initiale est gardée).
     */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE vaccination SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },
  }
}

export type VaccinationsRepository = ReturnType<typeof createVaccinationsRepository>
