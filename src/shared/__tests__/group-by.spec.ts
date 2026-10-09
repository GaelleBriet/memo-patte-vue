import { describe, expect, it } from 'vitest'

import { groupBy } from '../utils/group-by'

describe('groupBy', () => {
  it('range les éléments par clé, dans leur ordre d’arrivée', () => {
    const groups = groupBy(['b1', 'a1', 'b2'], (item) => item[0]!)

    expect([...groups.entries()]).toEqual([
      ['b', ['b1', 'b2']],
      ['a', ['a1']],
    ])
  })

  it('rend une table vide pour une liste vide', () => {
    expect(groupBy([], () => 'x').size).toBe(0)
  })
})
