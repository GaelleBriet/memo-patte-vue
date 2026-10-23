// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { keys, line, setting, WEEK } from './dose-calendar.v2.aides'

const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }
const SIX_WEEKS: Frequency = { value: 6, unit: 'week' }
const MONTH: Frequency = { value: 1, unit: 'month' }
const THREE = ['08:00', '14:00', '20:00']
const H = ['08:00', '20:00']

const givenOn = (day: string) => ({ givenOn: day })

function hoursOnly(input: TreatmentViewInput, times: string[]) {
  const { frequency, endsOn } = treatmentView(input).currentSetting!
  return edited(input, { frequency, times, endsOn })
}

const minuteLater = (input: TreatmentViewInput) =>
  hoursOnly(
    input,
    treatmentView(input).currentSetting!.times.map((time) => time.replace(/0$/, '1')),
  )

const states = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

// Luna, toutes les semaines à 8, 14 et 20 h ; le 10 avril, toutes les 2 semaines dès le 23 ; le 12,
// la dose du 23 avancée au 15 sans décaler la suite.
function luna(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-26', WEEK, THREE)],
    lines: [],
    today: '2026-03-26',
  }
  for (const time of THREE) input = given(input, '2026-03-26', time)
  input = edited(on(input, '2026-04-10'), {
    frequency: TWO_WEEKS,
    times: THREE,
    endsOn: null,
    firstDueOn: '2026-04-23',
  })
  return moved(on(input, '2026-04-12'), '2026-04-23', '08:00', '2026-04-15', false)
}

const LUNA_UNLOGGED = [
  '2026-04-02 08:00',
  '2026-04-02 14:00',
  '2026-04-02 20:00',
  '2026-04-09 08:00',
  '2026-04-09 14:00',
  '2026-04-09 20:00',
]

// Milo, tous les mois à 8 h et 20 h dès le 7 mars ; le 18 mars, la dose du 7 avril à 20 h donnée
// d'avance, celle de 8 h reportée au 12 sans décaler et donnée d'avance ; tous les 3 jours, même jour.
function milo(steps: { early: boolean; report: boolean }): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-07', MONTH, H)],
    lines: [],
    today: '2026-03-07',
  }
  input = given(given(input, '2026-03-07', '08:00'), '2026-03-07', '20:00')
  input = on(input, '2026-03-18')
  if (steps.early) input = given(input, '2026-04-07', '20:00')
  if (steps.report) {
    input = moved(input, '2026-04-07', '08:00', '2026-04-12', false)
    input = given(input, '2026-04-12', '08:00')
  }
  input = edited(input, { frequency: THREE_DAYS, times: H, endsOn: null })
  return on(input, '2026-03-22')
}

describe('Décision de Gaelle du 15 octobre 2026 : une journée déplacée garde les heures du report', () => {
  it('Luna, la dose du 23 avancée au 15 ; le même jour, « sans heure » : le 15 garde 8, 14 et 20 h, la dose du 9 reste à renseigner', () => {
    const input = luna()
    expect(readings(input).moteur.ensuite).toEqual([
      '2026-04-15 08:00',
      '2026-04-15 14:00',
      '2026-04-15 20:00',
    ])
    expect(readings(hoursOnly(input, []))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-15 08:00'],
        aRenseigner: LUNA_UNLOGGED,
        ensuite: ['2026-04-15 08:00', '2026-04-15 14:00', '2026-04-15 20:00'],
      }),
    )
  })

  it('Luna, même report ; le même jour, 6 h seule : le 15 garde 8, 14 et 20 h, puis le 7 mai à 6 h', () => {
    expect(readings(hoursOnly(luna(), ['06:00']))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-15 08:00'],
        aRenseigner: LUNA_UNLOGGED,
        ensuite: ['2026-04-15 08:00', '2026-04-15 14:00', '2026-04-15 20:00'],
      }),
    )
  })

  it('graine 4900002127 : la dose du 22 avancée au 18, celle du 26 au 21 ; le 22, 6 h ajoutée : le report du 22 n’a rien laissé, rien le 22, la dose du 21 reste en retard, le 26, avancé, reste vide (décision du 16 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-12', SIX_WEEKS, ['20:00'], { stoppedOn: '2026-03-12' }),
        setting('s2', '2026-03-12', THREE_DAYS, ['20:00'], { firstDueChosen: false }),
        setting('s3', '2026-03-22', WEEK, ['20:00'], {
          startsOn: '2026-03-14',
          firstDueChosen: false,
        }),
      ],
      lines: [
        line('s1', 'missed', '2026-03-12', '20:00'),
        line('s1', 'extra', '2026-03-11', '20:00'),
        line('s1', 'extra', '2026-03-12', '20:00'),
        line('s1', 'postponed', '2026-04-23', '20:00', '2026-03-29'),
        { ...line('s2', 'given', '2026-03-15', '20:00'), ...givenOn('2026-03-14') },
        line('s2', 'shift', '2026-03-15', '20:00', '2026-03-14'),
        { ...line('s1', 'given', '2026-03-29', '20:00'), ...givenOn('2026-03-15') },
        line('s3', 'postponed', '2026-03-22', '20:00', '2026-03-18'),
        { ...line('s3', 'given', '2026-03-18', '20:00'), ...givenOn('2026-03-12') },
        line('s3', 'shift', '2026-03-22', '20:00', '2026-03-12'),
        line('s2', 'extra', '2026-03-14', '20:00'),
        line('s3', 'postponed', '2026-03-26', '20:00', '2026-03-21'),
      ],
      today: '2026-03-22',
    }
    expect(readings(input).moteur.moment).toEqual(['2026-03-21 20:00'])
    expect(readings(hoursOnly(input, ['06:00', '20:00']))).toEqual(
      both({
        phase: 'overdue',
        moment: ['2026-03-21 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-02 06:00', '2026-04-02 20:00', '2026-04-09 06:00'],
      }),
    )
  })
  it('graine 975000503 : chaque jour à 8, 14 et 20 h ; le 17 mars, 8 h reportée au 5 avr. avec décalage, puis 6, 12, 18 et 23 h le même jour : les doses reportées partent au 5 avr., le report n’a rien laissé, rien le 17 (décision du 16 octobre 2026)', () => {
    const daily = { value: 1, unit: 'day' as const }
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-14', daily, THREE, { endsOn: '2026-04-06' }),
        setting('s2', '2026-03-17', daily, ['06:00', '12:00', '18:00', '23:00'], {
          endsOn: '2026-04-06',
          gridOriginOn: null,
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-03-17', '08:00', '2026-04-05'),
        line('s1', 'shift', '2026-03-17', '08:00', '2026-04-05'),
        line('s1', 'given', '2026-03-16', '08:00'),
      ],
      today: '2026-03-18',
    }
    expect(states(input, '2026-03-17', '2026-03-17')).toEqual([])
    const { moteur } = readings(input)
    expect([...moteur.moment, ...moteur.aRenseigner].filter((due) => due < '2026-03-18')).toEqual([
      ...['2026-03-14', '2026-03-15'].flatMap((day) => THREE.map((time) => `${day} ${time}`)),
      '2026-03-16 14:00',
      '2026-03-16 20:00',
    ])
  })
  it('graine 7300000242 : la dose de 20 h du 14 mars reportée au 21, puis du 21 au 25 ; le 13, une minute plus tard, ou le 16, 20 h seule : le 21 reste vide, la dose reste le 25 à 20 h (décision du 15 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-14', TWO_WEEKS, THREE, { endsOn: '2026-04-21' }),
        setting('s2', '2026-03-14', MONTH, H, {
          startsOn: '2026-03-13',
          firstDueChosen: false,
          endsOn: '2026-04-21',
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-03-14', '14:00', '2026-03-21'),
        line('s1', 'shift', '2026-03-14', '14:00', '2026-03-21'),
        line('s1', 'postponed', '2026-03-21', '20:00', '2026-03-25'),
        line('s1', 'shift', '2026-03-21', '20:00', '2026-03-25'),
        { ...line('s2', 'given', '2026-03-14', '08:00'), ...givenOn('2026-03-13') },
      ],
      today: '2026-03-13',
    }
    expect(readings(input).moteur.moment).toEqual(['2026-03-25 20:00'])
    const after = hoursOnly(input, ['08:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-03-25 20:00'],
        aRenseigner: [],
        ensuite: ['2026-03-25 20:00', '2026-04-14 08:01', '2026-04-14 20:01'],
      }),
    )
    const evening = hoursOnly(on(input, '2026-03-16'), ['20:00'])
    expect(readings(evening).moteur.ensuite).toEqual(['2026-03-25 20:00', '2026-04-14 20:00'])
    expect(readings(evening).reference.ensuite).toEqual(['2026-03-25 20:00', '2026-04-14 20:00'])
  })
})

describe('Décision de Gaelle du 15 octobre 2026 : une journée à venir entamée garde son jour et ses heures (R9.2)', () => {
  it('graine 7300000097, Milo ; le 22 mars, 20 h seule : le 7 et le 12 gardent leurs heures, puis 10, 13, 16 à 20 h', () => {
    const after = hoursOnly(milo({ early: true, report: true }), ['20:00'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-10 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-10 20:00', '2026-04-13 20:00', '2026-04-16 20:00'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-13')).toEqual([
      '2026-04-07 20:00 given',
      '2026-04-10 20:00 pending',
      '2026-04-12 08:00 given',
      '2026-04-13 20:00 pending',
    ])
  })

  it('graine 7300000097, Milo ; le 22 mars, 6 h, 8 h et 20 h : le 7 et le 12 gardent leurs heures, rien de plus le 12', () => {
    const after = hoursOnly(milo({ early: true, report: true }), ['06:00', ...H])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-10 06:00'],
        aRenseigner: [],
        ensuite: ['2026-04-10 06:00', '2026-04-10 08:00', '2026-04-10 20:00'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-12')).toEqual([
      '2026-04-07 20:00 given',
      '2026-04-10 06:00 pending',
      '2026-04-10 08:00 pending',
      '2026-04-10 20:00 pending',
      '2026-04-12 08:00 given',
    ])
  })

  it('Milo, seule la dose du 7 à 20 h donnée d’avance ; le 22 mars, 8 h 01 et 20 h 01 : le 7, entamé, garde ses heures, reste 8 h', () => {
    const after = hoursOnly(milo({ early: true, report: false }), ['08:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-07 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-07 08:00', '2026-04-10 08:01', '2026-04-10 20:01'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-07')).toEqual([
      '2026-04-07 08:00 pending',
      '2026-04-07 20:00 given',
    ])
  })

  it('Milo, seule la dose du 7 à 8 h reportée au 12 et donnée d’avance ; le 22 mars, 8 h 01 et 20 h 01 : le 12 garde ses deux doses à 8 h et 20 h', () => {
    const input = milo({ early: false, report: true })
    expect(states(input, '2026-04-07', '2026-04-15')).toEqual([
      '2026-04-12 08:00 given',
      '2026-04-12 20:00 pending',
      '2026-04-15 08:00 pending',
      '2026-04-15 20:00 pending',
    ])
    const after = hoursOnly(input, ['08:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-12 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-12 20:00', '2026-04-15 08:01', '2026-04-15 20:01'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-15')).toEqual([
      '2026-04-12 08:00 given',
      '2026-04-12 20:00 pending',
      '2026-04-15 08:01 pending',
      '2026-04-15 20:01 pending',
    ])
  })
})

describe('Décision de Gaelle du 15 octobre 2026 : le calendrier ne bouge pas, graines du comparateur', () => {
  const days = (input: TreatmentViewInput) => [
    ...new Set(
      treatmentView(input)
        .slots(input.today, '2026-06-30')
        .map(({ due }) => due.dueOn),
    ),
  ]

  it('graine 7300000787 : la journée du 4 avril entamée, 18 h reportée au 12 ; le 21 mars, 9 h ajoutée : le report garde sa dose le 12, à 18 h (décision du 15 octobre 2026)', () => {
    const input = {
      settings: [
        {
          id: 's1',
          startsOn: '2026-03-21',
          firstDueOn: '2026-03-21',
          gridOriginOn: '2026-03-21',
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          endsOn: null,
          stoppedOn: null,
          frequency: { value: 2, unit: 'day' },
          times: ['06:00', '12:00', '18:00', '23:00'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          startsOn: '2026-03-21',
          firstDueOn: '2026-03-22',
          gridOriginOn: '2026-03-22',
          firstDueChosen: false,
          fallenDosesAnswer: 'unasked',
          endsOn: null,
          frequency: { value: 3, unit: 'month' },
          times: ['06:00', '12:00', '18:00', '23:00'],
          id: 's2',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:11.000Z',
        },
      ],
      lines: [
        {
          settingId: 's1',
          dueOn: '2026-03-21',
          dueTime: '06:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-03-22',
          id: 'l1',
          decidedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-21',
          dueTime: '06:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-03-22',
          id: 'l2',
          decidedAt: '2026-01-01T00:00:02.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '06:00',
          status: 'given',
          givenOn: '2026-03-21',
          targetOn: null,
          id: 'l3',
          decidedAt: '2026-01-01T00:00:03.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '12:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-04',
          id: 'l4',
          decidedAt: '2026-01-01T00:00:04.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '12:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-04-04',
          id: 'l5',
          decidedAt: '2026-01-01T00:00:05.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '12:00',
          status: 'given',
          givenOn: '2026-03-16',
          targetOn: null,
          id: 'l6',
          decidedAt: '2026-01-01T00:00:07.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '23:00',
          status: 'given',
          givenOn: '2026-03-20',
          targetOn: null,
          id: 'l8',
          decidedAt: '2026-01-01T00:00:08.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '18:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-12',
          id: 'l9',
          decidedAt: '2026-01-01T00:00:09.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '18:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-04-12',
          id: 'l10',
          decidedAt: '2026-01-01T00:00:10.000Z',
        },
      ],
      today: '2026-03-21',
    } as TreatmentViewInput
    const after = hoursOnly(input, ['06:00', '09:00', '12:00', '18:00', '23:00'])
    expect(days(after)).toEqual(days(input))
    expect(readings(after).moteur.moment).toEqual(['2026-04-12 18:00'])
    expect(readings(after).reference.moment).toEqual(['2026-04-12 18:00'])
  })

  it('graine 7300000056 : le 21 mars, arrivée du 12, 6 h restée et 12 h reportée au 23 ; le 13, « sans heure » : le 21 garde sa dose de 6 h (décision du 15 octobre 2026)', () => {
    const input = {
      settings: [
        {
          id: 's1',
          startsOn: '2026-03-12',
          firstDueOn: '2026-03-12',
          gridOriginOn: '2026-03-12',
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          endsOn: '2026-03-23',
          stoppedOn: null,
          frequency: { value: 1, unit: 'day' },
          times: ['06:00', '12:00', '18:00', '23:00'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          startsOn: '2026-03-13',
          firstDueOn: '2026-03-21',
          gridOriginOn: null,
          firstDueChosen: false,
          fallenDosesAnswer: 'unasked',
          endsOn: '2026-03-23',
          frequency: { value: 1, unit: 'day' },
          times: ['06:00', '12:00', '18:00', '23:00'],
          id: 's2',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:13.000Z',
        },
      ],
      lines: [
        {
          settingId: 's1',
          dueOn: '2026-03-12',
          dueTime: '06:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-03-21',
          id: 'l1',
          decidedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-12',
          dueTime: '06:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-03-21',
          id: 'l2',
          decidedAt: '2026-01-01T00:00:02.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-21',
          dueTime: '12:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-03-23',
          id: 'l4',
          decidedAt: '2026-01-01T00:00:04.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-23',
          dueTime: '12:00',
          status: 'given',
          givenOn: '2026-03-09',
          targetOn: null,
          id: 'l6',
          decidedAt: '2026-01-01T00:00:06.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-23',
          dueTime: '18:00',
          status: 'given',
          givenOn: '2026-03-12',
          targetOn: null,
          id: 'l7',
          decidedAt: '2026-01-01T00:00:10.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-23',
          dueTime: '23:00',
          status: 'given',
          givenOn: '2026-03-13',
          targetOn: null,
          id: 'l8',
          decidedAt: '2026-01-01T00:00:08.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-23',
          dueTime: '23:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-03-13',
          id: 'l9',
          decidedAt: '2026-01-01T00:00:09.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '12:00',
          status: 'given',
          givenOn: '2026-03-08',
          targetOn: null,
          id: 'l11',
          decidedAt: '2026-01-01T00:00:11.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '18:00',
          status: 'given',
          givenOn: '2026-03-09',
          targetOn: null,
          id: 'l12',
          decidedAt: '2026-01-01T00:00:12.000Z',
        },
      ],
      today: '2026-03-13',
    } as TreatmentViewInput
    const after = hoursOnly(input, [])
    expect(days(after)).toEqual(days(input))
    expect(readings(after).moteur.moment).toEqual(['2026-03-21 06:00'])
    expect(readings(after).reference.moment).toEqual(['2026-03-21 06:00'])
  })

  it('graine 7500000393 : le 23 avril ouvre le rythme, 20 h reportée au 26 sans effet ; le 17, une minute plus tard : rien le 26', () => {
    const input = {
      settings: [
        {
          id: 's1',
          startsOn: '2026-04-09',
          firstDueOn: '2026-04-09',
          gridOriginOn: '2026-04-09',
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          endsOn: null,
          stoppedOn: null,
          frequency: { value: 2, unit: 'week' },
          times: ['08:00', '20:00'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          startsOn: '2026-04-13',
          firstDueOn: '2026-04-23',
          gridOriginOn: '2026-04-23',
          firstDueChosen: true,
          fallenDosesAnswer: 'unasked',
          endsOn: null,
          frequency: { value: 2, unit: 'week' },
          times: ['08:00', '20:00'],
          id: 's2',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:05.000Z',
        },
        {
          startsOn: '2026-04-17',
          firstDueOn: '2026-04-23',
          gridOriginOn: '2026-04-23',
          firstDueChosen: false,
          fallenDosesAnswer: 'unasked',
          endsOn: null,
          frequency: { value: 2, unit: 'day' },
          times: ['08:00', '20:00'],
          id: 's3',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:12.000Z',
        },
      ],
      lines: [
        {
          settingId: 's1',
          dueOn: '2026-04-09',
          dueTime: '08:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-13',
          id: 'l1',
          decidedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-13',
          dueTime: '20:00',
          status: 'given',
          givenOn: '2026-04-11',
          targetOn: null,
          id: 'l2',
          decidedAt: '2026-01-01T00:00:07.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-13',
          dueTime: '08:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-23',
          id: 'l3',
          decidedAt: '2026-01-01T00:00:04.000Z',
        },
        {
          settingId: 's2',
          dueOn: '2026-04-23',
          dueTime: '08:00',
          status: 'given',
          givenOn: '2026-04-13',
          targetOn: null,
          id: 'l8',
          decidedAt: '2026-01-01T00:00:08.000Z',
        },
        {
          settingId: 's2',
          dueOn: '2026-04-23',
          dueTime: '20:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-26',
          id: 'l9',
          decidedAt: '2026-01-01T00:00:09.000Z',
        },
        {
          settingId: 's2',
          dueOn: '2026-05-07',
          dueTime: '08:00',
          status: 'given',
          givenOn: '2026-04-15',
          targetOn: null,
          id: 'l10',
          decidedAt: '2026-01-01T00:00:11.000Z',
        },
      ],
      today: '2026-04-17',
    } as TreatmentViewInput
    const after = minuteLater(input)
    expect(days(after)).toEqual(days(input))
    expect(readings(after).reference.ensuite).toEqual(readings(after).moteur.ensuite)
  })
})
