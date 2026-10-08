import { describe, expect, it } from 'vitest'

import { isResumablePhase } from '../logic/treatment-resumption'

describe('isResumablePhase', () => {
  it.each(['stopped', 'ended'] as const)('un traitement %s se reprend', (phase) => {
    expect(isResumablePhase(phase)).toBe(true)
  })

  it.each(['upcoming', 'today', 'overdue'] as const)(
    'un traitement en cours (%s) n’a rien à reprendre',
    (phase) => {
      expect(isResumablePhase(phase)).toBe(false)
    },
  )
})
