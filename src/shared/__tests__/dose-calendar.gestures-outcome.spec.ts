// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView } from '../domain/dose-calendar'
import {
  harm,
  linesAfter,
  lostToEnd,
  newlyDue,
  shiftDayOf,
} from '../domain/dose-calendar/gestures/outcome'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('conséquences d’un geste (G18, G20, G21, R6, R7)', () => {
  it('G18 : le décalage d’une dose avancée se pose sur sa journée d’origine', () => {
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-13')
    const read = treatmentView({ settings: [p1], lines: [report], today: '2026-10-10' })
    expect(shiftDayOf(read, { dueOn: '2026-10-13' })).toBe('2026-10-16')
    expect(shiftDayOf(read, { dueOn: '2026-10-23' })).toBe('2026-10-23')
  })

  it('R6, G7 : les prises et les autres lignes après une journée, prises en plus exclues', () => {
    const lines = [
      line('p1', 'given', '2026-10-23'),
      line('p1', 'shift', '2026-10-23', null, '2026-10-24'),
      line('p1', 'extra', '2026-10-20'),
    ]
    const after = linesAfter(lines, '2026-10-16', new Set())
    expect([after.notes.length, after.others.length]).toEqual([1, 1])
  })

  it('G20 : fin le 30, décalage du 16 au 19 : la dose du 30 ne sera plus prévue', () => {
    const ending = setting('p1', '2026-10-02', WEEK, [], { endsOn: '2026-10-30' })
    const input = { settings: [ending], lines: [], today: '2026-10-19' }
    const prise = {
      action: 'create' as const,
      line: {
        settingId: 'p1',
        dueOn: '2026-10-16',
        dueTime: null,
        status: 'given' as const,
        givenOn: '2026-10-19',
        targetOn: null,
      },
    }
    const shift = {
      action: 'create' as const,
      line: { ...prise.line, status: 'shift' as const, givenOn: null, targetOn: '2026-10-19' },
    }
    expect(lostToEnd(input, [prise], [prise, shift], '2026-10-16')).toEqual(['2026-10-30'])
  })

  it('G21 : seules les doses passées que le geste rend en retard sont annoncées', () => {
    const before = treatmentView({
      settings: [p1],
      lines: [line('p1', 'given', '2026-10-16')],
      today: '2026-10-28',
    })
    const after = treatmentView({
      settings: [p1],
      lines: [
        line('p1', 'given', '2026-10-16'),
        line('p1', 'shift', '2026-10-16', null, '2026-10-12'),
      ],
      today: '2026-10-28',
    })
    expect(keys(newlyDue(before, after, '2026-10-28'))).toEqual(['2026-10-19', '2026-10-26'])
  })

  it('R6 : un geste qui laisserait une prise sans échéance est refusé', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const before = treatmentView({ settings: [p1], lines: [prise], today: '2026-10-17' })
    const after = treatmentView({
      settings: [p1],
      lines: [prise, line('p1', 'shift', '2026-10-09', null, '2026-10-11')],
      today: '2026-10-17',
    })
    expect(harm(before, after, [])).toEqual({ reason: 'later-dose' })
    expect(harm(before, before, [])).toBeNull()
  })
})
