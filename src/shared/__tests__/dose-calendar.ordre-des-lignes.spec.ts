import { describe, expect, it } from 'vitest'

import { treatmentView, type Line, type Setting } from '@/shared/domain/dose-calendar'

const EVERY_3_DAYS = { value: 3, unit: 'day' } as const

const setting = (id: string, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-04-05',
  firstDueOn: '2026-04-05',
  gridOriginOn: '2026-04-05',
  firstDueChosen: true,
  fallenDosesAnswer: 'unasked',
  endsOn: null,
  stoppedOn: null,
  frequency: EVERY_3_DAYS,
  times: ['08:00', '20:00'],
  createdAt: '2026-01-01T00:00:00.000Z',
  ...fields,
})

const given = (id: string, dueTime: string, updatedAt: string): Line => ({
  id,
  settingId: 's1',
  dueOn: '2026-04-11',
  dueTime,
  status: 'given',
  givenOn: '2026-04-09',
  targetOn: null,
  updatedAt,
})

const settings = [
  setting('s1', { stoppedOn: '2026-04-09' }),
  setting('s2', {
    startsOn: '2026-04-11',
    firstDueOn: '2026-04-11',
    gridOriginOn: '2026-04-11',
    times: ['06:00', '12:00', '18:00', '23:00'],
    createdAt: '2026-01-01T00:00:03.000Z',
  }),
]
const lines = [
  given('l1', '08:00', '2026-01-01T00:00:01.000Z'),
  given('l2', '20:00', '2026-01-01T00:00:02.000Z'),
]

const readingOf = (ordered: Line[]) => {
  const view = treatmentView({ settings, lines: ordered, today: '2026-04-11' })
  return {
    history: view.history.map(({ line, effect }) => ({ id: line.id, effect })),
    slots: view.slots('2026-04-11', '2026-04-14').map(({ due, state, by }) => ({
      ...due,
      state,
      by: by?.id ?? null,
    })),
  }
}

describe('R12 : la lecture ne dépend pas de l’ordre des lignes', () => {
  it('reprise le 11 à 6, 12, 18 et 23 h sur les doses de 8 h et 20 h du 11 données avant l’arrêt : même lecture dans les deux ordres (graine 7300000099)', () => {
    const forward = readingOf(lines)

    expect(readingOf([...lines].reverse())).toEqual(forward)
    expect(forward.history).toEqual([
      { id: 'l1', effect: { kind: 'covers', key: '2026-04-11 06:00' } },
      { id: 'l2', effect: { kind: 'covers', key: '2026-04-11 23:00' } },
    ])
  })
})
