import type { DbClient } from '@/core/db/db-client'
import { LIVE_ANIMAL_PHOTOS_FROM } from '@/core/db/schema-statements'

export function createCarnetPhotosRepository(db: DbClient) {
  return {
    /** Une photo retirée garde son fichier le temps d'« Annuler » : sa présence seule ne suffit pas. */
    async isPhotoInCarnet(fileName: string): Promise<boolean> {
      const rows = await db.query(
        `SELECT 1 ${LIVE_ANIMAL_PHOTOS_FROM} AND photo_path = ? LIMIT 1`,
        [fileName],
      )
      return rows.length > 0
    },

    async isPhotoKeptByAnimal(fileName: string): Promise<boolean> {
      const rows = await db.query('SELECT 1 FROM animal WHERE photo_path = ? LIMIT 1', [fileName])
      return rows.length > 0
    },

    async listCarnetPhotos(): Promise<string[]> {
      const rows = await db.query<{ photo_path: string }>(
        `SELECT DISTINCT photo_path ${LIVE_ANIMAL_PHOTOS_FROM}`,
      )
      return rows.map(({ photo_path }) => photo_path)
    },
  }
}

export type CarnetPhotosRepository = ReturnType<typeof createCarnetPhotosRepository>
