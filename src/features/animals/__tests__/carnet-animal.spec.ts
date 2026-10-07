// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { nextFollowedAnimalId } from '../logic/carnet-animal'

describe('nextFollowedAnimalId', () => {
  it('donne le premier animal suivi autre que celui qui part', () => {
    expect(nextFollowedAnimalId([{ id: 'milo' }, { id: 'luna' }], 'milo')).toBe('luna')
    expect(nextFollowedAnimalId([{ id: 'milo' }, { id: 'luna' }], 'luna')).toBe('milo')
  })

  it('rend null quand il ne reste aucun animal suivi', () => {
    expect(nextFollowedAnimalId([{ id: 'milo' }], 'milo')).toBeNull()
    expect(nextFollowedAnimalId([], 'milo')).toBeNull()
  })
})
