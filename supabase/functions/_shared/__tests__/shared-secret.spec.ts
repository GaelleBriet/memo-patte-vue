// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isSharedSecret } from '../shared-secret'

describe('isSharedSecret', () => {
  it('reconnaît le secret configuré', async () => {
    expect(await isSharedSecret('le-bon-secret', 'le-bon-secret')).toBe(true)
  })

  it.each([
    ['différent de même longueur', 'le-bon-secreT'],
    ['plus court', 'le-bon'],
    ['plus long', 'le-bon-secret-et-plus'],
    ['vide', ''],
  ])('refuse un secret %s', async (_, given) => {
    expect(await isSharedSecret(given, 'le-bon-secret')).toBe(false)
  })

  it.each([undefined, ''])(
    'refuse tout quand aucun secret n’est configuré (%j)',
    async (expected) => {
      expect(await isSharedSecret('', expected)).toBe(false)
    },
  )
})
