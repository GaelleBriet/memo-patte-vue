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

// Meilleur de trois essais : écarte le bruit de la machine, garde visible une régression.
function fastest<T>(run: () => T): { result: T; elapsed: number } {
  let best = { result: run(), elapsed: Infinity }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = performance.now()
    const result = run()
    const elapsed = performance.now() - start
    if (elapsed < best.elapsed) best = { result, elapsed }
  }
  return best
}

describe('performance', () => {
  it('un traitement quotidien à deux heures, sur deux ans, se calcule en moins de 100 ms', () => {
    const { result: schedule, elapsed } = fastest(() => {
      const computed = treatmentSchedule(input)
      computed.upcoming(400)
      return computed
    })

    expect(doses).toHaveLength(1460)
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([
      { periodId: 'p1', dueOn: '2026-10-01', dueTime: '08:00' },
    ])
    expect(elapsed).toBeLessThan(100)
  })

  it('le même traitement sans aucune prise notée aussi', () => {
    const { result: schedule, elapsed } = fastest(() => treatmentSchedule({ ...input, doses: [] }))

    expect(schedule.unloggedDoses).toHaveLength(1458)
    expect(elapsed).toBeLessThan(100)
  })

  it('« Toutes données » sur deux ans à deux heures s’écrit en moins de 200 ms', () => {
    const { result: written, elapsed } = fastest(() => {
      const schedule = treatmentSchedule({ ...input, doses: [] })
      return schedule.unloggedDoses.map((due) =>
        schedule.doseFor({ kind: 'given', due, givenOn: due.dueOn }),
      )
    })

    expect(written).toHaveLength(1458)
    const after = treatmentSchedule({
      ...input,
      doses: written.map((fields, index) => ({
        id: `dose-${index}`,
        ...fields,
        createdAt: '2026-09-30T12:00:00.000Z',
        updatedAt: '2026-09-30T12:00:00.000Z',
      })),
    })
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses).toHaveLength(2)
    expect(elapsed).toBeLessThan(200)
  })
})
