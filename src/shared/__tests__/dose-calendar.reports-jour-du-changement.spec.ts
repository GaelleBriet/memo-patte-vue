// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { edited, given, moved, on, readings, removed } from './dose-calendar.reglage-corrige.aides'
import { DAY, H, MONTH, TWO_DAYS, WEEK, line, setting } from './dose-calendar.v2.aides'

const THREE = ['08:00', '14:00', '20:00']

function sameHoursAgain(input: TreatmentViewInput, times: string[]) {
  const { frequency, endsOn } = treatmentView(input).currentSetting!
  return edited(input, { frequency, times, endsOn })
}

const states = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${due.dueOn}${due.dueTime ? ` ${due.dueTime}` : ''} ${state}`)

const effectsOf = (input: TreatmentViewInput, status: string) =>
  treatmentView(input)
    .history.filter(({ line }) => line.status === status)
    .map(({ effect }) => effect.kind)

// Milo, tous les 2 jours à 8 h, 14 h et 20 h, journée du 8 avril donnée ; le 9, la dose de 8 h du 10
// donnée d'avance, celle de 14 h du 10 reportée au 11 (14 h et 20 h partent), puis la prise de 8 h
// supprimée ; le 10, 8 h reste à donner. Même famille que les graines 7710000345 et 7710000688.
function earlyDoseLeft(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-04-08', TWO_DAYS, THREE)],
    lines: [],
    today: '2026-04-08',
  }
  for (const time of THREE) input = given(input, '2026-04-08', time)
  input = given(on(input, '2026-04-09'), '2026-04-10', '08:00')
  input = moved(input, '2026-04-10', '14:00', '2026-04-11', false)
  return on(removed(input, '2026-04-10', '08:00'), '2026-04-10')
}

describe('Le jour du changement, le jour de départ garde autant de doses que le report en a laissées', () => {
  it('chaque jour à 8, 14 et 20 h, 8 h du 17 mars reportée au 5 avril avec la case, puis 6, 12, 18 et 23 h le 17 : rien le 17, 8, 14 et 20 h le 5', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-15', DAY, THREE)],
      lines: [],
      today: '2026-03-15',
    }
    for (const day of ['2026-03-15', '2026-03-16']) {
      for (const time of THREE) input = given(input, day, time)
    }
    input = moved(on(input, '2026-03-17'), '2026-03-17', '08:00', '2026-04-05', true)
    const after = sameHoursAgain(input, ['06:00', '12:00', '18:00', '23:00'])
    expect(states(after, '2026-03-17', '2026-03-17')).toEqual([])
    expect(states(after, '2026-04-05', '2026-04-05')).toEqual([
      '2026-04-05 08:00 pending',
      '2026-04-05 14:00 pending',
      '2026-04-05 20:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(effectsOf(after, 'postponed')).toEqual(['moves'])
  })

  it('avant le changement : 8 h le 10, 14 h et 20 h le 11', () => {
    expect(states(earlyDoseLeft(), '2026-04-10', '2026-04-11')).toEqual([
      '2026-04-10 08:00 pending',
      '2026-04-11 14:00 pending',
      '2026-04-11 20:00 pending',
    ])
  })

  it('passage à « sans heure » le 10, une dose le 10, 14 h et 20 h le 11, puis le 12', () => {
    const after = sameHoursAgain(earlyDoseLeft(), [])
    expect(states(after, '2026-04-10', '2026-04-12')).toEqual([
      '2026-04-10 pending',
      '2026-04-11 14:00 pending',
      '2026-04-11 20:00 pending',
      '2026-04-12 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(effectsOf(after, 'postponed')).toEqual(['moves'])
  })

  it('passage à 6 h seule le 10 : 6 h le 10, 14 h et 20 h le 11, puis le 12 à 6 h', () => {
    const after = sameHoursAgain(earlyDoseLeft(), ['06:00'])
    expect(states(after, '2026-04-10', '2026-04-12')).toEqual([
      '2026-04-10 06:00 pending',
      '2026-04-11 14:00 pending',
      '2026-04-11 20:00 pending',
      '2026-04-12 06:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(effectsOf(after, 'postponed')).toEqual(['moves'])
  })

  it('passage à 9 h et 21 h le 10, 9 h le 10, 14 h et 20 h le 11, puis le 12 à 9 h et 21 h', () => {
    const after = sameHoursAgain(earlyDoseLeft(), ['09:00', '21:00'])
    expect(states(after, '2026-04-10', '2026-04-12')).toEqual([
      '2026-04-10 09:00 pending',
      '2026-04-11 14:00 pending',
      '2026-04-11 20:00 pending',
      '2026-04-12 09:00 pending',
      '2026-04-12 21:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(effectsOf(after, 'postponed')).toEqual(['moves'])
  })
})

// Graine 6200000897 : tous les mois à 20 h, la dose du 30 mars à 20 h marquée oubliée ; arrêt et
// reprise le 30, tous les 3 jours à 8 h, 14 h et 20 h ; la dose de 8 h du 30 reportée au 31.
function missedBeforeRestart(): TreatmentViewInput {
  const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
  const input: TreatmentViewInput = {
    settings: [
      setting('s1', '2026-03-30', MONTH, ['20:00'], { stoppedOn: '2026-03-30' }),
      setting('s2', '2026-03-30', THREE_DAYS, THREE),
    ],
    lines: [line('s1', 'missed', '2026-03-30', '20:00')],
    today: '2026-03-30',
  }
  return moved(input, '2026-03-30', '08:00', '2026-03-31', false)
}

describe('Le jour du changement, un report voit l’oubli d’avant la reprise qui vise une de ses heures', () => {
  it('graine 6200000897 : le report emporte 8 h et 14 h au 31, 20 h reste couverte par l’oubli', () => {
    const input = missedBeforeRestart()
    expect(states(input, '2026-03-30', '2026-03-31')).toEqual([
      '2026-03-30 20:00 covered',
      '2026-03-31 08:00 pending',
      '2026-03-31 14:00 pending',
    ])
  })

  it('graine 6200000897 : une minute de plus aux heures, le 31 ne réclame toujours que 8 h et 14 h', () => {
    const after = sameHoursAgain(missedBeforeRestart(), ['08:01', '14:01', '20:01'])
    expect(states(after, '2026-03-31', '2026-03-31')).toEqual([
      '2026-03-31 08:00 pending',
      '2026-03-31 14:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(effectsOf(after, 'postponed')).toEqual(['moves'])
  })
})

describe('Le jour où les heures changent, les prises du jour couvrent les premières heures du nouveau réglage (décision du 16 octobre 2026)', () => {
  it('chaque jour à 8 h et 20 h, 20 h donnée d’avance le 10, puis 9 h et 21 h le 10 : 9 h couverte, 21 h à donner', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-08', DAY, H)],
      lines: [],
      today: '2026-04-10',
    }
    input = given(input, '2026-04-10', '20:00')
    const after = sameHoursAgain(input, ['09:00', '21:00'])
    expect(states(after, '2026-04-10', '2026-04-10')).toEqual([
      '2026-04-10 09:00 covered',
      '2026-04-10 21:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })

  it('chaque jour à 8 h et 20 h, 20 h donnée le 3 avril, puis 9 h seule dès le 3 : 9 h du 3 couverte, le 4 à 9 h', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-01', DAY, H)],
      lines: [],
      today: '2026-04-03',
    }
    input = given(input, '2026-04-03', '20:00')
    const after = sameHoursAgain(input, ['09:00'])
    expect(states(after, '2026-04-03', '2026-04-04')).toEqual([
      '2026-04-03 09:00 covered',
      '2026-04-04 09:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

describe('Le jour où les heures changent, un oubli du jour reste à ce jour (comme sur main, #863)', () => {
  it('chaque jour à 8 h et 20 h, 8 h marquée oubliée le 10 avril, puis 9 h et 21 h dès le 10 : l’oubli couvre 9 h, 21 h reste à donner', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-08', DAY, H)],
      lines: [],
      today: '2026-04-10',
    }
    input = given(input, '2026-04-10', '08:00', 'missed')
    const after = sameHoursAgain(input, ['09:00', '21:00'])
    expect(states(after, '2026-04-10', '2026-04-10')).toEqual([
      '2026-04-10 09:00 covered',
      '2026-04-10 21:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

describe('D’un jour à l’autre, une prise sortie du calendrier couvre la première échéance qui suit, à moins d’un pas (R4)', () => {
  it('tous les 6 jours à 8 h et 20 h dès le 2 avril, les deux doses du 14 données d’avance le 7 ; le même jour, tous les 3 jours à 20 h dès le 7 : la prise de 8 h couvre le 16, celle de 20 h est sans effet, le 19 reste à donner (#862)', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-02', { value: 6, unit: 'day' }, H)],
      lines: [],
      today: '2026-04-07',
    }
    input = given(given(input, '2026-04-14', '08:00'), '2026-04-14', '20:00')
    const after = edited(input, {
      frequency: { value: 3, unit: 'day' },
      times: ['20:00'],
      endsOn: null,
      firstDueOn: '2026-04-07',
    })
    expect(states(after, '2026-04-13', '2026-04-19')).toEqual([
      '2026-04-13 20:00 pending',
      '2026-04-16 20:00 covered',
      '2026-04-19 20:00 pending',
    ])
    expect(effectsOf(after, 'given')).toEqual(['covers', 'idle'])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

describe('Un jour d’arrivée qui mêle des heures et une dose sans heure (décision du 16 octobre 2026)', () => {
  it('graine 6300001993 : la dose du 14 reportée au 22 y porte une dose sans heure, 6 h, 12 h et 18 h ; le 14, une heure ajoutée : le 22 les garde (#864)', () => {
    const FOUR = ['06:00', '12:00', '18:00', '23:00']
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-04-05', WEEK, FOUR),
        setting('s2', '2026-04-10', WEEK, FOUR, {
          startsOn: '2026-04-07',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
        setting('s3', '2026-04-12', DAY, [], { startsOn: '2026-04-11' }),
        setting('s4', '2026-04-14', DAY, [], { gridOriginOn: null, firstDueChosen: false }),
      ],
      lines: [
        line('s1', 'postponed', '2026-04-05', '06:00', '2026-04-10'),
        { ...line('s2', 'given', '2026-04-10', '06:00'), givenOn: '2026-04-09' },
        line('s2', 'postponed', '2026-04-11', '06:00', '2026-04-14'),
        line('s3', 'given', '2026-04-14', '23:00'),
        { ...line('s2', 'given', '2026-04-10', '12:00'), givenOn: '2026-04-12' },
        line('s4', 'postponed', '2026-04-14', null, '2026-04-22'),
        line('s4', 'shift', '2026-04-14', null, '2026-04-22'),
      ],
      today: '2026-04-14',
    }
    const reported = [
      '2026-04-22 pending',
      '2026-04-22 06:00 pending',
      '2026-04-22 12:00 pending',
      '2026-04-22 18:00 pending',
    ]
    expect(states(input, '2026-04-22', '2026-04-22')).toEqual(reported)
    const after = sameHoursAgain(input, ['06:00'])
    expect(states(after, '2026-04-22', '2026-04-22')).toEqual(reported)
    expect(effectsOf(after, 'postponed')).toEqual(['moves', 'moves', 'moves'])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})
