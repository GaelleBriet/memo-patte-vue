import { describe, expect, it } from 'vitest'

import { treatmentHeads, vaccinationHeads } from '../domain/carnet-heads'
import type { ExportTreatmentDose, ExportVaccinationInjection } from '../domain/carnet-data'

function injection(
  id: string,
  vaccinationId: string,
  injectedOn: string,
  createdAt = '2026-01-01T00:00:00.000Z',
): ExportVaccinationInjection {
  return {
    id,
    vaccinationId,
    animalId: 'milo',
    injectedOn,
    nextDueDate: null,
    createdAt,
    updatedAt: createdAt,
  }
}

function dose(id: string, givenOn: string, createdAt: string): ExportTreatmentDose {
  return {
    id,
    treatmentId: 'bravecto',
    animalId: 'milo',
    givenOn,
    nextDueDate: '2027-01-01',
    frequency: { value: 3, unit: 'month' },
    createdAt,
    updatedAt: createdAt,
  }
}

describe('têtes du carnet', () => {
  it('retient pour chaque vaccin son injection la plus récente, jamais une ancienne saisie après', () => {
    const heads = vaccinationHeads([
      injection('rage-2025', 'rage', '2025-05-20'),
      injection('carre-2026', 'carre', '2026-03-01'),
      injection('rage-2019', 'rage', '2019-05-20', '2026-09-01T00:00:00.000Z'),
      injection('carre-2024', 'carre', '2024-03-01'),
    ])

    expect([...heads].map(([parent, head]) => [parent, head.id])).toEqual([
      ['rage', 'rage-2025'],
      ['carre', 'carre-2026'],
    ])
  })

  it('à date égale, départage par la saisie puis par l’identifiant, comme la base', () => {
    const later = '2026-09-02T00:00:00.000Z'
    const earlier = '2026-09-01T00:00:00.000Z'

    expect(
      treatmentHeads([dose('b', '2026-09-01', earlier), dose('a', '2026-09-01', later)]).get(
        'bravecto',
      )?.id,
    ).toBe('a')
    expect(
      treatmentHeads([dose('a', '2026-09-01', later), dose('b', '2026-09-01', later)]).get(
        'bravecto',
      )?.id,
    ).toBe('b')
  })
})
