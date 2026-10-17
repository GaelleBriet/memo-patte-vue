// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  treatmentView,
  type Frequency,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

const TWO_DAYS: Frequency = { value: 2, unit: 'day' }
const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
const MONTH: Frequency = { value: 1, unit: 'month' }
const QUARTER: Frequency = { value: 3, unit: 'month' }
const SIX_WEEKS: Frequency = { value: 6, unit: 'week' }
const THREE = ['08:00', '14:00', '20:00']
const FOUR = ['06:00', '12:00', '18:00', '23:00']

const givenOn = (day: string) => ({ givenOn: day })

// « Modifier » qui ne change que les heures, date laissée telle quelle.
function hoursOnly(input: TreatmentViewInput, times: string[], answer?: 'keep' | 'correct') {
  const { frequency, endsOn } = treatmentView(input).currentSetting!
  const request: SettingsRequest = { frequency, times, endsOn }
  return edited(input, request, answer)
}

const minuteLater = (input: TreatmentViewInput) =>
  hoursOnly(
    input,
    treatmentView(input).currentSetting!.times.map((time) => time.replace(/0$/, '1')),
  )

const pastSlots = (input: TreatmentViewInput, from: string) =>
  treatmentView(input)
    .slots(from, input.today)
    .filter(({ due }) => due.dueOn < input.today)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

describe('R9, décision du 15 octobre 2026 : changer les heures vaut à partir d’aujourd’hui', () => {
  it('Milo, tous les 3 jours à 20 h dès le 7 avril, dose du 7 reportée au 9 sans décaler, posologie seule ; le 8, 8 h et 20 h : le 9 à 20 h, puis 10 et 13, rien en retard le 7', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-07', THREE_DAYS, ['20:00'])],
      lines: [],
      today: '2026-04-07',
    }
    input = moved(input, '2026-04-07', '20:00', '2026-04-09', false)
    input = edited(input, { frequency: THREE_DAYS, times: ['20:00'], endsOn: null })
    expect(readings(input).moteur.ensuite).toEqual([
      '2026-04-09 20:00',
      '2026-04-10 20:00',
      '2026-04-13 20:00',
    ])
    const after = hoursOnly(on(input, '2026-04-08'), ['08:00', '20:00'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-09 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-09 20:00', '2026-04-10 08:00', '2026-04-10 20:00'],
      }),
    )
    expect(pastSlots(after, '2026-04-07')).toEqual([])
  })

  it('#849 : tous les 3 jours à 8 h dès le 3 avril, dose du 6 non donnée ; le 7, « Prochaine dose » le 8, puis 9 h le même jour : 8, 11, 14 à 9 h, la dose du 6 ne revient pas', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-03', THREE_DAYS, ['08:00'])],
      lines: [],
      today: '2026-04-03',
    }
    input = given(input, '2026-04-03', '08:00')
    const request = { frequency: THREE_DAYS, times: ['08:00'], endsOn: null }
    input = edited(on(input, '2026-04-07'), { ...request, firstDueOn: '2026-04-08' })
    expect(readings(hoursOnly(input, ['09:00']))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-08 09:00'],
        aRenseigner: [],
        ensuite: ['2026-04-08 09:00', '2026-04-11 09:00', '2026-04-14 09:00'],
      }),
    )
  })

  it('#851, graine 4870000187 : tous les 2 jours à 8, 14 et 20 h, carnet écrit avant la décision, le 17 garde la dose reportée à 6 h, les prises de 14 h et 20 h couvrent 18 h et 23 h avant le report (décision du 16 octobre 2026) ; le 21, une minute plus tard : rien ne change avant aujourd’hui', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-16', WEEK),
        setting('s2', '2026-03-16', WEEK, FOUR, { gridOriginOn: null, firstDueChosen: false }),
        setting('s3', '2026-03-24', WEEK, THREE, { startsOn: '2026-03-16', endsOn: '2026-04-10' }),
        setting('s4', '2026-03-19', TWO_DAYS, THREE, {
          startsOn: '2026-03-17',
          firstDueChosen: false,
          endsOn: '2026-04-10',
        }),
      ],
      lines: [
        line('s1', 'given', '2026-03-16'),
        line('s1', 'extra', '2026-03-15'),
        line('s2', 'postponed', '2026-03-23', '06:00', '2026-03-17'),
        line('s2', 'shift', '2026-03-23', '06:00', '2026-03-17'),
        { ...line('s2', 'given', '2026-03-17', '12:00'), ...givenOn('2026-03-16') },
        { ...line('s3', 'given', '2026-03-17', '14:00'), ...givenOn('2026-03-16') },
        line('s3', 'given', '2026-03-17', '20:00'),
        line('s4', 'postponed', '2026-03-17', '08:00', '2026-03-18'),
        { ...line('s4', 'given', '2026-03-19', '20:00'), ...givenOn('2026-03-09') },
      ],
      today: '2026-03-21',
    }
    const late = ['2026-03-17 06:00', '2026-03-19 08:00', '2026-03-19 14:00']
    expect(readings(input).moteur.aRenseigner).toEqual(late)
    expect(pastSlots(input, '2026-03-17').slice(0, 4)).toEqual([
      '2026-03-17 06:00 pending',
      '2026-03-17 12:00 given',
      '2026-03-17 18:00 covered',
      '2026-03-17 23:00 covered',
    ])
    const today = ['2026-03-21 08:01', '2026-03-21 14:01', '2026-03-21 20:01']
    expect(readings(minuteLater(input))).toEqual(
      both({ phase: 'today', moment: today, aRenseigner: late, ensuite: today }),
    )
  })

  it('#852, graine 4900001764 : la prise de 14 h du 13 garde le 13 (règle du 17 octobre 2026), le 16 à 8 h est en retard ; le 17, une minute plus tard : il le reste, le 20, entamé, garde ses heures (décision du 15 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-30', WEEK, THREE),
        setting('s2', '2026-04-20', WEEK, THREE, { startsOn: '2026-04-08' }),
        setting('s3', '2026-04-16', WEEK, THREE, {
          startsOn: '2026-04-15',
          gridOriginOn: null,
          firstDueChosen: false,
          endsOn: '2026-04-22',
        }),
        setting('s4', '2026-04-20', SIX_WEEKS, THREE, {
          startsOn: '2026-04-16',
          firstDueChosen: false,
          endsOn: '2026-04-22',
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-04-06', '08:00', '2026-04-16'),
        { ...line('s1', 'given', '2026-04-13', '14:00'), ...givenOn('2026-04-07') },
        { ...line('s2', 'given', '2026-04-16', '14:00'), ...givenOn('2026-04-07') },
        { ...line('s2', 'given', '2026-04-16', '20:00'), ...givenOn('2026-04-12') },
        line('s1', 'missed', '2026-03-30', '20:00'),
        { ...line('s3', 'given', '2026-04-20', '20:00'), ...givenOn('2026-04-16') },
        line('s1', 'given', '2026-03-30', '14:00'),
      ],
      today: '2026-04-17',
    }
    const after = minuteLater(input)
    const early = input.lines.find(({ dueOn }) => dueOn === '2026-04-13')!
    const effect = treatmentView(input).history.find(({ line }) => line.id === early.id)!.effect
    expect(effect).toEqual({ kind: 'covers', key: '2026-04-13 14:00' })
    expect(pastSlots(input, '2026-04-16')).toEqual([
      '2026-04-16 08:00 pending',
      '2026-04-16 14:00 given',
      '2026-04-16 20:00 given',
    ])
    expect(pastSlots(after, '2026-03-30')).toEqual(pastSlots(input, '2026-03-30'))
    const late = {
      phase: 'overdue' as const,
      moment: ['2026-04-16 08:00'],
      aRenseigner: ['2026-03-30 08:00'],
      ensuite: ['2026-04-20 08:00', '2026-04-20 14:00'],
    }
    expect(readings(input)).toEqual(both(late))
    expect(readings(after)).toEqual(both(late))
  })

  it('#852, graine 4900002127 : la journée du 12 couverte par l’oubli ; le 14, 20 h 01 : elle le reste', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-12', SIX_WEEKS, ['20:00'], { stoppedOn: '2026-03-12' }),
        setting('s2', '2026-03-12', THREE_DAYS, ['20:00'], { firstDueChosen: false }),
      ],
      lines: [
        line('s1', 'missed', '2026-03-12', '20:00'),
        line('s1', 'extra', '2026-03-11', '20:00'),
        line('s1', 'extra', '2026-03-12', '20:00'),
        line('s1', 'postponed', '2026-04-23', '20:00', '2026-03-29'),
        { ...line('s1', 'given', '2026-03-29', '20:00'), ...givenOn('2026-03-12') },
        line('s2', 'extra', '2026-03-12', '20:00'),
      ],
      today: '2026-03-14',
    }
    const after = minuteLater(input)
    expect(pastSlots(input, '2026-03-12')).toEqual(['2026-03-12 20:00 covered'])
    expect(pastSlots(after, '2026-03-12')).toEqual(['2026-03-12 20:00 covered'])
    expect(readings(after).moteur.ensuite).toEqual([
      '2026-03-15 20:01',
      '2026-03-18 20:01',
      '2026-03-21 20:01',
    ])
  })

  it('#852, graine 4870002589 : la date choisie du 27 reçoit la journée entière, 14 h donnée la couvre, 8 h reste à renseigner ; le report de 20 h ouvre le rythme le 29 (décisions du 16 octobre 2026) ; le 30, une minute plus tard : rien ne change avant aujourd’hui', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-07', THREE_DAYS, ['08:00', '20:00']),
        setting('s2', '2026-03-15', THREE_DAYS, [], { gridOriginOn: null, firstDueChosen: false }),
        setting('s3', '2026-03-27', THREE_DAYS, THREE, { startsOn: '2026-03-22' }),
        setting('s4', '2026-03-29', WEEK, THREE, { startsOn: '2026-03-26', firstDueChosen: false }),
      ],
      lines: [
        { ...line('s1', 'given', '2026-03-07', '08:00'), ...givenOn('2026-03-02') },
        { ...line('s1', 'given', '2026-03-07', '20:00'), ...givenOn('2026-03-03') },
        line('s1', 'shift', '2026-03-07', '20:00', '2026-03-03'),
        line('s2', 'given', '2026-03-21'),
        line('s2', 'postponed', '2026-03-24', null, '2026-03-27'),
        { ...line('s3', 'given', '2026-03-27', '14:00'), ...givenOn('2026-03-23') },
        { ...line('s1', 'given', '2026-03-12', '20:00'), ...givenOn('2026-03-24') },
        line('s1', 'missed', '2026-03-09', '20:00'),
        line('s3', 'postponed', '2026-03-27', '20:00', '2026-03-29'),
        line('s1', 'given', '2026-03-12', '08:00'),
      ],
      today: '2026-03-30',
    }
    const after = minuteLater(input)
    expect(pastSlots(input, '2026-03-27')).toEqual([
      '2026-03-27 08:00 pending',
      '2026-03-27 14:00 given',
      '2026-03-29 20:00 pending',
    ])
    expect(pastSlots(after, '2026-03-07')).toEqual(pastSlots(input, '2026-03-07'))
    expect(readings(after)).toEqual(
      both({
        phase: 'overdue',
        moment: ['2026-03-29 20:00'],
        aRenseigner: ['2026-03-09 08:00', '2026-03-15', '2026-03-18', '2026-03-27 08:00'],
        ensuite: ['2026-04-05 08:01', '2026-04-05 14:01', '2026-04-05 20:01'],
      }),
    )
  })

  it('#853, graine 4870001647 : réglage dont la première échéance précède le début, journée du 1er avril, arrivée d’un report sans heure, en retard ; le 8, une minute plus tard : elle reste en retard, le 9 garde ses heures (décision du 15 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-30', QUARTER),
        setting('s2', '2026-04-30', MONTH, THREE, {
          startsOn: '2026-03-30',
          firstDueChosen: false,
        }),
        setting('s3', '2026-04-01', MONTH, THREE, {
          startsOn: '2026-04-02',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
      ],
      lines: [
        line('s1', 'missed', '2026-03-30'),
        line('s1', 'extra', '2026-03-30'),
        line('s1', 'postponed', '2026-06-30', null, '2026-04-01'),
        line('s1', 'shift', '2026-06-30', null, '2026-04-01'),
        line('s2', 'postponed', '2026-04-30', '08:00', '2026-04-09'),
      ],
      today: '2026-04-08',
    }
    const late = ['2026-04-01']
    expect(readings(input).moteur.moment).toEqual(late)
    expect(readings(minuteLater(input))).toEqual(
      both({
        phase: 'overdue',
        moment: late,
        aRenseigner: [],
        ensuite: ['2026-04-09 08:00', '2026-04-09 14:00', '2026-04-09 20:00'],
      }),
    )
  })
})

describe('R4, R9 : une première échéance en retard n’est pas le jour où les heures changent', () => {
  it('chaque semaine à 6, 12, 18 et 23 h, journée du 5 avril entamée puis en retard ; le 6, une minute plus tard : 12, 18 et 23 h du 5 restent en retard', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-29', WEEK, FOUR)],
      lines: [],
      today: '2026-03-29',
    }
    for (const time of FOUR) input = given(input, '2026-03-29', time)
    input = on(given(on(input, '2026-04-05'), '2026-04-05', '06:00'), '2026-04-06')
    const late = ['2026-04-05 12:00', '2026-04-05 18:00', '2026-04-05 23:00']
    expect(readings(input).moteur.moment).toEqual(late)
    const after = minuteLater(input)
    expect(readings(after).moteur.moment).toEqual(late)
    expect(readings(after).reference.moment).toEqual(late)
    expect(pastSlots(after, '2026-03-29')).toEqual(pastSlots(input, '2026-03-29'))
  })

  it('graine 5700000999 : la dose du 11 avril, sans heure, avancée au 5 et donnée ; le 3, 6, 12, 18 et 23 h : le 5 ne porte qu’une dose, sans heure, donnée ; le 6, une minute plus tard : rien ne change, le 18, entamé, garde ses heures (décision du 15 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-24', WEEK),
        setting('s2', '2026-04-04', WEEK, FOUR, {
          startsOn: '2026-04-03',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-03-24', null, '2026-04-04'),
        line('s1', 'shift', '2026-03-24', null, '2026-04-04'),
        line('s1', 'postponed', '2026-04-11', null, '2026-04-05'),
        { ...line('s1', 'given', '2026-04-05'), ...givenOn('2026-04-02') },
        { ...line('s1', 'given', '2026-04-04'), ...givenOn('2026-04-02') },
        line('s1', 'extra', '2026-03-30'),
        { ...line('s2', 'given', '2026-04-18', '06:00'), ...givenOn('2026-04-01') },
      ],
      today: '2026-04-06',
    }
    expect(pastSlots(input, '2026-04-05')).toEqual(['2026-04-05 given'])
    expect(readings(input).moteur.moment).toEqual(['2026-04-18 12:00'])
    const after = minuteLater(input)
    expect(readings(after).moteur.moment).toEqual(['2026-04-18 12:00'])
    expect(readings(after).reference.moment).toEqual(['2026-04-18 12:00'])
    expect(pastSlots(after, '2026-03-24')).toEqual(pastSlots(input, '2026-03-24'))
  })
})

describe('R7, R9 : une dose avancée dont l’arrivée est passée garde les heures de ce jour-là', () => {
  // Luna, tous les 3 jours à 8 h et 20 h dès le 1er avril ; le 2, la dose du 4 avancée au 3, sans
  // décaler la suite ; le 4, la dose du 3 n'est pas donnée.
  function luna() {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-01', THREE_DAYS, ['08:00', '20:00'])],
      lines: [],
      today: '2026-04-01',
    }
    input = given(input, '2026-04-01', '08:00')
    input = given(input, '2026-04-01', '20:00')
    input = moved(on(input, '2026-04-02'), '2026-04-04', '08:00', '2026-04-03', false)
    return on(input, '2026-04-04')
  }

  it('avant : les deux doses du 3 en retard, puis le 7', () => {
    expect(readings(luna())).toEqual(
      both({
        phase: 'overdue',
        moment: ['2026-04-03 08:00', '2026-04-03 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-07 08:00', '2026-04-07 20:00', '2026-04-10 08:00'],
      }),
    )
  })

  for (const times of [['20:00'], [], ['08:00', '14:00', '20:00']]) {
    it(`le 4, heures ${times.join(', ') || 'retirées'} : les deux doses du 3 restent en retard`, () => {
      const { moteur, reference } = readings(hoursOnly(luna(), times))
      for (const reading of [moteur, reference]) {
        expect(reading.phase).toBe('overdue')
        expect(reading.moment).toEqual(['2026-04-03 08:00', '2026-04-03 20:00'])
        expect(reading.aRenseigner).toEqual([])
        expect(reading.ensuite[0]?.slice(0, 10)).toBe('2026-04-07')
      }
    })
  }
})

describe('R4, R7, R9 : une dose avancée dont la journée d’origine est toute couverte n’apporte rien', () => {
  it('graine 5700001922 : la dose du 18 juin avancée au 30 mars, la journée du 18 juin déjà notée ; le 31 mars, une minute plus tard : rien en retard le 30', () => {
    const quarter = { value: 3, unit: 'month' as const }
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-13', quarter, ['20:00']),
        setting('s2', '2026-03-30', quarter, ['20:00'], {
          startsOn: '2026-03-21',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
        setting('s3', '2026-06-18', quarter, [], {
          startsOn: '2026-03-21',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
        setting('s4', '2026-06-18', THREE_DAYS, ['08:00', '20:00'], {
          startsOn: '2026-03-27',
          firstDueChosen: false,
        }),
      ],
      lines: [
        line('s1', 'shift', '2026-03-13', '20:00', '2026-03-18'),
        line('s1', 'postponed', '2026-06-18', '20:00', '2026-03-30'),
        line('s2', 'postponed', '2026-06-30', '20:00', '2026-09-13'),
        { ...line('s1', 'given', '2026-03-13', '20:00'), ...givenOn('2026-03-21') },
        { ...line('s3', 'given', '2026-06-18'), ...givenOn('2026-03-27') },
        line('s3', 'extra', '2026-03-27'),
      ],
      today: '2026-03-31',
    }
    const after = minuteLater(input)
    expect(pastSlots(after, '2026-03-13')).toEqual(pastSlots(input, '2026-03-13'))
    const { moteur, reference } = readings(after)
    expect(moteur.phase).toBe('upcoming')
    expect(reference).toEqual(moteur)
  })
})

describe('R10, Q38 : « Elles n’étaient pas à donner » corrige le réglage, ses journées passées comprises', () => {
  it('graine 7300002566 : tous les 2 jours à 6, 12, 18 et 23 h, la dose du 18 avancée au 17 ; le 18, 8 h et 20 h : les doses du 17 sortent, prochaine dose le 20', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-04-10', TWO_DAYS, FOUR),
        setting('s2', '2026-04-18', TWO_DAYS, FOUR, { startsOn: '2026-04-17' }),
        setting('s3', '2026-04-17', TWO_DAYS, FOUR, {
          gridOriginOn: null,
          firstDueChosen: false,
          endsOn: '2026-05-09',
        }),
      ],
      lines: [
        line('s1', 'missed', '2026-04-14', '23:00'),
        line('s1', 'given', '2026-04-14', '18:00'),
        { ...line('s1', 'given', '2026-04-14', '12:00'), ...givenOn('2026-04-11') },
        line('s1', 'given', '2026-04-16', '06:00'),
        line('s2', 'postponed', '2026-04-18', '06:00', '2026-04-17'),
        line('s1', 'given', '2026-04-10', '23:00'),
      ],
      today: '2026-04-18',
    }
    expect(readings(input).moteur.moment).toEqual(FOUR.map((hour) => `2026-04-17 ${hour}`))
    const after = hoursOnly(input, ['08:00', '20:00'], 'correct')
    const { moteur } = readings(after)
    expect(moteur.phase).toBe('upcoming')
    expect(moteur.moment).toEqual(['2026-04-20 08:00'])
    expect(
      [...moteur.moment, ...moteur.aRenseigner].some((due) => due.startsWith('2026-04-17')),
    ).toBe(false)
    expect(readings(after).reference).toEqual(moteur)
  })
})
