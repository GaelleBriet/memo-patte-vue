// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentSchedule, type TreatmentDoseInput } from '../domain/treatment-schedule'
import { days, period } from './treatment-schedule-fixtures'

const TWO_YEARS = days('2024-10-01', '2026-09-30')

function givenAt(day: string, dueTime: string, nextDueDate: string): TreatmentDoseInput {
  const at = `${day}T12:00:00.000Z`
  return {
    id: `${day}-${dueTime}`,
    periodId: 'p1',
    dueOn: day,
    dueTime,
    givenOn: day,
    status: 'given',
    nextDueDate,
    createdAt: at,
    updatedAt: at,
  }
}

const doses = TWO_YEARS.flatMap((day, index) => [
  givenAt(day, '08:00', day),
  givenAt(day, '20:00', TWO_YEARS[index + 1] ?? '2026-10-01'),
])

const input = {
  periods: [period({ firstDueOn: '2024-10-01', times: ['08:00', '20:00'] })],
  doses,
  today: '2026-09-30',
}

describe('performance', () => {
  it('un traitement quotidien à deux heures, sur deux ans, se calcule en moins de 100 ms', () => {
    const start = performance.now()
    const schedule = treatmentSchedule(input)
    schedule.upcoming(400)
    const elapsed = performance.now() - start

    expect(doses).toHaveLength(1460)
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([
      { periodId: 'p1', dueOn: '2026-10-01', dueTime: '08:00' },
    ])
    expect(elapsed).toBeLessThan(100)
  })

  it('le même traitement sans aucune prise notée aussi', () => {
    const start = performance.now()
    const schedule = treatmentSchedule({ ...input, doses: [] })
    const elapsed = performance.now() - start

    expect(schedule.unloggedDoses).toHaveLength(1458)
    expect(elapsed).toBeLessThan(100)
  })
})
