// @vitest-environment node
import { describe, expect, it } from 'vitest'

import fr from '../locales/fr.json'

function leaves(node: unknown, path: string[] = []): [string, unknown][] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => leaves(child, [...path, key]))
  }
  return [[path.join('.'), node]]
}

describe('locale fr', () => {
  it('renseigne un texte pour chaque clé', () => {
    const empty = leaves(fr)
      .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
      .map(([key]) => key)

    expect(empty).toEqual([])
  })
})
