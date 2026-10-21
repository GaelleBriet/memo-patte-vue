// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { isAdminSecret } from '../admin-secret'

describe('isAdminSecret', () => {
  it('reconnaît le secret configuré', async () => {
    expect(await isAdminSecret('le-bon-secret', 'le-bon-secret')).toBe(true)
  })

  it.each([
    ['différent de même longueur', 'le-bon-secreT'],
    ['plus court', 'le-bon'],
    ['plus long', 'le-bon-secret-et-plus'],
    ['vide', ''],
  ])('refuse un secret %s', async (_, given) => {
    expect(await isAdminSecret(given, 'le-bon-secret')).toBe(false)
  })

  it.each([undefined, ''])(
    'refuse tout quand aucun secret n’est configuré (%j)',
    async (expected) => {
      expect(await isAdminSecret('', expected)).toBe(false)
    },
  )
})
