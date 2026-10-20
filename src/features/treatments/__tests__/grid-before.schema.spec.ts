import { describe, expect, it } from 'vitest'

import {
  gridBeforeColumn,
  gridBeforeFromColumn,
  MAX_GRID_BEFORE_LENGTH,
} from '../schema/grid-before.schema'

const grid = {
  frequency: { value: 3, unit: 'day' },
  endsOn: null,
  writtenAt: '2026-03-26T07:00:00.000Z',
  runs: [
    ['2026-03-26', '2026-03-29'],
    ['2026-04-02', null],
  ],
}

const withRuns = (runs: unknown[]) => JSON.stringify({ ...grid, runs })

describe('grille d’avant l’ouverture, telle qu’elle se range dans la colonne', () => {
  it('se relit à l’identique', () => {
    expect(gridBeforeFromColumn(gridBeforeColumn(grid as never))).toEqual(grid)
  })

  it('vide reste vide', () => {
    expect(gridBeforeColumn(null)).toBeNull()
    expect(gridBeforeFromColumn(null)).toBeNull()
  })

  it('une suite d’un seul jour se relit', () => {
    expect(gridBeforeFromColumn(withRuns([['2026-03-26', '2026-03-26']]))).not.toBeNull()
  })

  it('une date de grille à la minute se relit comme tout instant d’un export', () => {
    const column = JSON.stringify({ ...grid, writtenAt: '2026-03-26T07:00Z' })

    expect(gridBeforeFromColumn(column)?.writtenAt).toBe('2026-03-26T07:00:00.000Z')
  })

  it.each<[string, unknown]>([
    ['un texte qui n’est pas du JSON', 'pas du json'],
    ['une clé de trop', JSON.stringify({ ...grid, extra: 1 })],
    ['sans la date de grille', JSON.stringify({ ...grid, writtenAt: undefined })],
    ['une date de grille illisible', JSON.stringify({ ...grid, writtenAt: '26 mars' })],
    [
      'une date de grille hors des années lues',
      JSON.stringify({ ...grid, writtenAt: '9999-12-31T23:59:59.999Z' }),
    ],
    ['une suite à trois jours', withRuns([['2026-03-26', '2026-03-29', '2026-03-26']])],
    ['un jour illisible', withRuns([['2026-02-30', null]])],
    ['une suite qui finit avant de commencer', withRuns([['2026-03-29', '2026-03-26']])],
    [
      'des suites dans le désordre',
      withRuns([
        ['2026-04-02', '2026-04-05'],
        ['2026-03-26', '2026-03-29'],
      ]),
    ],
    [
      'des suites qui se chevauchent',
      withRuns([
        ['2026-03-26', '2026-04-02'],
        ['2026-03-29', null],
      ]),
    ],
    [
      'une suite sans fin avant une autre',
      withRuns([
        ['2026-03-26', null],
        ['2026-04-02', null],
      ]),
    ],
    ['une fréquence inconnue', JSON.stringify({ ...grid, frequency: { value: 3, unit: 'year' } })],
    ['une fin illisible', JSON.stringify({ ...grid, endsOn: 'demain' })],
    [
      'un texte trop long',
      withRuns(Array.from({ length: MAX_GRID_BEFORE_LENGTH }, () => ['2026-03-26', null])),
    ],
  ])('illisible (%s) : la colonne se lit vide, sans erreur', (_, column) => {
    expect(gridBeforeFromColumn(column)).toBeNull()
  })
})
