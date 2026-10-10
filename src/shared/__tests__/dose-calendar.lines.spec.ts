// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { episodeLines } from '../domain/dose-calendar/lines'
import { line } from './dose-calendar.v2.aides'

const P1 = new Set(['p1'])

describe('TR-25, R11 : les lignes lues par le calendrier', () => {
  it('deux prises de la même échéance : la plus récente est lue, l’autre est sans effet', () => {
    const old = line('p1', 'given', '2026-10-02')
    const recent = line('p1', 'missed', '2026-10-02')
    const read = episodeLines([recent, old], P1)
    expect(read.notes).toEqual([recent])
    expect(read.idle.get(old.id)).toBe('superseded')
  })

  it('un report revenu à sa date est sans effet ; une journée n’a qu’un report, le plus récent', () => {
    const back = line('p1', 'postponed', '2026-10-02', null, '2026-10-02')
    const first = line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04')
    const second = line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-05')
    const read = episodeLines([back, first, second], P1)
    expect(read.reports).toEqual([second])
    expect(read.idle.get(back.id)).toBe('back-to-date')
    expect(read.idle.get(first.id)).toBe('superseded')
  })

  it('une journée n’a qu’un décalage, le plus récent ; les lignes d’un autre épisode sont ignorées', () => {
    const first = line('p1', 'shift', '2026-10-02', null, '2026-10-03')
    const second = line('p1', 'shift', '2026-10-02', null, '2026-10-04')
    const other = line('p2', 'given', '2026-10-02')
    const read = episodeLines([first, second, other], P1)
    expect(read.shifts).toEqual([second])
    expect(read.kept).not.toContain(other)
    expect(read.idle.has(other.id)).toBe(false)
  })
})
