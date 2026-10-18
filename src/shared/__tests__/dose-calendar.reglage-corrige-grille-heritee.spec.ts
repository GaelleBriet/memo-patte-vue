// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { H, MONTH, keys, setting } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' } as const

const slotsOf = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

describe('R3, #868 : « Elles n’étaient pas à donner » à fréquence gardée ne fait pas repartir la grille d’une arrivée', () => {
  // Milo, tous les 3 jours à 8 h et 20 h depuis le 6 mars ; le 6, 8 h donnée, la dose du 9 reportée
  // au 17 avec « Décaler aussi les doses suivantes », puis tous les mois aux mêmes heures ; le 8,
  // « sans heure ».
  function milo(endsOn: string | null = null): TreatmentViewInput {
    const start: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-06', THREE_DAYS, H, { endsOn })],
      lines: [],
      today: '2026-03-06',
    }
    const noted = moved(given(start, '2026-03-06', '08:00'), '2026-03-09', '08:00', '2026-03-17')
    return on(edited(noted, { frequency: MONTH, times: H, endsOn }), '2026-03-08')
  }

  it('le 17 garde ses doses reportées, puis le 6 avril et le 6 mai, au rythme de toujours', () => {
    const after = edited(milo(), { frequency: MONTH, times: [], endsOn: null }, 'correct')
    expect(slotsOf(after, '2026-03-08', '2026-05-31')).toEqual([
      '2026-03-17 08:00 pending',
      '2026-03-17 20:00 pending',
      '2026-04-06 pending',
      '2026-05-06 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur.aRenseigner).toEqual([])
    expect(moteur).toEqual(reference)
  })

  it('fin le 10 avril : la dose du 6 avril ne disparaît pas', () => {
    const after = edited(
      milo('2026-04-10'),
      { frequency: MONTH, times: [], endsOn: '2026-04-10' },
      'correct',
    )
    expect(slotsOf(after, '2026-03-08', '2026-05-31')).toEqual([
      '2026-03-17 08:00 pending',
      '2026-03-17 20:00 pending',
      '2026-04-06 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('fréquence changée (tous les 2 mois) : le rythme repart du 17, ses doses reportées restent (R9.2)', () => {
    const twoMonths = { value: 2, unit: 'month' } as const
    const after = edited(milo(), { frequency: twoMonths, times: [], endsOn: null }, 'correct')
    expect(slotsOf(after, '2026-03-08', '2026-07-31')).toEqual([
      '2026-03-17 08:00 pending',
      '2026-03-17 20:00 pending',
      '2026-05-17 pending',
      '2026-07-17 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })
})

const L = (
  id: string,
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string,
  stamp: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  settingId,
  status,
  dueOn,
  dueTime,
  givenOn: status === 'given' ? dueOn : null,
  targetOn: null,
  updatedAt: `2026-01-01T00:00:${String(stamp).padStart(2, '0')}.000Z`,
  ...extra,
})

const S = (id: string, stamp: number, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-03-06',
  firstDueOn: '2026-03-06',
  gridOriginOn: '2026-03-06',
  firstDueChosen: false,
  fallenDosesAnswer: 'unasked',
  endsOn: null,
  stoppedOn: null,
  frequency: MONTH,
  times: [],
  createdAt: `2026-01-01T00:00:${String(stamp).padStart(2, '0')}.000Z`,
  ...fields,
})

describe('R3, #868 : graines du comparateur, fréquence gardée', () => {
  it('graine 8000000154 : le 17 mars garde ses trois doses à donner, puis le 6 avril', () => {
    const FOUR = ['06:00', '12:00', '18:00', '23:00']
    const input: TreatmentViewInput = {
      today: '2026-03-08',
      settings: [
        S('s1', 0, { frequency: THREE_DAYS, times: FOUR, firstDueChosen: true }),
        S('s2', 11, { times: FOUR }),
      ],
      lines: [
        L('l1', 's1', 'postponed', '2026-03-09', '06:00', 8, { targetOn: '2026-03-17' }),
        L('l2', 's1', 'shift', '2026-03-09', '06:00', 9, { targetOn: '2026-03-17' }),
        L('l3', 's1', 'given', '2026-03-06', '12:00', 3),
        L('l4', 's1', 'given', '2026-03-06', '23:00', 4),
        L('l7', 's1', 'given', '2026-03-06', '06:00', 7),
        L('l10', 's1', 'given', '2026-03-17', '23:00', 10, { givenOn: '2026-02-27' }),
      ],
    }
    const after = edited(input, { frequency: MONTH, times: [], endsOn: null }, 'correct')
    expect(slotsOf(after, '2026-03-08', '2026-05-31')).toEqual([
      '2026-03-17 06:00 pending',
      '2026-03-17 12:00 pending',
      '2026-03-17 18:00 pending',
      '2026-03-17 23:00 given',
      '2026-04-06 pending',
      '2026-05-06 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('graine 8000000726 : fin le 20 avril, le 23 mars garde sa dose à donner et la dose du 18 avril reste', () => {
    const until = { endsOn: '2026-03-20' }
    const input: TreatmentViewInput = {
      today: '2026-03-23',
      settings: [
        S('s1', 0, {
          ...until,
          startsOn: '2026-03-10',
          firstDueOn: '2026-03-10',
          gridOriginOn: '2026-03-10',
          frequency: { value: 2, unit: 'day' },
          times: ['08:00', '14:00', '20:00'],
        }),
        S('s2', 5, {
          ...until,
          startsOn: '2026-03-13',
          firstDueOn: '2026-03-16',
          gridOriginOn: '2026-03-16',
          frequency: THREE_DAYS,
          times: H,
        }),
        S('s3', 21, {
          startsOn: '2026-03-13',
          firstDueOn: '2026-03-18',
          gridOriginOn: '2026-03-18',
          endsOn: '2026-04-20',
          times: ['20:00'],
        }),
      ],
      lines: [
        L('l1', 's1', 'given', '2026-03-10', '14:00', 7, { givenOn: '2026-03-09' }),
        L('l2', 's1', 'postponed', '2026-03-12', '08:00', 2, { targetOn: '2026-03-13' }),
        L('l3', 's1', 'shift', '2026-03-12', '08:00', 3, { targetOn: '2026-03-13' }),
        L('l4', 's2', 'given', '2026-03-23', '20:00', 25),
        L('l8', 's1', 'given', '2026-03-13', '08:00', 24, { givenOn: '2026-03-17' }),
        L('l10', 's1', 'postponed', '2026-03-13', '14:00', 12, { targetOn: '2026-03-18' }),
        L('l11', 's2', 'shift', '2026-03-13', '14:00', 13, { targetOn: '2026-03-18' }),
        L('l17', 's2', 'postponed', '2026-03-16', '08:00', 22, { targetOn: '2026-03-23' }),
        L('l18', 's3', 'shift', '2026-03-16', '08:00', 23, { targetOn: '2026-03-23' }),
      ],
    }
    const after = edited(input, { frequency: MONTH, times: [], endsOn: '2026-04-20' }, 'correct')
    expect(slotsOf(after, '2026-03-21', '2026-05-31')).toEqual([
      '2026-03-23 08:00 pending',
      '2026-03-23 20:00 given',
      '2026-04-18 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })

  it('graine 8000000655 : sans journée de la grille avant la fin, la première dose à donner reste la date proposée', () => {
    const until = { endsOn: '2026-04-24' }
    const twoWeeks = { value: 2, unit: 'week' } as const
    const three = ['08:00', '14:00', '20:00']
    const at = (day: string) => ({ startsOn: day, firstDueOn: day, gridOriginOn: day })
    const input: TreatmentViewInput = {
      today: '2026-04-19',
      settings: [
        S('s1', 0, { ...at('2026-04-02'), frequency: { value: 2, unit: 'day' }, times: three }),
        S('s2', 2, { ...at('2026-04-04'), ...until, frequency: twoWeeks, times: three }),
        S('s3', 11, {
          ...until,
          startsOn: '2026-04-11',
          firstDueOn: '2026-04-22',
          gridOriginOn: null,
          frequency: twoWeeks,
          times: three,
        }),
        S('s4', 14, {
          ...until,
          startsOn: '2026-04-11',
          firstDueOn: '2026-04-18',
          gridOriginOn: null,
          frequency: twoWeeks,
          times: three,
        }),
        S('s5', 16, {
          ...until,
          startsOn: '2026-04-16',
          firstDueOn: '2026-04-18',
          gridOriginOn: '2026-04-18',
          times: ['06:00', '12:00', '18:00', '23:00'],
        }),
      ],
      lines: [
        L('l3', 's2', 'postponed', '2026-04-04', '08:00', 3, { targetOn: '2026-04-05' }),
        L('l4', 's2', 'given', '2026-04-05', '08:00', 4, { givenOn: '2026-04-04' }),
        L('l5', 's1', 'given', '2026-04-02', '20:00', 9, { givenOn: '2026-04-03' }),
        L('l6', 's2', 'postponed', '2026-04-05', '14:00', 6, { targetOn: '2026-04-22' }),
        L('l8', 's2', 'given', '2026-04-22', '14:00', 12, { givenOn: '2026-04-09' }),
        L('l13', 's3', 'given', '2026-04-18', '08:00', 13, { givenOn: '2026-04-10' }),
        L('l15', 's4', 'given', '2026-04-18', '14:00', 15, { givenOn: '2026-04-11' }),
        L('l17', 's2', 'postponed', '2026-04-22', '20:00', 17, { targetOn: '2026-04-24' }),
        L('l18', 's5', 'shift', '2026-04-22', '20:00', 18, { targetOn: '2026-04-24' }),
      ],
    }
    const request = { frequency: MONTH, times: ['12:00', '18:00', '23:00'], endsOn: '2026-04-24' }
    const result = newSettings(input, { ...request, firstDueOn: '2026-04-24' })
    expect('question' in result).toBe(true)
    const after = edited(input, request, 'correct')
    expect(slotsOf(after, '2026-04-19', '2026-05-31')).toEqual([
      '2026-04-22 14:00 given',
      '2026-04-24 20:00 pending',
    ])
    const { moteur, reference } = readings(after)
    expect(moteur).toEqual(reference)
  })
})
