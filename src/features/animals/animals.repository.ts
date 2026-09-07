import type { DbClient } from '@/core/db/db-client'
import { animalInputSchema, type Animal, type AnimalInput } from './animal.schema'

/** Ligne brute de la table `animal` (colonnes en snake_case). */
interface AnimalRow {
  id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  initial_weight_kg: number | null
  photo_path: string | null
  created_at: string
  updated_at: string
}

const COLUMNS =
  'id, name, species, breed, birth_date, initial_weight_kg, photo_path, created_at, updated_at'

function toAnimal(row: AnimalRow): Animal {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Animal['species'],
    breed: row.breed,
    birthDate: row.birth_date,
    initialWeightKg: row.initial_weight_kg,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/**
 * Seul point d'accès à la table `animal`.
 *
 * Le client de base est injecté : l'application lui passe `getDb()`
 * (`core/db/sqlite.ts`), les tests une base sql.js en mémoire.
 */
export function createAnimalsRepository(db: DbClient) {
  async function getById(id: string): Promise<Animal | null> {
    const rows = await db.query<AnimalRow>(`SELECT ${COLUMNS} FROM animal WHERE id = ?`, [id])
    const row = rows[0]
    return row ? toAnimal(row) : null
  }

  return {
    getById,

    async list(): Promise<Animal[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal ORDER BY name COLLATE NOCASE`,
      )
      return rows.map(toAnimal)
    },

    async create(input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const now = new Date().toISOString()
      const animal: Animal = { ...data, id: crypto.randomUUID(), createdAt: now, updatedAt: now }

      await db.run(`INSERT INTO animal (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.initialWeightKg,
        animal.photoPath,
        animal.createdAt,
        animal.updatedAt,
      ])

      return animal
    },

    async update(id: string, input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE animal
         SET name = ?, species = ?, breed = ?, birth_date = ?, initial_weight_kg = ?,
             photo_path = ?, updated_at = ?
         WHERE id = ?`,
        [
          data.name,
          data.species,
          data.breed,
          data.birthDate,
          data.initialWeightKg,
          data.photoPath,
          updatedAt,
          id,
        ],
      )

      if (changes === 0) {
        throw new Error(`Animal introuvable : ${id}`)
      }

      const animal = await getById(id)
      if (!animal) {
        throw new Error(`Animal introuvable : ${id}`)
      }
      return animal
    },

    async remove(id: string): Promise<void> {
      await db.run('DELETE FROM animal WHERE id = ?', [id])
    },
  }
}

export type AnimalsRepository = ReturnType<typeof createAnimalsRepository>
