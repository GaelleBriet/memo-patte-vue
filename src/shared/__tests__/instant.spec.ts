import { describe, expect, it } from 'vitest'

import { instantSchema } from '../domain/instant'

describe('instant lu dans un fichier ou une colonne', () => {
  it.each([
    ['à la milliseconde', '2026-03-01T07:00:00.000Z', '2026-03-01T07:00:00.000Z'],
    ['à la seconde', '2026-03-01T07:00:00Z', '2026-03-01T07:00:00.000Z'],
    ['à la minute', '2026-03-01T07:00Z', '2026-03-01T07:00:00.000Z'],
    ['en 1900', '1900-01-01T00:00:00.000Z', '1900-01-01T00:00:00.000Z'],
    ['en 2199', '2199-12-31T23:59:59.999Z', '2199-12-31T23:59:59.999Z'],
  ])('se relit au format unique (%s)', (_, value, expected) => {
    expect(instantSchema.parse(value)).toBe(expected)
  })

  it.each([
    ['en 9999', '9999-12-31T23:59:59.999Z'],
    ['en 1899', '1899-12-31T23:59:59.999Z'],
    ['sans heure', '2026-03-01'],
    ['avec un décalage', '2026-03-01T08:00:00+01:00'],
  ])('refusé %s', (_, value) => {
    expect(instantSchema.safeParse(value).success).toBe(false)
  })
})
