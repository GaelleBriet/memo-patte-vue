import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { derivedId } from '@/shared/utils/derived-id'

const ID = '626a7787-96ce-479e-8b2e-09edb1319378'

describe('derivedId', () => {
  it('donne toujours le même UUID pour le même identifiant et le même suffixe', () => {
    expect(derivedId(ID, 'shift')).toBe(derivedId(ID, 'shift'))
    expect(z.uuid().safeParse(derivedId(ID, 'shift')).success).toBe(true)
  })

  it('change avec l’identifiant ou le suffixe', () => {
    const ids = new Set([
      ID,
      derivedId(ID, 'shift'),
      derivedId(ID, 'other'),
      derivedId('8d3c1a52-6e4b-4c7f-b1a9-2f6e0d5c4b37', 'shift'),
    ])

    expect(ids.size).toBe(4)
  })
})
