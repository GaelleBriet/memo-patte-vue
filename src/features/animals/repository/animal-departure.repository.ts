import type { DbClient, SqlStatement } from '@/core/db/db-client'
import type { Departure } from '../schema/animal.schema'
import { COLUMNS, NOT_DELETED, toAnimalRecord, type AnimalRow } from './animal-row.repository'

export function createAnimalDeparture(db: DbClient, deviceId: () => string) {
  return {
    /** `null` pour un animal inconnu ou supprimé. */
    async getDeparture(id: string): Promise<Departure | null> {
      const rows = await db.query<AnimalRow>(
        `SELECT ${COLUMNS} FROM animal WHERE id = ? AND ${NOT_DELETED}`,
        [id],
      )
      const row = rows[0]
      if (!row) return null
      const { unfollowedOn, departureReason, departureDate } = toAnimalRecord(row)
      return { unfollowedOn, departureReason, departureDate }
    },

    /** `related` : écritures d'autres tables jouées dans la même transaction. */
    async setDeparture(
      id: string,
      departure: Departure,
      related: SqlStatement[] = [],
    ): Promise<void> {
      const at = new Date().toISOString()
      await db.runMany([
        {
          sql: `UPDATE animal
                SET unfollowed_on = ?, departure_reason = ?, departure_date = ?, updated_at = ?,
                    updated_by_device = ?
                WHERE id = ? AND ${NOT_DELETED}`,
          params: [
            departure.unfollowedOn,
            departure.departureReason,
            departure.departureDate,
            at,
            deviceId(),
            id,
          ],
        },
        ...related,
      ])
    },

    /** Lève pour un animal suivi ou supprimé : rien n'est écrit. */
    async setDepartureDetails(
      id: string,
      { departureReason, departureDate }: Omit<Departure, 'unfollowedOn'>,
    ): Promise<void> {
      const changed = await db.run(
        `UPDATE animal
         SET departure_reason = ?, departure_date = ?, updated_at = ?, updated_by_device = ?
         WHERE id = ? AND unfollowed_on IS NOT NULL AND ${NOT_DELETED}`,
        [departureReason, departureDate, new Date().toISOString(), deviceId(), id],
      )
      if (changed === 0) throw new Error(`Animal suivi ou introuvable : ${id}`)
    },
  }
}
