import type { DbClient, SqlStatement } from '@/core/db/db-client'
import { animalInputSchema, type Animal, type AnimalInput } from '../schema/animal.schema'
import { NOT_DELETED } from './animal-row.repository'
import type { AnimalReads } from './animal-reads.repository'

const INSERT = `INSERT INTO animal
  (id, name, species, breed, birth_date, birth_date_approximate, photo_path, created_at, updated_at,
   created_by_device, updated_by_device)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`

export function createAnimalWrites(
  db: DbClient,
  deviceId: () => string,
  { getById }: Pick<AnimalReads, 'getById'>,
) {
  return {
    /** `related` : écritures d'autres tables liées à la création, jouées dans la même transaction. */
    async create(
      input: AnimalInput,
      related: (animal: Animal) => SqlStatement[] = () => [],
    ): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const now = new Date().toISOString()
      const animal: Animal = {
        ...data,
        id: crypto.randomUUID(),
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        unfollowedOn: null,
        departureReason: null,
        departureDate: null,
      }

      await db.runMany([
        {
          sql: INSERT,
          params: [
            animal.id,
            animal.name,
            animal.species,
            animal.breed,
            animal.birthDate,
            animal.birthDateApproximate ? 1 : 0,
            animal.photoPath,
            animal.createdAt,
            animal.updatedAt,
            deviceId(),
            deviceId(),
          ],
        },
        ...related(animal),
      ])

      return animal
    },

    async update(id: string, input: AnimalInput): Promise<Animal> {
      const data = animalInputSchema.parse(input)
      const updatedAt = new Date().toISOString()

      const changes = await db.run(
        `UPDATE animal
         SET name = ?, species = ?, breed = ?, birth_date = ?, birth_date_approximate = ?,
             photo_path = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND ${NOT_DELETED}`,
        [
          data.name,
          data.species,
          data.breed,
          data.birthDate,
          data.birthDateApproximate ? 1 : 0,
          data.photoPath,
          updatedAt,
          deviceId(),
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
    async remove(
      id: string,
      cascade: SqlStatement[] = [],
      deletedAt: string = new Date().toISOString(),
    ): Promise<void> {
      await db.runMany([
        {
          sql: `UPDATE animal SET deleted_at = ?, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [deletedAt, deletedAt, deviceId(), id],
        },
        ...cascade,
      ])
    },

    /**
     * Rend l'animal supprimé à cet instant, et lui seul, avec les écritures de `revive`. Lève sans
     * rien écrire quand il n'a pas été supprimé à cet instant ou qu'il a déjà été rendu.
     */
    async restore(id: string, deletedAt: string, revive: SqlStatement[] = []): Promise<void> {
      const deleted = await db.query<{ id: string }>(
        'SELECT id FROM animal WHERE id = ? AND deleted_at = ?',
        [id, deletedAt],
      )
      if (deleted.length === 0) throw new Error(`Animal introuvable à rendre : ${id}`)
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE animal SET deleted_at = NULL, updated_at = ?, updated_by_device = ?
                WHERE id = ? AND deleted_at = ?`,
          params: [at, deviceId(), id, deletedAt],
        },
        ...revive,
      ])
    },
  }
}
