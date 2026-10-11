// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { borrowedNotes, episodesOf, spanOf } from '../domain/dose-calendar/settings'
import { DAY, line, setting, TWO_DAYS } from './dose-calendar.v2.aides'

describe('R1, R8 : réglages successifs, arrêt et reprise', () => {
  it('un arrêt clôt un épisode, la reprise en ouvre un autre', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-03' })
    const p2 = setting('p2', '2026-10-05', DAY)
    const p3 = setting('p3', '2026-10-07', TWO_DAYS)
    expect(episodesOf([p3, p2, p1]).map((episode) => episode.map(({ id }) => id))).toEqual([
      ['p1'],
      ['p2', 'p3'],
    ])
  })

  it('un réglage vaut jusqu’au premier jour du suivant, date de fin comprise', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const p2 = setting('p2', '2026-10-05', DAY, [], { endsOn: '2026-10-08' })
    const span = spanOf([p1, p2], [])
    expect([span.settingAt('2026-10-04'), span.settingAt('2026-10-05')]).toEqual([p1, p2])
    expect([span.settingAt('2026-09-30'), span.settingAt('2026-10-09')]).toEqual([
      undefined,
      undefined,
    ])
  })

  it('R10 : remplacé le jour même sans prise, un réglage n’a aucun jour ; avec une prise, il en a', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const p2 = setting('p2', '2026-10-03', TWO_DAYS)
    const p3 = setting('p3', '2026-10-03', DAY)
    expect(spanOf([p1, p2, p3], []).live).toEqual([p1, p3])
    expect(spanOf([p1, p2, p3], [line('p2', 'given', '2026-10-03')]).live).toEqual([p1, p2, p3])
  })

  it('R8 : seule une prise du jour même de la reprise couvre sa première journée', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-02' })
    const p2 = setting('p2', '2026-10-02', DAY)
    const today = line('p1', 'given', '2026-10-02')
    const lines = [line('p1', 'given', '2026-10-01'), today]
    expect(borrowedNotes([[p1], [p2]], 1, lines)).toEqual([today])
    expect(borrowedNotes([[p1], [{ ...p2, firstDueOn: '2026-10-05' }]], 1, lines)).toEqual([])
  })
})
