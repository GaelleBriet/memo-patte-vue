// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  noteDose,
  treatmentView,
  type Frequency,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { DAY, H, TWO_DAYS, keys, line, setting } from './dose-calendar.v2.aides'

const THREE_DAYS: Frequency = { value: 3, unit: 'day' }
const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }
const MONTH: Frequency = { value: 1, unit: 'month' }
const THREE = ['08:00', '14:00', '20:00']

function hoursOnly(input: TreatmentViewInput, times: string[]) {
  const { frequency, endsOn } = treatmentView(input).currentSetting!
  return edited(input, { frequency, times, endsOn })
}

const states = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

const effectOf = (input: TreatmentViewInput, status: string) =>
  treatmentView(input).history.find(({ line }) => line.status === status)?.effect.kind

// Luna, toutes les 2 semaines à 8, 14 et 20 h dès le 9 avril, journée du 9 donnée ; le 12, la dose du
// 23 avancée au 15, sans décaler la suite.
function luna(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-04-09', TWO_WEEKS, THREE)],
    lines: [],
    today: '2026-04-09',
  }
  for (const time of THREE) input = given(input, '2026-04-09', time)
  return on(input, '2026-04-12')
}

const LUNA_AFTER = both({
  phase: 'upcoming',
  moment: ['2026-04-15 08:00'],
  aRenseigner: [],
  ensuite: ['2026-04-15 08:00', '2026-04-15 14:00', '2026-04-15 20:00'],
})

// Milo, tous les mois à 8 h et 20 h dès le 7 mars ; le 18 mars, la dose du 7 avril à 20 h donnée
// d'avance, celle de 8 h reportée au 12 sans décaler et donnée d'avance, puis tous les 3 jours.
function milo(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-07', MONTH, H)],
    lines: [],
    today: '2026-03-07',
  }
  input = given(given(input, '2026-03-07', '08:00'), '2026-03-07', '20:00')
  input = given(on(input, '2026-03-18'), '2026-04-07', '20:00')
  input = moved(input, '2026-04-07', '08:00', '2026-04-12', false)
  input = given(input, '2026-04-12', '08:00')
  input = edited(input, { frequency: THREE_DAYS, times: H, endsOn: null })
  return on(input, '2026-03-22')
}

describe('Décision de Gaelle du 15 octobre 2026 : une journée touchée garde ses heures', () => {
  it('Luna : le 12, la dose du 23 avancée au 15, puis 6 h seule le même jour : le 15 porte 8, 14 et 20 h, le 23 est vide, puis le 7 mai à 6 h', () => {
    const before = moved(luna(), '2026-04-23', '08:00', '2026-04-15', false)
    const after = hoursOnly(before, ['06:00'])
    expect(readings(after)).toEqual(LUNA_AFTER)
    expect(keys(treatmentView(after).upcoming({ limit: 5 })).slice(3)).toEqual([
      '2026-05-07 06:00',
      '2026-05-21 06:00',
    ])
    expect(states(after, '2026-04-23', '2026-04-23')).toEqual([])
    expect(treatmentView(after).dueState({ dueOn: '2026-04-23', dueTime: '08:00' })).toBe('moved')
    expect(effectOf(after, 'postponed')).toBe('moves')
    const fifteenth = treatmentView(after).slots('2026-04-15', '2026-04-15')
    expect(fifteenth.map(({ due }) => due.settingId)).toEqual(['s1', 's1', 's1'])
    const gesture = { status: 'given', givenOn: '2026-04-15', shiftsFollowing: false } as const
    const done = noteDose(on(after, '2026-04-15'), { due: fifteenth[0]!.due, ...gesture })
    if ('refusal' in done) throw new Error(JSON.stringify(done))
    expect(done.changes).toMatchObject([{ action: 'create', line: { settingId: 's1' } }])
  })

  it('deux téléphones : A avance la dose du 23 au 15, B passe à 6 h le même jour sans voir le report ; après synchro, une seule lecture', () => {
    const base = luna()
    const phoneA = moved(base, '2026-04-23', '08:00', '2026-04-15', false)
    const phoneB = hoursOnly(base, ['06:00'])
    const synced = { ...phoneB, lines: phoneA.lines }
    expect(readings(synced)).toEqual(LUNA_AFTER)
    expect(keys(treatmentView(synced).upcoming({ limit: 4 })).at(-1)).toBe('2026-05-07 06:00')
    expect(effectOf(synced, 'postponed')).toBe('moves')
  })

  it('graine 7300000097, Milo : le 22 mars, 8 h 01 et 20 h 01 : le 7 et le 12 gardent leurs heures et restent couverts, puis 10, 13 et 16 aux nouvelles heures', () => {
    const input = milo()
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
    expect(treatmentView(after).dueState({ dueOn: '2026-04-07', dueTime: '08:00' })).toBe('moved')
    expect(states(after, '2026-04-07', '2026-04-16')).toEqual([
      '2026-04-07 20:00 given',
      '2026-04-10 08:01 pending',
      '2026-04-10 20:01 pending',
      '2026-04-12 08:00 given',
      '2026-04-13 08:01 pending',
      '2026-04-13 20:01 pending',
      '2026-04-16 08:01 pending',
      '2026-04-16 20:01 pending',
    ])
  })

  it('Milo, chaque jour à 8 h et 20 h, 8 h donnée ce matin ; heures passées à 9 h et 21 h : aujourd’hui 9 h couverte par la prise de 8 h (R4), 21 h à donner ; demain 9 h et 21 h', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-07', DAY, H)],
      lines: [],
      today: '2026-04-07',
    }
    input = given(input, '2026-04-07', '08:00')
    const after = hoursOnly(input, ['09:00', '21:00'])
    expect(readings(after)).toEqual(
      both({
        phase: 'today',
        moment: ['2026-04-07 21:00'],
        aRenseigner: [],
        ensuite: ['2026-04-07 21:00', '2026-04-08 09:00', '2026-04-08 21:00'],
      }),
    )
    expect(states(after, '2026-04-07', '2026-04-07')).toEqual([
      '2026-04-07 09:00 covered',
      '2026-04-07 21:00 pending',
    ])
  })

  it('Milo, même traitement, la dose de demain à 8 h aussi donnée d’avance ; heures passées à 9 h et 21 h : demain garde 8 h donnée et 20 h à donner', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-07', DAY, H)],
      lines: [],
      today: '2026-04-07',
    }
    input = given(given(input, '2026-04-07', '08:00'), '2026-04-08', '08:00')
    const after = hoursOnly(input, ['09:00', '21:00'])
    expect(states(after, '2026-04-07', '2026-04-09')).toEqual([
      '2026-04-07 09:00 covered',
      '2026-04-07 21:00 pending',
      '2026-04-08 08:00 given',
      '2026-04-08 20:00 pending',
      '2026-04-09 09:00 pending',
      '2026-04-09 21:00 pending',
    ])
    expect(readings(after).reference.ensuite).toEqual([
      '2026-04-07 21:00',
      '2026-04-08 20:00',
      '2026-04-09 09:00',
    ])
  })
})

describe('Décision de Gaelle du 16 octobre 2026 : la journée du changement n’est traduite que si le réglage qui la lit change d’heures', () => {
  const FOUR = ['06:00', '12:00', '18:00', '23:00']
  const givenOn = (note: Line, on: string): Line => ({ ...note, givenOn: on })

  // Graine 7810000428 : tous les 2 jours à 6, 12, 18 et 23 h ; le 7 avril, « Prochaine dose » le 12,
  // 6 h du 12 donnée d'avance et 23 h du 12 reportée au 13 ; le 8, 20 h seule ; le 12, 12 h donnée.
  function seed428(withNoon: boolean): TreatmentViewInput {
    const lines = [
      givenOn(line('s1', 'given', '2026-04-05', '18:00'), '2026-04-07'),
      givenOn(line('s2', 'given', '2026-04-12', '06:00'), '2026-04-07'),
      line('s2', 'postponed', '2026-04-12', '23:00', '2026-04-13'),
      line('s1', 'given', '2026-04-05', '23:00'),
      ...(withNoon ? [line('s2', 'given', '2026-04-12', '12:00')] : []),
    ]
    return {
      settings: [
        setting('s1', '2026-04-05', TWO_DAYS, FOUR, { createdAt: '2026-01-01T00:00:00.000Z' }),
        setting('s2', '2026-04-12', TWO_DAYS, FOUR, {
          startsOn: '2026-04-07',
          createdAt: '2026-01-01T00:00:01.000Z',
        }),
        setting('s3', '2026-04-12', TWO_DAYS, ['20:00'], {
          startsOn: '2026-04-08',
          gridOriginOn: null,
          firstDueChosen: false,
          createdAt: '2026-01-01T00:00:09.000Z',
        }),
      ],
      lines,
      today: '2026-04-12',
    }
  }

  it('chaque jour à 8 h et 20 h, 20 h donnée le 3, 9 h seule dès le 3 : le réglage qui lit le 3 change d’heures, 9 h couverte', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-01', DAY, H)],
      lines: [],
      today: '2026-04-03',
    }
    input = given(input, '2026-04-03', '20:00')
    const after = hoursOnly(input, ['09:00'])
    expect(states(after, '2026-04-03', '2026-04-04')).toEqual([
      '2026-04-03 09:00 covered',
      '2026-04-04 09:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })

  it('graine 7810000428 : 20 h → 20 h 01 le 12, journée touchée sous 6, 12, 18 et 23 h : 6 h et 12 h données, 18 h à donner, 23 h au 13', () => {
    const before = seed428(true)
    expect(states(before, '2026-04-12', '2026-04-13')).toEqual([
      '2026-04-12 06:00 given',
      '2026-04-12 12:00 given',
      '2026-04-12 18:00 pending',
      '2026-04-13 23:00 pending',
    ])
    const after = hoursOnly(before, ['20:01'])
    expect(states(after, '2026-04-12', '2026-04-14')).toEqual([
      '2026-04-12 06:00 given',
      '2026-04-12 12:00 given',
      '2026-04-12 18:00 pending',
      '2026-04-13 23:00 pending',
      '2026-04-14 20:01 pending',
    ])
    expect(effectOf(after, 'postponed')).toBe('moves')
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })

  it('même carnet avec la seule prise de 6 h : 12 h et 18 h restent à donner le 12', () => {
    const after = hoursOnly(seed428(false), ['20:01'])
    expect(states(after, '2026-04-12', '2026-04-14')).toEqual([
      '2026-04-12 06:00 given',
      '2026-04-12 12:00 pending',
      '2026-04-12 18:00 pending',
      '2026-04-13 23:00 pending',
      '2026-04-14 20:01 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})
