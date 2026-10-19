import { describe, expect, it } from 'vitest'

import { dose, period, postponed, treatment } from './treatment-fixtures'
import { resolve } from '../logic/treatment-edition-change'
import { rhythmOf } from '../logic/treatment-settings'

const TOUS_LES_3_JOURS = period({
  startsOn: '2026-03-28',
  firstDueOn: '2026-03-28',
  frequency: { value: 3, unit: 'day' },
  times: ['08:00', '20:00'],
  createdAt: '2026-03-28T07:00:00.000Z',
  updatedAt: '2026-03-28T07:00:00.000Z',
})

const at = (updatedAt: string) => ({ createdAt: updatedAt, updatedAt })

const MILO = treatment(
  [TOUS_LES_3_JOURS],
  [
    dose('2026-03-31', '', {
      dueTime: '08:00',
      givenOn: '2026-04-01',
      ...at('2026-04-01T08:00:00.000Z'),
    }),
    dose('2026-03-31', '', { dueTime: '20:00', ...at('2026-03-31T20:00:00.000Z') }),
    dose('2026-04-03', '', {
      dueTime: '08:00',
      givenOn: '2026-03-31',
      ...at('2026-03-31T21:00:00.000Z'),
    }),
    postponed('2026-04-04', '2026-04-06', { dueTime: '08:00', ...at('2026-04-04T08:00:00.000Z') }),
    dose('2026-04-06', '', {
      dueTime: '20:00',
      givenOn: '2026-04-07',
      ...at('2026-04-07T20:00:00.000Z'),
    }),
  ],
)

describe('« Prochaine dose » avec une date de fin saisie, sans autre changement', () => {
  it('lit le carnet avec la nouvelle date de fin sans dater le réglage comme réécrit (#867)', () => {
    const rhythm = { ...rhythmOf(TOUS_LES_3_JOURS), endsOn: '2026-04-16' }

    const { nextDose, move, plan } = resolve(
      MILO,
      rhythm,
      { chosenOn: '2026-04-06', shiftsFollowing: true },
      '2026-04-08',
    )

    expect(nextDose).toMatchObject({
      change: 'move',
      proposedOn: '2026-04-06',
      latest: '2026-04-16',
      shiftInitial: false,
    })
    expect(move).toBeNull()
    expect(plan).toBeNull()
  })
})
