import { describe, expect, it } from 'vitest'

import {
  gridBeforeColumn,
  gridBeforeFromColumn,
  MAX_GRID_BEFORE_LENGTH,
} from '../schema/grid-before.schema'

const grid = {
  frequency: { value: 3, unit: 'day' },
  endsOn: null,
  runs: [
    ['2026-03-26', '2026-03-29', '2026-03-26'],
    ['2026-04-02', null, '2026-04-02'],
  ],
}

describe('grille d’avant l’ouverture, telle qu’elle se range dans la colonne', () => {
  it('se relit à l’identique', () => {
    expect(gridBeforeFromColumn(gridBeforeColumn(grid as never))).toEqual(grid)
  })

  it('vide reste vide', () => {
    expect(gridBeforeColumn(null)).toBeNull()
    expect(gridBeforeFromColumn(null)).toBeNull()
  })

  it.each<[string, unknown]>([
    ['un texte qui n’est pas du JSON', 'pas du json'],
    ['une clé de trop', JSON.stringify({ ...grid, extra: 1 })],
    ['une suite à deux jours', JSON.stringify({ ...grid, runs: [['2026-03-26', '2026-03-29']] })],
    ['un jour illisible', JSON.stringify({ ...grid, runs: [['2026-02-30', null, '2026-02-30']] })],
    ['une fréquence inconnue', JSON.stringify({ ...grid, frequency: { value: 3, unit: 'year' } })],
    ['une fin illisible', JSON.stringify({ ...grid, endsOn: 'demain' })],
    [
      'un texte trop long',
      JSON.stringify({
        ...grid,
        runs: Array.from({ length: MAX_GRID_BEFORE_LENGTH }, () => [
          '2026-03-26',
          null,
          '2026-03-26',
        ]),
      }),
    ],
  ])('illisible (%s) : la colonne se lit vide, sans erreur', (_, column) => {
    expect(gridBeforeFromColumn(column)).toBeNull()
  })
})
