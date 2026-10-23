import type { Animal, AnimalRecord } from '../schema/animal.schema'

export interface AnimalRow {
  id: string
  name: string
  species: string
  breed: string | null
  birth_date: string | null
  birth_date_approximate: number
  photo_path: string | null
  unfollowed_on: string | null
  departure_reason: string | null
  departure_date: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  created_by_device: string
  updated_by_device: string
}

export const COLUMNS =
  'id, name, species, breed, birth_date, birth_date_approximate, photo_path, unfollowed_on, ' +
  'departure_reason, departure_date, created_at, updated_at, deleted_at, created_by_device, ' +
  'updated_by_device'

/** Les animaux supprimés restent en base pour la synchronisation, jamais pour l'UI. */
export const NOT_DELETED = 'deleted_at IS NULL'

export function toAnimal(row: AnimalRow): Animal {
  return {
    id: row.id,
    name: row.name,
    species: row.species as Animal['species'],
    breed: row.breed,
    birthDate: row.birth_date,
    birthDateApproximate: row.birth_date_approximate === 1,
    photoPath: row.photo_path,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
    unfollowedOn: row.unfollowed_on,
    departureReason: row.departure_reason as Animal['departureReason'],
    departureDate: row.departure_date,
  }
}

export function toAnimalRecord(row: AnimalRow): AnimalRecord {
  return {
    ...toAnimal(row),
    createdByDevice: row.created_by_device,
    updatedByDevice: row.updated_by_device,
  }
}
