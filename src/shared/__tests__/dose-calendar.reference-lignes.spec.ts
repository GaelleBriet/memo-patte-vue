// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { referenceReading } from '../domain/dose-calendar/reference-model'
import {
  DAY,
  H,
  line,
  MONTH,
  next,
  read,
  setting,
  TWO_DAYS,
  WEEK,
} from './dose-calendar.reference.aides'

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

describe('R4 : une prise ne se perd jamais', () => {
  const WEEKLY = [setting('p1', '2026-10-02', WEEK)]
  const notes = (...days: string[]) => days.map((day) => line('p1', 'given', day))

  it('sortie du calendrier, elle couvre la première échéance qui suit à moins d’un pas', () => {
    const lines = [...notes('2026-10-02', '2026-10-09', '2026-10-16')]
    lines.push(line('p1', 'shift', '2026-10-09', null, '2026-10-10'))
    expect(read(WEEKLY, lines, '2026-10-18')).toMatchObject({
      current: ['2026-10-24'],
      unlogged: [],
    })
  })

  it('l’échéance qui suit déjà couverte, elle est sans effet', () => {
    const lines = [...notes('2026-10-02', '2026-10-09', '2026-10-16', '2026-10-17')]
    lines.push(line('p1', 'shift', '2026-10-09', null, '2026-10-10'))
    expect(read(WEEKLY, lines, '2026-10-18').current).toEqual(['2026-10-24'])
  })

  it('l’échéance couverte, la prochaine dose est lue plus loin, pas une fin', () => {
    const quarterly = setting('p1', '2026-01-10', { value: 3, unit: 'month' })
    const lines = [line('p1', 'given', '2026-01-10'), line('p1', 'given', '2026-02-01')]
    const today = '2026-01-10'
    expect(referenceReading({ settings: [quarterly], lines, today, until: today })).toMatchObject({
      phase: 'upcoming',
      current: ['2026-07-10'],
    })
  })

  it('aucune échéance à moins d’un pas, elle est sans effet', () => {
    const lines = [...notes('2026-10-02', '2026-10-09', '2026-10-16')]
    lines.push(line('p1', 'shift', '2026-10-09', null, '2026-10-17'))
    expect(read(WEEKLY, lines, '2026-10-18').current).toEqual(['2026-10-24'])
  })

  it('le 13 mars complet (8 h couverte par traduction) sorti du calendrier : son report vers le 31 reste sans effet', () => {
    const until = { endsOn: '2026-04-03' }
    const fortnight = setting(
      's1',
      '2026-03-13',
      { value: 2, unit: 'week' },
      ['08:00', '14:00', '20:00'],
      until,
    )
    const monthly = setting('s2', '2026-03-13', MONTH, H, { ...until, startsOn: '2026-03-11' })
    const fromToday = setting('s3', '2026-03-11', MONTH, H, until)
    const lines = [
      line('s1', 'given', '2026-03-13', '20:00'),
      line('s1', 'postponed', '2026-03-13', '08:00', '2026-03-31'),
      line('s2', 'given', '2026-03-13', '20:00'),
    ]
    expect(read([fortnight, monthly, fromToday], lines, '2026-03-11').upcoming).not.toContain(
      '2026-03-31 08:00',
    )
  })
})

describe('R7 : un réglage qui a eu des jours ne reprend pas une journée de son successeur', () => {
  it('chaque jour dès le 21 mars, puis toutes les 2 semaines à 20 h dès le 24 ; dose du 11 avr. reportée au 9 : le 9 reste à donner', () => {
    const daily = setting('s1', '2026-03-21', DAY)
    const fortnight = setting('s2', '2026-03-24', { value: 2, unit: 'week' }, ['20:00'])
    const report = line('s2', 'postponed', '2026-04-11', '20:00', '2026-04-09')
    expect(read([daily, fortnight], [report], '2026-03-28').upcoming).toContain('2026-04-09 20:00')
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

  it('Q-retard : après un changement de posologie, la dose en retard reste la dose du moment', () => {
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
      phase: 'overdue',
      current: ['2026-10-03 20:00'],
      unlogged: [],
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
