// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DAY, H, keys, line, setting, TWO_DAYS, view } from './dose-calendar.v2.aides'

const moment = (...args: Parameters<typeof view>) => {
  const read = view(...args)
  return {
    phase: read.phase,
    finished: read.finished,
    current: keys(read.currentDoses),
    unlogged: keys(read.unloggedDoses),
  }
}

describe('TR-10, TR-11, TR-13 : dose du moment et doses non renseignées', () => {
  it('une échéance passée devient non renseignée quand une plus récente est tombée', () => {
    expect(moment([setting('p1', '2026-10-01', DAY)], [], '2026-10-03')).toMatchObject({
      phase: 'today',
      current: ['2026-10-03'],
      unlogged: ['2026-10-01', '2026-10-02'],
    })
  })

  it('Q23 : la dernière journée arrivée reste entière la dose du moment, en retard', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    expect(moment([p1], [line('p1', 'given', '2026-10-01', '08:00')], '2026-10-02')).toEqual({
      phase: 'overdue',
      finished: false,
      current: ['2026-10-01 20:00'],
      unlogged: [],
    })
  })

  it('TR-11 : une échéance du jour reste du jour, jamais en retard', () => {
    const p1 = setting('p1', '2026-10-01', DAY, H)
    expect(moment([p1], [line('p1', 'given', '2026-10-01', '08:00')], '2026-10-01')).toMatchObject({
      phase: 'today',
      current: ['2026-10-01 20:00'],
    })
  })

  it('tout est noté jusqu’à demain : la prochaine échéance est à venir', () => {
    const lines = [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-02')]
    expect(moment([setting('p1', '2026-10-01', DAY)], lines, '2026-10-01')).toMatchObject({
      phase: 'upcoming',
      current: ['2026-10-03'],
    })
  })
})

describe('fin et arrêt', () => {
  it('arrêté : plus d’échéance, la dose du jour retirée, terminé sans rien à renseigner', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-02' })
    expect(moment([p1], [line('p1', 'given', '2026-10-01')], '2026-10-02')).toEqual({
      phase: 'stopped',
      finished: true,
      current: [],
      unlogged: [],
    })
  })

  it('date de fin passée : terminé seulement quand tout est renseigné', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { endsOn: '2026-10-02' })
    expect(moment([p1], [line('p1', 'given', '2026-10-01')], '2026-10-05')).toMatchObject({
      phase: 'ended',
      finished: false,
      unlogged: ['2026-10-02'],
    })
  })

  it('sans réglage : terminé', () => {
    expect(moment([], [], '2026-10-05')).toEqual({
      phase: 'ended',
      finished: true,
      current: [],
      unlogged: [],
    })
  })
})
