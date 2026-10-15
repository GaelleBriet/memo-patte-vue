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

describe('Décision de Gaelle du 15 octobre 2026 (question 1) : un report déplace des doses, pas des heures', () => {
  it('Luna, la dose du 23 avancée au 15 ; le même jour, « sans heure » : le 15 garde une dose, la dose du 9 reste à renseigner', () => {
    const input = luna()
    expect(readings(input).moteur.ensuite).toEqual([
      '2026-04-15 08:00',
      '2026-04-15 14:00',
      '2026-04-15 20:00',
    ])
    expect(readings(hoursOnly(input, []))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-15'],
        aRenseigner: LUNA_UNLOGGED,
        ensuite: ['2026-04-15', '2026-05-07', '2026-05-21'],
      }),
    )
  })

  it('Luna, même report ; le même jour, 6 h seule : le 15 garde une dose, à 6 h', () => {
    expect(readings(hoursOnly(luna(), ['06:00']))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-15 06:00'],
        aRenseigner: LUNA_UNLOGGED,
        ensuite: ['2026-04-15 06:00', '2026-05-07 06:00', '2026-05-21 06:00'],
      }),
    )
  })

  it('graine 4900002127 : la dose du 22 avancée au 18, celle du 26 au 21 ; le 22, 6 h ajoutée : la dose du 21 reste en retard', () => {
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
  it('graine 975000503 : chaque jour à 8, 14 et 20 h ; le 17 mars, 8 h reportée au 5 avr. avec décalage, puis 6, 12, 18 et 23 h : la journée du 17 reste reportée, aucune dose de 6 h', () => {
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
  it('graine 7300000242 : la dose de 20 h du 14 mars reportée au 21, puis du 21 au 25 ; le 13, une minute plus tard, ou le 16, 20 h seule : le 21 reste vide, la dose reste le 25', () => {
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
        moment: ['2026-03-25 20:01'],
        aRenseigner: [],
        ensuite: ['2026-03-25 20:01', '2026-04-14 08:01', '2026-04-14 20:01'],
      }),
    )
    const evening = hoursOnly(on(input, '2026-03-16'), ['20:00'])
    expect(readings(evening).moteur.ensuite).toEqual(['2026-03-25 20:00', '2026-04-14 20:00'])
    expect(readings(evening).reference.ensuite).toEqual(['2026-03-25 20:00', '2026-04-14 20:00'])
  })
})

describe('Décision de Gaelle du 15 octobre 2026 (question 2) : une journée à venir entamée garde son jour (R9.2)', () => {
  it('graine 7300000097, Milo : 7 avril à 20 h donnée d’avance, 8 h reportée au 12 et donnée ; le 22 mars, 8 h 01 et 20 h 01 : le 7 et le 12 couverts, puis 10, 13, 16', () => {
    const input = milo({ early: true, report: true })
    expect(readings(input).moteur.ensuite).toEqual([
      '2026-04-10 08:00',
      '2026-04-10 20:00',
      '2026-04-13 08:00',
    ])
    const after = hoursOnly(input, ['08:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-10 08:01'],
        aRenseigner: [],
        ensuite: ['2026-04-10 08:01', '2026-04-10 20:01', '2026-04-13 08:01'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-16')).toEqual([
      '2026-04-07 08:01 covered',
      '2026-04-10 08:01 pending',
      '2026-04-10 20:01 pending',
      '2026-04-12 20:01 covered',
      '2026-04-13 08:01 pending',
      '2026-04-13 20:01 pending',
      '2026-04-16 08:01 pending',
      '2026-04-16 20:01 pending',
    ])
  })

  it('Milo, même carnet ; le 22 mars, 20 h seule : le 7 et le 12 couverts, puis 10, 13, 16 à 20 h', () => {
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
      '2026-04-12 20:00 covered',
      '2026-04-13 20:00 pending',
    ])
  })

  it('Milo, même carnet ; le 22 mars, 6 h, 8 h et 20 h : le 7 et le 12 couverts, rien de plus le 12', () => {
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
      '2026-04-07 06:00 covered',
      '2026-04-10 06:00 pending',
      '2026-04-10 08:00 pending',
      '2026-04-10 20:00 pending',
      '2026-04-12 20:00 covered',
    ])
  })

  it('Milo, seule la dose du 7 à 20 h donnée d’avance ; le 22 mars, 8 h 01 et 20 h 01 : elle couvre 8 h 01, reste 20 h 01 le 7', () => {
    const after = hoursOnly(milo({ early: true, report: false }), ['08:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-07 20:01'],
        aRenseigner: [],
        ensuite: ['2026-04-07 20:01', '2026-04-10 08:01', '2026-04-10 20:01'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-07')).toEqual([
      '2026-04-07 08:01 covered',
      '2026-04-07 20:01 pending',
    ])
  })

  it('Milo, seule la dose du 7 à 8 h reportée au 12 et donnée d’avance ; le 22 mars, 8 h 01 et 20 h 01 : le 12 garde ses deux doses, 8 h 01 couverte', () => {
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
        moment: ['2026-04-12 20:01'],
        aRenseigner: [],
        ensuite: ['2026-04-12 20:01', '2026-04-15 08:01', '2026-04-15 20:01'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-15')).toEqual([
      '2026-04-12 08:01 covered',
      '2026-04-12 20:01 pending',
      '2026-04-15 08:01 pending',
      '2026-04-15 20:01 pending',
    ])
  })
})

describe('Décision de Gaelle du 15 octobre 2026 (question 1) : le calendrier ne bouge pas, graines du comparateur', () => {
  const days = (input: TreatmentViewInput) => [
    ...new Set(
      treatmentView(input)
        .slots(input.today, '2026-06-30')
        .map(({ due }) => due.dueOn),
    ),
  ]

  it('graine 7300000459 : une dose reportée au 2 avril puis du 2 avril au 11 mars ; le 14, 6 h ajoutée : rien le 2 avril', () => {
    const input = {
      settings: [
        {
          id: 's1',
          startsOn: '2026-03-08',
          firstDueOn: '2026-03-08',
          gridOriginOn: '2026-03-08',
          firstDueChosen: true,
          pastDosesStayUnlogged: false,
          endsOn: null,
          stoppedOn: null,
          frequency: { value: 1, unit: 'month' },
          times: ['06:00', '12:00', '18:00', '23:00'],
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          startsOn: '2026-03-06',
          firstDueOn: '2026-04-14',
          gridOriginOn: null,
          firstDueChosen: false,
          pastDosesStayUnlogged: false,
          endsOn: null,
          frequency: { value: 1, unit: 'month' },
          times: [],
          id: 's2',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:07.000Z',
        },
        {
          startsOn: '2026-03-09',
          firstDueOn: '2026-04-14',
          gridOriginOn: null,
          firstDueChosen: false,
          pastDosesStayUnlogged: false,
          endsOn: null,
          frequency: { value: 1, unit: 'month' },
          times: ['20:00'],
          id: 's3',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:08.000Z',
        },
        {
          startsOn: '2026-03-14',
          firstDueOn: '2026-04-08',
          gridOriginOn: '2026-04-08',
          firstDueChosen: false,
          pastDosesStayUnlogged: false,
          endsOn: null,
          frequency: { value: 2, unit: 'day' },
          times: ['20:00'],
          id: 's4',
          stoppedOn: null,
          createdAt: '2026-01-01T00:00:18.000Z',
        },
      ],
      lines: [
        {
          settingId: 's1',
          dueOn: '2026-03-08',
          dueTime: '06:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-02',
          id: 'l1',
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-04-02',
          dueTime: '20:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-03-11',
          id: 'l3',
          updatedAt: '2026-01-01T00:00:09.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-03-11',
          dueTime: '20:00',
          status: 'given',
          givenOn: '2026-03-10',
          targetOn: null,
          id: 'l10',
          updatedAt: '2026-01-01T00:00:14.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-04-08',
          dueTime: '20:00',
          status: 'given',
          givenOn: '2026-03-14',
          targetOn: null,
          id: 'l12',
          updatedAt: '2026-01-01T00:00:12.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-04-08',
          dueTime: '20:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-03-14',
          id: 'l13',
          updatedAt: '2026-01-01T00:00:13.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-03-10',
          dueTime: '20:00',
          status: 'extra',
          givenOn: '2026-03-10',
          targetOn: null,
          id: 'l15',
          updatedAt: '2026-01-01T00:00:15.000Z',
        },
        {
          settingId: 's3',
          dueOn: '2026-03-14',
          dueTime: '20:00',
          status: 'extra',
          givenOn: '2026-03-14',
          targetOn: null,
          id: 'l16',
          updatedAt: '2026-01-01T00:00:17.000Z',
        },
      ],
      today: '2026-03-14',
    } as TreatmentViewInput
    const after = hoursOnly(input, ['06:00', '20:00'])
    expect(days(after)).toEqual(days(input))
    expect(readings(after).moteur.moment).toEqual(['2026-04-10 06:00'])
    expect(readings(after).reference.moment).toEqual(['2026-04-10 06:00'])
  })

  it('graine 7300000787 : la journée du 4 avril entamée, 18 h reportée au 12 ; le 21 mars, 9 h ajoutée : le report garde sa dose le 12', () => {
    const input = {
      settings: [
        {
          id: 's1',
          startsOn: '2026-03-21',
          firstDueOn: '2026-03-21',
          gridOriginOn: '2026-03-21',
          firstDueChosen: true,
          pastDosesStayUnlogged: false,
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
          pastDosesStayUnlogged: false,
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
          updatedAt: '2026-01-01T00:00:01.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-21',
          dueTime: '06:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-03-22',
          id: 'l2',
          updatedAt: '2026-01-01T00:00:02.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '06:00',
          status: 'given',
          givenOn: '2026-03-21',
          targetOn: null,
          id: 'l3',
          updatedAt: '2026-01-01T00:00:03.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '12:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-04',
          id: 'l4',
          updatedAt: '2026-01-01T00:00:04.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-03-22',
          dueTime: '12:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-04-04',
          id: 'l5',
          updatedAt: '2026-01-01T00:00:05.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '12:00',
          status: 'given',
          givenOn: '2026-03-16',
          targetOn: null,
          id: 'l6',
          updatedAt: '2026-01-01T00:00:07.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '23:00',
          status: 'given',
          givenOn: '2026-03-20',
          targetOn: null,
          id: 'l8',
          updatedAt: '2026-01-01T00:00:08.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '18:00',
          status: 'postponed',
          givenOn: null,
          targetOn: '2026-04-12',
          id: 'l9',
          updatedAt: '2026-01-01T00:00:09.000Z',
        },
        {
          settingId: 's1',
          dueOn: '2026-04-04',
          dueTime: '18:00',
          status: 'shift',
          givenOn: null,
          targetOn: '2026-04-12',
          id: 'l10',
          updatedAt: '2026-01-01T00:00:10.000Z',
        },
      ],
      today: '2026-03-21',
    } as TreatmentViewInput
    const after = hoursOnly(input, ['06:00', '09:00', '12:00', '18:00', '23:00'])
    expect(days(after)).toEqual(days(input))
    expect(readings(after).moteur.moment).toEqual(['2026-04-12 23:00'])
    expect(readings(after).reference.moment).toEqual(['2026-04-12 23:00'])
  })
})
