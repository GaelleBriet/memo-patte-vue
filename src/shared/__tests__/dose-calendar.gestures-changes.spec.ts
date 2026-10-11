// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  shiftOfDay,
  shiftWritten,
  written,
} from '../domain/dose-calendar/gestures/changes'
import { line, setting, WEEK } from './dose-calendar.v2.aides'

describe('écritures simulées (TR-25, G17)', () => {
  it('une ligne par réglage, échéance et famille : la plus récente est réécrite', () => {
    const old = line('p1', 'given', '2026-10-16')
    const recent = line('p1', 'missed', '2026-10-16')
    const fields = {
      settingId: 'p1',
      dueOn: '2026-10-16',
      dueTime: null,
      status: 'given' as const,
      givenOn: '2026-10-17',
      targetOn: null,
    }
    expect(written([old, recent], fields)).toEqual({
      action: 'rewrite',
      id: recent.id,
      line: fields,
    })
    expect(written([], fields)).toEqual({ action: 'create', line: fields })
  })

  it('une journée n’a qu’une ligne de décalage : la plus récente est réancrée', () => {
    const first = line('p1', 'shift', '2026-10-16', null, '2026-10-18')
    const second = line('p1', 'shift', '2026-10-16', '08:00', '2026-10-19')
    expect(shiftOfDay([first, second], '2026-10-16')).toBe(second)
    expect(
      shiftWritten(
        [first, second],
        { settingId: 'p1', dueOn: '2026-10-16', dueTime: null },
        '2026-10-20',
      ),
    ).toEqual({
      action: 'rewrite',
      id: second.id,
      line: {
        settingId: 'p1',
        dueOn: '2026-10-16',
        dueTime: '08:00',
        status: 'shift',
        givenOn: null,
        targetOn: '2026-10-20',
      },
    })
  })

  it('le carnet simulé : créer, réécrire, supprimer, sans toucher au carnet d’origine', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const input = {
      settings: [setting('p1', '2026-10-02', WEEK)],
      lines: [prise],
      today: '2026-10-17',
    }
    const after = applied(input, [
      { action: 'rewrite', id: prise.id, line: { ...prise, givenOn: '2026-10-17' } },
      {
        action: 'create',
        line: { ...prise, status: 'shift', givenOn: null, targetOn: '2026-10-17' },
      },
    ])
    expect(after.lines.map(({ status, givenOn }) => [status, givenOn])).toEqual([
      ['given', '2026-10-17'],
      ['shift', null],
    ])
    expect(applied(after, [{ action: 'delete', id: prise.id }]).lines).toHaveLength(1)
    expect(input.lines).toEqual([prise])
  })
})
