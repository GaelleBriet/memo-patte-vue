// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { DAY, H, line, next, read, setting, TWO_DAYS } from './dose-calendar.reference.aides'

describe('R7 : le report déplace une heure et les suivantes encore sans prise', () => {
  it('8 h du 3 donnée, 20 h reportée seule au 4 : le 4 ne reçoit que 20 h', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const lines = [
      line('p1', 'given', '2026-10-01', '08:00'),
      line('p1', 'given', '2026-10-01', '20:00'),
      line('p1', 'given', '2026-10-03', '08:00'),
      line('p1', 'postponed', '2026-10-03', '20:00', '2026-10-04'),
    ]
    expect(next([p1], lines, '2026-10-04')).toEqual([
      '2026-10-04 20:00',
      '2026-10-05 08:00',
      '2026-10-05 20:00',
    ])
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
    expect(read([p1, p2], lines, '2026-10-04').current).toEqual(['2026-10-04 21:00'])
  })

  it('un report garde son arrivée quand sa journée d’origine n’est plus une échéance', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS)
    const p2 = setting('p2', '2026-10-05', { value: 3, unit: 'day' }, [], {
      startsOn: '2026-10-02',
    })
    const lines = [
      line('p1', 'given', '2026-10-01'),
      line('p1', 'postponed', '2026-10-03', null, '2026-10-04'),
    ]
    expect(next([p1, p2], lines, '2026-10-02')).toEqual(['2026-10-04', '2026-10-05', '2026-10-08'])
  })

  it('un report revenu à sa date, ou battu par une prise, est sans effet', () => {
    const p1 = setting('p1', '2026-10-01', DAY)
    const lines = [
      line('p1', 'postponed', '2026-10-02', null, '2026-10-02'),
      line('p1', 'postponed', '2026-10-03', null, '2026-10-05'),
      line('p1', 'given', '2026-10-03'),
    ]
    expect(next([p1], lines, '2026-10-02')).toEqual(['2026-10-02', '2026-10-04', '2026-10-05'])
  })
})

describe('R8 : reprendre', () => {
  it('une prise d’avant l’arrêt ne couvre pas la reprise, sauf celle du jour même', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-02' })
    const p2 = setting('p2', '2026-10-02', DAY)
    const p3 = setting('p3', '2026-10-05', DAY, [], { startsOn: '2026-10-02' })
    const lines = [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-02')]
    expect(read([p1, p2], lines, '2026-10-02').current).toEqual(['2026-10-03'])
    expect(read([p1, p3], lines, '2026-10-02').current).toEqual(['2026-10-05'])
  })
})

describe('R10 : un réglage remplacé le jour de son ouverture n’a aucun jour', () => {
  it('journée du 3 reportée au 4, fréquence → 3 jours puis → 2 jours le 3 : 4, 5, 7', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS)
    const p2 = setting('p2', '2026-10-04', { value: 3, unit: 'day' }, [], {
      startsOn: '2026-10-03',
    })
    const p3 = setting('p3', '2026-10-05', TWO_DAYS, [], {
      startsOn: '2026-10-03',
      gridOriginOn: null,
    })
    const lines = [
      line('p1', 'given', '2026-10-01'),
      line('p1', 'postponed', '2026-10-03', null, '2026-10-04'),
    ]
    expect(next([p1, p2, p3], lines, '2026-10-03')).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-07',
    ])
  })
})

describe('dose du moment, doses non renseignées, phases', () => {
  it('une échéance passée devient non renseignée quand une plus récente est tombée', () => {
    const reading = read([setting('p1', '2026-10-01', DAY)], [], '2026-10-03')
    expect(reading).toMatchObject({
      phase: 'today',
      current: ['2026-10-03'],
      unlogged: ['2026-10-01', '2026-10-02'],
    })
  })

  it('la dernière journée arrivée reste entière la dose du moment, en retard', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const reading = read([p1], [line('p1', 'given', '2026-10-01', '08:00')], '2026-10-02')
    expect(reading).toMatchObject({ phase: 'overdue', current: ['2026-10-01 20:00'], unlogged: [] })
  })

  it('après un changement de réglage, les échéances passées restent à renseigner', () => {
    const p1 = setting('p1', '2026-10-01', TWO_DAYS, H)
    const p2 = setting('p2', '2026-10-05', TWO_DAYS, H, {
      startsOn: '2026-10-04',
      gridOriginOn: null,
    })
    const lines = [
      line('p1', 'given', '2026-10-01', '08:00'),
      line('p1', 'given', '2026-10-01', '20:00'),
      line('p1', 'given', '2026-10-03', '08:00'),
    ]
    expect(read([p1, p2], lines, '2026-10-04')).toMatchObject({
      phase: 'upcoming',
      current: ['2026-10-05 08:00'],
      unlogged: ['2026-10-03 20:00'],
    })
  })

  it('arrêté : plus d’échéance, la dose du jour retirée, terminé sans rien à renseigner', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-02' })
    const reading = read([p1], [line('p1', 'given', '2026-10-01')], '2026-10-02')
    expect(reading).toEqual({
      phase: 'stopped',
      finished: true,
      current: [],
      unlogged: [],
      upcoming: [],
    })
  })

  it('date de fin passée : terminé seulement quand tout est renseigné', () => {
    const p1 = setting('p1', '2026-10-01', DAY, [], { endsOn: '2026-10-02' })
    const reading = read([p1], [line('p1', 'given', '2026-10-01')], '2026-10-05')
    expect(reading).toMatchObject({ phase: 'ended', finished: false, unlogged: ['2026-10-02'] })
  })
})
