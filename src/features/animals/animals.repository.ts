import type { DbClient } from '@/core/db/db-client'
import { getDb } from '@/core/db/sqlite'
import { animalInputSchema, type Animal, type AnimalInput } from './animal.schema'

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
  deleted_at: string | null
}

const COLUMNS =
  'id, name, species, breed, birth_date, initial_weight_kg, photo_path, created_at, updated_at, deleted_at'

/** Les animaux supprimés restent en base pour la synchronisation, jamais pour l'UI. */
const NOT_DELETED = 'deleted_at IS NULL'

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
    deletedAt: row.deleted_at,
  }
}

export function createAnimalsRepository(db: DbClient) {
  async function getById(id: string): Promise<Animal | null> {
    const rows = await db.query<AnimalRow>(
      `SELECT ${COLUMNS} FROM animal WHERE id = ? AND ${NOT_DELETED}`,
      [id],
    )
    const row = rows[0]
    return row ? toAnimal(row) : null
  }

  return {
    getById,

    async list(): Promise<Animal[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE ${NOT_DELETED} ORDER BY name COLLATE NOCASE`,
      )
      return rows.map(toAnimal)
    },

    async create(input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const now = new Date().toISOString()
      const animal: Animal = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }

      await db.run(`INSERT INTO animal (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        animal.id,
        animal.name,
        animal.species,
        animal.breed,
        animal.birthDate,
        animal.initialWeightKg,
        animal.photoPath,
        animal.createdAt,
        animal.updatedAt,
        animal.deletedAt,
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
         WHERE id = ? AND ${NOT_DELETED}`,
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

    /** Sans effet sur un animal inconnu ou déjà supprimé : la date initiale est gardée. */
    async remove(id: string): Promise<void> {
      const deletedAt = new Date().toISOString()
      await db.run(
        `UPDATE animal SET deleted_at = ?, updated_at = ? WHERE id = ? AND ${NOT_DELETED}`,
        [deletedAt, deletedAt, id],
      )
    },
  }
}

export type AnimalsRepository = ReturnType<typeof createAnimalsRepository>

let repository: Promise<AnimalsRepository> | null = null

/** Ouverture ratée non mise en cache : `getDb()` doit pouvoir réessayer. */
export function getAnimalsRepository(): Promise<AnimalsRepository> {
  repository ??= getDb()
    .then(createAnimalsRepository)
    .catch((cause: unknown) => {
      repository = null
      throw cause
    })
  return repository
}
