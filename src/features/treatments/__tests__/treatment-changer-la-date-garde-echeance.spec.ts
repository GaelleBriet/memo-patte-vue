import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { doseChange } from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { dose, period, treatment } from './treatment-fixtures'
import { todayIsoDate } from '@/core/app-lifecycle/today-iso-date'
import { days } from '@/shared/__tests__/dose-calendar.v2.aides'

// Milo, Métacam tous les jours à 8 h et 20 h depuis le 5 oct., « Toutes données » ; le 24, 8 h notée.
function milo() {
  const doses = days('2026-10-05', '2026-10-23').flatMap((day) =>
    ['08:00', '20:00'].map((dueTime) => dose(day, day, { dueTime })),
  )
  return treatment(
    [period({ startsOn: '2026-10-05', firstDueOn: '2026-10-05', times: ['08:00', '20:00'] })],
    [...doses, dose('2026-10-24', '2026-10-24', { dueTime: '08:00' })],
  )
}

beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026, 9, 24, 9, 40), toFake: ['Date'] })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('« Changer la date » d’une prise donnée (Q30, #1229)', () => {
  it('le 24 à 9 h 40, la prise d’hier 20 h changée à aujourd’hui reste « hier · 20 h — Donnée le 24 oct. », sans dose à renseigner', () => {
    const today = todayIsoDate()
    const book = milo()
    const change = doseChange(
      book,
      treatmentReadingOf(book, today)!,
      { kind: 'redate', lineId: '2026-10-23 20:00', givenOn: today, shiftsFollowing: true },
      () => 'n',
    )

    expect(today).toBe('2026-10-24')
    expect(
      change.writes.map((write) =>
        write.action === 'rewrite'
          ? [write.id, write.dose.dueOn, write.dose.dueTime, write.dose.givenOn]
          : [write.action],
      ),
    ).toEqual([['2026-10-23 20:00', '2026-10-23', '20:00', '2026-10-24']])
    expect(change.revealed).toBeNull()
  })
})
