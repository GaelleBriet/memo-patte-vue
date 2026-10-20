// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { nextDay, previousDay } from '../domain/calendar-day'

describe('nextDay, previousDay', () => {
  it.each([
    ['2026-02-28', '2026-03-01', '2026-02-27'],
    ['2028-02-28', '2028-02-29', '2028-02-27'],
    ['2026-12-31', '2027-01-01', '2026-12-30'],
    ['2026-01-01', '2026-01-02', '2025-12-31'],
  ])('%s : lendemain %s, veille %s', (day, after, before) => {
    expect(nextDay(day)).toBe(after)
    expect(previousDay(day)).toBe(before)
  })

  it.each(['2026-02-30', '2026-13-45', '2026-04-31', '2027-02-29', '2026-3-1', 'demain', ''])(
    '%s, une date qui n’existe pas : lève au lieu de glisser vers une voisine',
    (day) => {
      expect(() => nextDay(day)).toThrow(RangeError)
      expect(() => previousDay(day)).toThrow(RangeError)
    },
  )
})
