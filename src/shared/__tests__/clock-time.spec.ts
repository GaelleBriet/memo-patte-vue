import { describe, expect, it } from 'vitest'

import { CLOCK_TIME_PATTERN, isClockTime } from '../domain/clock-time'

describe('isClockTime', () => {
  it.each(['00:00', '08:00', '20:30', '23:59'])('accepte %s', (time) => {
    expect(isClockTime(time)).toBe(true)
    expect(CLOCK_TIME_PATTERN.test(time)).toBe(true)
  })

  it.each(['24:00', '8:00', '08:60', '08:00:00', '', null, 800])('refuse %j', (time) => {
    expect(isClockTime(time)).toBe(false)
  })
})
