import { describe, expect, it } from 'vitest'

import { DoseAlreadyLoggedError, GestureRefusedError } from '../logic/treatment-dose-change'
import { ConcurrentWriteError } from '../repository/treatment-dose-batch.repository'
import { DuplicateDueError } from '../repository/treatment-dose-guards.repository'

describe('noms des erreurs des doses', () => {
  it.each([
    ['DoseAlreadyLoggedError', new DoseAlreadyLoggedError()],
    ['GestureRefusedError', new GestureRefusedError({ reason: 'a-dose-exists' } as never)],
    ['DuplicateDueError', new DuplicateDueError()],
    ['ConcurrentWriteError', new ConcurrentWriteError()],
  ])('%s porte son nom', (name, error) => {
    expect(error.name).toBe(name)
  })
})
