import { describe, expect, it } from 'vitest'

import { pdfExportAnimals } from '../logic/pdf-export-animals'
import type { Animal } from '@/features/animals/schema/animal.schema'

function animal(id: string, name: string, unfollowedOn: string | null = null): Animal {
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
    unfollowedOn,
  }
}

describe('pdfExportAnimals', () => {
  it('garde les animaux suivis dans l’ordre des chips, réduits à leur identifiant et leur nom', () => {
    expect(pdfExportAnimals([animal('b', 'Pixel'), animal('a', 'Milo')])).toEqual({
      followed: [
        { id: 'b', name: 'Pixel' },
        { id: 'a', name: 'Milo' },
      ],
      unfollowed: [],
    })
  })

  it('met à part les animaux qu’on ne suit plus, exportables seuls (DO-4)', () => {
    expect(
      pdfExportAnimals([
        animal('l', 'Luna', '2026-09-20'),
        animal('m', 'Milo'),
        animal('c', 'Carré', '2026-09-01'),
        animal('p', 'Pixel'),
      ]),
    ).toEqual({
      followed: [
        { id: 'm', name: 'Milo' },
        { id: 'p', name: 'Pixel' },
      ],
      unfollowed: [
        { id: 'l', name: 'Luna' },
        { id: 'c', name: 'Carré' },
      ],
    })
  })
})
