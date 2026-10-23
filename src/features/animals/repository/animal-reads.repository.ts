import type { DbClient } from '@/core/db/db-client'
import type { Animal, AnimalRecord } from '../schema/animal.schema'
import {
  COLUMNS,
  NOT_DELETED,
  toAnimal,
  toAnimalRecord,
  type AnimalRow,
} from './animal-row.repository'

export function createAnimalReads(db: DbClient) {
  return {
    async getById(id: string): Promise<Animal | null> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      const row = rows[0]
      return row ? toAnimal(row) : null
    },

    async list(): Promise<Animal[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE ${NOT_DELETED}
         ORDER BY created_at, name COLLATE NOCASE`,
      )
      return rows.map(toAnimal)
    },

    /** Animaux visibles, toutes colonnes comprises, dans l'ordre de `list`. */
    async listRecords(): Promise<AnimalRecord[]> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE ${NOT_DELETED}
         ORDER BY created_at, name COLLATE NOCASE`,
      )
      return rows.map(toAnimalRecord)
    },
  }
}

export type AnimalReads = ReturnType<typeof createAnimalReads>
