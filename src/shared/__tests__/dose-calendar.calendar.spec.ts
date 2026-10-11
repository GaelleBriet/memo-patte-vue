// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { episodeCalendar } from '../domain/dose-calendar/calendar'
import { episodeLines } from '../domain/dose-calendar/lines'
import { spanOf } from '../domain/dose-calendar/settings'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { DAY, H, line, MONTH, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

function calendar(settings: Setting[], lines: Line[]) {
  const own = episodeLines(lines, new Set(settings.map(({ id }) => id)))
  return episodeCalendar({
    settingOf: (id) => settings.find((each) => each.id === id)!,
    span: spanOf(settings, own.kept),
    episode: settings,
    lines: own,
    borrowed: [],
    reach: '2026-12-31',
  })
}

const pending = (settings: Setting[], lines: Line[], from: string, count = 3) =>
  calendar(settings, lines)
    .slots.filter(({ coveredBy, key }) => coveredBy === null && key >= from)
    .map(({ key }) => key)
    .slice(0, count)

describe('R2, R3 : la grille et son origine', () => {
  it('heures changées sur un mensuel du 31 : l’origine héritée garde le 31', () => {
    const p1 = setting('p1', '2026-01-31', MONTH, ['08:00'])
    const p2 = setting('p2', '2026-02-28', MONTH, ['09:00'], {
      startsOn: '2026-02-20',
      gridOriginOn: null,
    })
    expect(pending([p1, p2], [], '2026-02-20')).toEqual([
      '2026-02-28 09:00',
      '2026-03-31 09:00',
      '2026-04-30 09:00',
    ])
  })
})

describe('R4 : ce qu’une prise couvre', () => {
  it('le jour où les heures changent, une prise couvre la première heure du nouveau réglage', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    const p2 = setting('p2', '2026-10-02', DAY, ['09:00', '21:00'], { gridOriginOn: null })
    const note = line('p1', 'given', '2026-10-02', '08:00')
    const read = calendar([p1, p2], [note])
    expect(read.slots.find(({ key }) => key === '2026-10-02 09:00')?.coveredBy).toBe(note)
    expect(read.effects.get(note.id)).toEqual({ kind: 'covers', key: '2026-10-02 09:00' })
  })

  it('sortie du calendrier, une prise couvre la première échéance qui suit à moins d’un pas', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const note = line('p1', 'given', '2026-10-16')
    const lines = [note, line('p1', 'shift', '2026-10-09', null, '2026-10-10')]
    expect(calendar([p1], lines).effects.get(note.id)).toEqual({
      kind: 'covers',
      key: '2026-10-17',
    })
    const far = [note, line('p1', 'shift', '2026-10-09', null, '2026-10-17')]
    expect(calendar([p1], far).effects.get(note.id)).toEqual({
      kind: 'idle',
      reason: 'nothing-to-cover',
    })
  })
})

describe('R6 : seul un décalage déplace la suite', () => {
  it('le décalage fait repartir la grille de son ancrage', () => {
    const p1 = setting('p1', '2026-10-02', WEEK)
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    expect(pending([p1], [line('p1', 'given', '2026-10-16'), shift], '2026-10-17', 2)).toEqual([
      '2026-10-26',
      '2026-11-02',
    ])
    expect(calendar([p1], [shift]).effects.get(shift.id)).toEqual({
      kind: 'shifts',
      from: '2026-10-16',
    })
  })

  it('écrit sous un réglage d’avant un changement de fréquence, il est dépassé (R3)', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const p2 = setting('p2', '2026-10-05', TWO_DAYS, [], { startsOn: '2026-10-04' })
    const shift = line('p1', 'shift', '2026-10-06', null, '2026-10-08')
    expect(calendar([p1, p2], [shift]).effects.get(shift.id)).toEqual({
      kind: 'idle',
      reason: 'overtaken',
    })
  })
})

describe('R7 : le report déplace une heure et les suivantes encore sans prise', () => {
  it('8 h du 3 donnée, 20 h reportée seule au 4 : le 4 ne reçoit que 20 h', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const report = line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-04')
    const lines = [line('p1', 'given', '2026-10-03', '08:00'), report]
    expect(pending([p1], lines, '2026-10-03')).toEqual([
      '2026-10-04 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
    expect(calendar([p1], lines).effects.get(report.id)).toEqual({
      kind: 'moves',
      keys: ['2026-10-03 20:00'],
      arrival: '2026-10-04',
    })
  })

  it('heures changées : le jour d’arrivée prend autant de dernières heures que de doses reportées', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const p2 = setting('p2', '2026-10-05', TWO_DAYS, ['09:00', '21:00'], {
      startsOn: '2026-10-04',
      gridOriginOn: null,
    })
    const lines = [
      line('p1', 'given', '2026-10-03', '08:00'),
      line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-04'),
    ]
    expect(pending([p1, p2], lines, '2026-10-04', 1)).toEqual(['2026-10-04 21:00'])
  })

  it('R11 : un report battu par une prise de la même échéance est sans effet', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const report = line('p1', 'postponed', '2026-10-03', null, '2026-10-05')
    const read = calendar([p1], [report, line('p1', 'given', '2026-10-03')])
    expect(read.effects.get(report.id)).toEqual({ kind: 'idle', reason: 'beaten' })
    expect(read.moved.size).toBe(0)
  })
})
