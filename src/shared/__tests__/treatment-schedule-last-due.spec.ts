// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { carnet, done, due, record, scheduleOf, weekly } from './treatment-schedule-fixtures'

const ENDING = weekly({ firstDueOn: '2026-10-05', endsOn: '2026-10-25' })

describe('lastDueDay', () => {
  it('donne la dernière journée d’échéance avant la date de fin', () => {
    expect(scheduleOf(carnet(ENDING), '2026-10-06').lastDueDay()).toBe('2026-10-19')
  })

  it('compte la dernière journée même notée, et après la date de fin', () => {
    const book = done(carnet(ENDING), '2026-10-19')

    expect(scheduleOf(book, '2026-10-27').lastDueDay()).toBe('2026-10-19')
  })

  it('suit un report qui avance la dernière dose', () => {
    const ending = weekly({ firstDueOn: '2026-10-05', endsOn: '2026-10-23' })
    const book = record(carnet(ending), '2026-10-14', {
      kind: 'postponed',
      due: due('2026-10-19'),
      to: '2026-10-17',
    })

    expect(scheduleOf(book, '2026-10-27').lastDueDay()).toBe('2026-10-17')
  })

  it('suit un décalage qui déplace la dernière dose', () => {
    const book = record(carnet(ENDING), '2026-10-14', {
      kind: 'given',
      due: due('2026-10-12'),
      givenOn: '2026-10-14',
      shiftsFollowing: true,
    })

    expect(scheduleOf(book, '2026-10-27').lastDueDay()).toBe('2026-10-21')
  })

  it('`null` pour une période sans fin', () => {
    expect(scheduleOf(carnet(weekly()), '2026-10-06').lastDueDay()).toBeNull()
  })
})
