import { describe, expect, it } from 'vitest'

import { errorSummary } from '@/shared/utils/error-summary'

import { DoseAlreadyLoggedError, GestureRefusedError } from '../logic/treatment-dose-change'
import { ConcurrentWriteError } from '../repository/treatment-dose-batch.repository'
import { DuplicateDueError } from '../repository/treatment-dose-guards.repository'

describe('noms des erreurs des doses', () => {
  it.each([
    ['DoseAlreadyLoggedError', new DoseAlreadyLoggedError()],
    ['GestureRefusedError', new GestureRefusedError({ reason: 'unknown-due' })],
    ['DuplicateDueError', new DuplicateDueError()],
    ['ConcurrentWriteError', new ConcurrentWriteError()],
  ])('%s porte son nom', (name, error) => {
    expect(error.name).toBe(name)
  })
})

describe('trace d’un geste refusé', () => {
  it('donne le nom et le code du refus', () => {
    expect(errorSummary(new GestureRefusedError({ reason: 'later-dose' }))).toBe(
      'GestureRefusedError later-dose',
    )
  })

  it.each([
    [{ reason: 'out-of-bounds', earliest: '2026-03-01', latest: '2026-03-20' }],
    [{ reason: 'too-early', earliest: '2026-03-01' }],
    [{ reason: 'stuck-report', on: '2026-03-05' }],
    [{ reason: 'report-past-next', on: '2026-03-05' }],
  ] as const)('ne cite aucune date pour %o', (refusal) => {
    const trace = errorSummary(new GestureRefusedError(refusal))

    expect(trace).toBe(`GestureRefusedError ${refusal.reason}`)
    expect(trace).not.toMatch(/\d{4}/)
  })
})
