import { describe, expect, it } from 'vitest'

import { readableTreatmentSchedule } from '@/shared/domain/readable-treatment-schedule'
import type { TreatmentPeriodInput } from '@/shared/domain/treatment-schedule'

const PERIOD: TreatmentPeriodInput = {
  id: 'p-1',
  startsOn: '2026-09-01',
  firstDueOn: '2026-09-01',
  referenceOn: '2026-09-01',
  endsOn: null,
  stoppedOn: null,
  frequency: { value: 1, unit: 'week' },
  times: [],
  createdAt: '2026-09-01T08:00:00.000Z',
}

describe('readableTreatmentSchedule', () => {
  it('rend le calendrier d’un traitement lisible', () => {
    const schedule = readableTreatmentSchedule({
      periods: [PERIOD],
      doses: [],
      today: '2026-08-30',
    })

    expect(schedule?.nextDue).toMatchObject({ dueOn: '2026-09-01' })
  })

  it('rend null quand le moteur refuse une donnée illisible', () => {
    const periods = [{ ...PERIOD, times: ['25:00'] }]

    expect(readableTreatmentSchedule({ periods, doses: [], today: '2026-09-10' })).toBeNull()
  })
})
