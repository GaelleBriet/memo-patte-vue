import { describe, expect, it } from 'vitest'

import { pdfExportChoice, toPdfExportAnimals } from '../logic/pdf-export-animals'
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

describe('pdfExportChoice', () => {
  const milo = { id: 'a', name: 'Milo' }
  const pixel = { id: 'b', name: 'Pixel' }
  const luna = { id: 'c', name: 'Luna' }

  it('nomme l’animal quand la feuille n’en a qu’un', () => {
    expect(pdfExportChoice([milo], [])).toEqual({ kind: 'one', name: 'Milo' })
    expect(pdfExportChoice([], [luna])).toEqual({ kind: 'one', name: 'Luna' })
  })

  it('propose tous les animaux à partir de deux animaux suivis', () => {
    expect(pdfExportChoice([milo, pixel], [])).toEqual({ kind: 'allOrOne' })
    expect(pdfExportChoice([milo, pixel], [luna])).toEqual({ kind: 'allOrOne' })
  })

  it('propose un animal au choix, sans « Tous les animaux », sous deux animaux suivis', () => {
    expect(pdfExportChoice([milo], [luna])).toEqual({ kind: 'oneOfSeveral' })
    expect(pdfExportChoice([], [luna, pixel])).toEqual({ kind: 'oneOfSeveral' })
  })

  it('ne propose rien sans animal', () => {
    expect(pdfExportChoice([], [])).toBeNull()
  })
})
