import { describe, expect, it } from 'vitest'

import { toPdfExportAnimals } from '../logic/pdf-export-animals'
import type { Animal } from '@/features/animals/schema/animal.schema'

function animal(id: string, name: string): Animal {
  return {
    id,
    name,
    species: 'dog',
    breed: null,
    birthDate: null,
    birthDateApproximate: false,
    photoPath: null,
    createdAt: '2026-09-09T09:00:00.000Z',
    updatedAt: '2026-09-09T09:00:00.000Z',
    deletedAt: null,
    unfollowedOn: null,
    departureReason: null,
    departureDate: null,
  }
}

describe('toPdfExportAnimals', () => {
  it('garde l’ordre reçu, réduit à l’identifiant et au nom', () => {
    expect(toPdfExportAnimals([animal('b', 'Pixel'), animal('a', 'Milo')])).toEqual([
      { id: 'b', name: 'Pixel' },
      { id: 'a', name: 'Milo' },
    ])
  })
})
