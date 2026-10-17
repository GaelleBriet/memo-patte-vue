import { describe, expect, it } from 'vitest'

import { MAX_MODEL_LENGTH } from '../device-model'

describe('device-model', () => {
  it('limite le modèle d’appareil à 200 caractères', () => {
    expect(MAX_MODEL_LENGTH).toBe(200)
  })
})
