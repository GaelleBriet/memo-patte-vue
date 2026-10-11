// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView } from '../domain/dose-calendar'
import {
  arrivesOnOrigin,
  brokenReports,
  followed,
  loneReports,
  reportHolds,
  strandsNote,
} from '../domain/dose-calendar/gestures/reports'
import { line, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('reports seuls (R7, Q2 a, G19)', () => {
  const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-21')
  const input = { settings: [p1], lines: [report], today: '2026-10-12' }

  it('un report seul tient quand il arrive avant la journée suivante, son échéance d’origine dans le calendrier', () => {
    expect(loneReports(treatmentView(input), '2026-10-09').map(({ id }) => id)).toEqual([report.id])
    expect(reportHolds(input, report)).toBe(true)
    const late = { ...report, targetOn: '2026-10-23' }
    expect(reportHolds({ ...input, lines: [late] }, late)).toBe(false)
  })

  it('un décalage qui fait quitter la grille à son échéance d’origine le casse', () => {
    const shift = line('p1', 'shift', '2026-10-09', null, '2026-10-11')
    const after = { ...input, lines: [report, shift] }
    expect(brokenReports(input, after, '2026-10-09').map(({ id }) => id)).toEqual([report.id])
  })

  it('G19 : il suit vers l’échéance la plus proche de son arrivée, dans les bornes de Q2 a', () => {
    const shift = line('p1', 'shift', '2026-10-09', null, '2026-10-11')
    const after = { ...input, lines: [report, shift] }
    expect(followed(after, report, '2026-10-09')).toEqual({
      change: {
        action: 'rewrite',
        id: report.id,
        line: {
          settingId: 'p1',
          dueOn: '2026-10-18',
          dueTime: null,
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-10-21',
        },
      },
      to: '2026-10-21',
    })
  })
})

describe('gardes par construction (R6, R7)', () => {
  it('R7 : un report écrit qui arrive sur la journée d’origine d’un autre report est refusé', () => {
    const first = line('p1', 'postponed', '2026-10-16', null, '2026-10-21')
    const second = line('p1', 'postponed', '2026-10-23', null, '2026-10-16')
    const after = treatmentView({ settings: [p1], lines: [first, second], today: '2026-10-12' })
    const written = {
      settingId: 'p1',
      dueOn: '2026-10-23',
      dueTime: null,
      status: 'postponed' as const,
      givenOn: null,
      targetOn: '2026-10-16',
    }
    expect(arrivesOnOrigin(after, [{ action: 'rewrite', id: second.id, line: written }])).toBe(true)
    expect(
      arrivesOnOrigin(after, [
        { action: 'rewrite', id: second.id, line: { ...written, targetOn: '2026-10-25' } },
      ]),
    ).toBe(false)
  })

  it('R6 : une prise qui couvrait son échéance et n’en couvre plus est repérée', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const before = treatmentView({ settings: [p1], lines: [prise], today: '2026-10-17' })
    const shift = line('p1', 'shift', '2026-10-09', null, '2026-10-11')
    const after = treatmentView({ settings: [p1], lines: [prise, shift], today: '2026-10-17' })
    expect(strandsNote(before, after)).toBe(true)
    expect(strandsNote(before, before)).toBe(false)
  })
})
