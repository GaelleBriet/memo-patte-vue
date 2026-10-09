import { describe, expect, it } from 'vitest'

import { dose, period, treatment } from './treatment-fixtures'
import { hasNote, overdueHelp } from '../logic/treatment-edition-resolution'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'

const TODAY = '2026-09-09'
const WEEKLY = period({ frequency: { value: 1, unit: 'week' } })

describe('aides de « Prochaine dose »', () => {
  it('sait si une prise est notée, dans tout le traitement ou dans une période', () => {
    const notee = treatmentScheduleOf(
      treatment([WEEKLY], [dose('2026-09-01', '2026-09-08')]),
      TODAY,
    )

    expect(hasNote(notee)).toBe(true)
    expect(hasNote(notee, 'p-1')).toBe(true)
    expect(hasNote(notee, 'p-2')).toBe(false)
    expect(hasNote(treatmentScheduleOf(treatment([WEEKLY]), TODAY))).toBe(false)
  })

  it('dit depuis quand la dose est en retard, jamais pour celle du jour', () => {
    const due = { periodId: 'p-1', dueOn: '2026-09-08', dueTime: null }

    expect(overdueHelp(due, TODAY)).toEqual({ kind: 'overdue', since: '2026-09-08' })
    expect(overdueHelp(due, '2026-09-08')).toBeNull()
  })
})
