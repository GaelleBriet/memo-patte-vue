// @vitest-environment node
import { describe, expect, it } from 'vitest'

import en from '../locales/en.json'
import fr from '../locales/fr.json'

function leaves(node: unknown, path: string[] = []): [string, unknown][] {
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, child]) => leaves(child, [...path, key]))
  }
  return [[path.join('.'), node]]
}

function emptyKeys(messages: unknown): string[] {
  return leaves(messages)
    .filter(([, value]) => typeof value !== 'string' || value.trim() === '')
    .map(([key]) => key)
}

describe('locales', () => {
  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s renseigne un texte pour chaque clé', (_, messages) => {
    expect(emptyKeys(messages)).toEqual([])
  })

  it('en porte exactement les clés de fr', () => {
    const keys = (messages: unknown) => leaves(messages).map(([key]) => key)

    expect(keys(en)).toEqual(keys(fr))
  })

  it('fr sépare la ponctuation double par une insécable', () => {
    const breakable = /( [!?;:%»])|(« )/

    const faulty = leaves(fr)
      .filter(([, value]) => typeof value === 'string' && breakable.test(value))
      .map(([key]) => key)

    expect(faulty).toEqual([])
  })
})
