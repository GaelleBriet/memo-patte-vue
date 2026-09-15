// @vitest-environment node
import { format } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { todayIsoDate } from '../today-iso-date'

describe('todayIsoDate', () => {
  it('rend la date du jour au format du champ date natif', () => {
    expect(todayIsoDate()).toBe(format(new Date(), 'yyyy-MM-dd'))
  })
})
