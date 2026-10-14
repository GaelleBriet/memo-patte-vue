// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { episodeLines, isAdvanced } from '../domain/dose-calendar/lines'
import { DAY, H, line, setting } from './dose-calendar.v2.aides'

const P1 = [setting('p1', '2026-10-01', DAY)]
const NONE = new Set<string>()

describe('TR-25, R11 : les lignes lues par le calendrier', () => {
  it('deux prises de la même échéance : la plus récente est lue, l’autre est sans effet', () => {
    const old = line('p1', 'given', '2026-10-02')
    const recent = line('p1', 'missed', '2026-10-02')
    const read = episodeLines([recent, old], P1, NONE)
    expect(read.notes).toEqual([recent])
    expect(read.idle.get(old.id)).toBe('superseded')
  })

  it('un report revenu à sa date est sans effet ; une journée n’a qu’un report, le plus récent', () => {
    const back = line('p1', 'postponed', '2026-10-02', null, '2026-10-02')
    const first = line('p1', 'postponed', '2026-10-03', '08:00', '2026-10-04')
    const second = line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-05')
    const read = episodeLines([back, first, second], P1, NONE)
    expect(read.reports).toEqual([second])
    expect(read.idle.get(back.id)).toBe('back-to-date')
    expect(read.idle.get(first.id)).toBe('superseded')
  })

  it('une journée n’a qu’un décalage, le plus récent ; les lignes d’un autre épisode sont ignorées', () => {
    const first = line('p1', 'shift', '2026-10-02', null, '2026-10-03')
    const second = line('p1', 'shift', '2026-10-02', null, '2026-10-04')
    const other = line('p2', 'given', '2026-10-02')
    const read = episodeLines([first, second, other], P1, NONE)
    expect(read.shifts).toEqual([second])
    expect(read.kept).not.toContain(other)
    expect(read.idle.has(other.id)).toBe(false)
  })

  it('#802 : la même échéance notée sous deux réglages de la période : la plus récente est lue, l’autre est sans effet', () => {
    const settings = [
      setting('p1', '2026-10-01', DAY, ['08:00']),
      setting('p2', '2026-10-10', DAY, ['08:00'], { gridOriginOn: null }),
    ]
    const missed = line('p1', 'missed', '2026-10-12', '08:00')
    const given = line('p2', 'given', '2026-10-12', '08:00')
    const read = episodeLines([given, missed], settings, NONE)
    expect(read.notes).toEqual([given])
    expect(read.idle.get(missed.id)).toBe('superseded')
  })

  it('#802 : un report ramené à sa date sous le nouveau réglage l’emporte sur le report plus ancien de l’autre', () => {
    const settings = [
      setting('p1', '2026-10-01', DAY),
      setting('p2', '2026-10-10', DAY, [], { gridOriginOn: null }),
    ]
    const moving = line('p1', 'postponed', '2026-10-12', null, '2026-10-13')
    const back = line('p2', 'postponed', '2026-10-12', null, '2026-10-12')
    const read = episodeLines([moving, back], settings, NONE)
    expect(read.reports).toEqual([])
    expect(read.idle.get(back.id)).toBe('back-to-date')
    expect(read.idle.get(moving.id)).toBe('superseded')
  })

  it('R4 : le jour où les heures changent, une prise visant d’autres heures reste lue à côté', () => {
    const settings = [
      setting('p1', '2026-10-01', DAY, H),
      setting('p2', '2026-10-10', DAY, ['12:00', '20:00'], { gridOriginOn: null }),
    ]
    const before = line('p1', 'given', '2026-10-10', '20:00')
    const after = line('p2', 'given', '2026-10-10', '20:00')
    const read = episodeLines([before, after], settings, new Set(['2026-10-10']))
    expect(read.notes).toEqual([before, after])
    expect(read.idle.size).toBe(0)
  })

  it('« Avancée au … » : un report dont l’arrivée précède l’échéance, jamais un décalage', () => {
    expect(isAdvanced(line('p1', 'postponed', '2026-10-05', null, '2026-10-03'))).toBe(true)
    expect(isAdvanced(line('p1', 'postponed', '2026-10-05', null, '2026-10-07'))).toBe(false)
    expect(isAdvanced(line('p1', 'postponed', '2026-10-05', null, '2026-10-05'))).toBe(false)
    expect(isAdvanced(line('p1', 'shift', '2026-10-05', null, '2026-10-03'))).toBe(false)
  })
})
