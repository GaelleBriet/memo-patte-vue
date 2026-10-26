// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

describe('webhook-signature.ts', () => {
  const source = readFileSync(new URL('../webhook-signature.ts', import.meta.url), 'utf8')

  it('compare la signature reçue en temps constant, jamais par une égalité de chaînes', () => {
    expect(source).toContain('isSharedSecret(signature.v1, expected)')
    expect(source).not.toMatch(
      /(signature\.v1|expected)\s*[!=]==|[!=]==\s*(signature\.v1|expected)\b/,
    )
  })
})
