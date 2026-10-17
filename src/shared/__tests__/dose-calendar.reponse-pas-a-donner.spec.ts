// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { H, MONTH, keys } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' } as const
const stampOf = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`

const L = (
  id: string,
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string,
  n: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  settingId,
  status,
  dueOn,
  dueTime,
  givenOn: status === 'given' ? dueOn : null,
  targetOn: null,
  updatedAt: stampOf(n),
  ...extra,
})

const S = (id: string, n: number, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-03-06',
  firstDueOn: '2026-03-06',
  gridOriginOn: '2026-03-06',
  firstDueChosen: false,
  pastDosesStayUnlogged: false,
  endsOn: null,
  stoppedOn: null,
  frequency: MONTH,
  times: [],
  createdAt: stampOf(n),
  ...fields,
})

const slotsOf = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

// Graine 8000000726 : tous les 3 jours à 8 h et 20 h, réglages du 13 mars ; la dose de 14 h du 13
// reportée au 18 (arrivée qui ouvre le rythme), la dose de 8 h du 16 reportée au 23 ; le 23, « Modifier »
// tous les mois, sans heure, fin le 20 avril.
function graine726(): TreatmentViewInput {
  const until = { endsOn: '2026-03-20' }
  return {
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
}

const SANS_HEURE = { frequency: MONTH, times: [], endsOn: '2026-04-20' }

describe('#873 : « Elles n’étaient pas à donner » retire les doses tombées sans prise avant le jour de la réponse (décision du 17 octobre 2026)', () => {
  it('la question liste 14 h et 20 h du 18 mars ; la réponse les retire, le report du 13 devient sans effet, le 23 reste', () => {
    const input = graine726()
    const asked = newSettings(input, SANS_HEURE)
    expect('question' in asked && keys(asked.question.fallen)).toEqual([
      '2026-03-18 14:00',
      '2026-03-18 20:00',
    ])
    const after = edited(input, SANS_HEURE, 'correct')
    expect(slotsOf(after, '2026-03-13', '2026-05-31')).toEqual([
      '2026-03-13 08:00 given',
      '2026-03-23 08:00 pending',
      '2026-03-23 20:00 given',
      '2026-04-18 pending',
    ])
    expect(effectOf(after, 'l10')).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(effectOf(after, 'l17')).toMatchObject({ kind: 'moves', arrival: '2026-03-23' })
    const { moteur, reference } = readings(after)
    expect(moteur.aRenseigner).toEqual(['2026-03-10 08:00', '2026-03-10 20:00'])
    expect(moteur).toEqual(reference)
  })

  it('« Elles restent à renseigner » : rien n’est retiré', () => {
    const after = edited(graine726(), SANS_HEURE, 'keep')
    expect(readings(after).moteur.aRenseigner).toContain('2026-03-18 14:00')
  })

  it('#872 : tous les 3 mois à 20 h, fin le 6 mai, doses du 4 et du 11 données, la dose du 18 mars reportée au 22 où elle ouvre le rythme ; le 23, 12, 18 et 23 h : « Elles n’étaient pas à donner » est refusée (#806), « Elles restent à renseigner » non', () => {
    const QUARTER = { value: 3, unit: 'month' } as const
    const WEEK = { value: 1, unit: 'week' } as const
    let c: TreatmentViewInput = {
      settings: [
        S('w1', 0, {
          startsOn: '2026-03-04',
          firstDueOn: '2026-03-04',
          gridOriginOn: '2026-03-04',
          frequency: WEEK,
          times: ['20:00'],
        }),
      ],
      lines: [],
      today: '2026-03-17',
    }
    c = given(on(c, '2026-03-04'), '2026-03-04', '20:00')
    c = given(on(c, '2026-03-11'), '2026-03-11', '20:00')
    c = moved(on(c, '2026-03-17'), '2026-03-18', '20:00', '2026-03-22', false)
    c = edited(on(c, '2026-03-20'), { frequency: QUARTER, times: ['20:00'], endsOn: '2026-05-06' })
    expect(treatmentView(on(c, '2026-03-20')).currentSetting?.firstDueOn).toBe('2026-03-22')
    const request = { frequency: QUARTER, times: ['12:00', '18:00', '23:00'], endsOn: '2026-05-06' }
    const asked = newSettings(on(c, '2026-03-23'), request)
    expect(asked).toMatchObject({
      question: { correct: { refusal: { reason: 'no-dose-before-end' } } },
    })
    expect('question' in asked && 'refusal' in asked.question.keep).toBe(false)
  })

  it('#872, carnet sans aucune prise (Q39) : tous les 3 mois à 20 h, fin le 6 mai, dose du 18 mars reportée au 22 où elle ouvre le rythme ; le 23, 12, 18 et 23 h : « Elles n’étaient pas à donner » est refusée, rien ne repart d’aujourd’hui (décision du 17 octobre 2026)', () => {
    const QUARTER = { value: 3, unit: 'month' } as const
    const WEEK = { value: 1, unit: 'week' } as const
    let c: TreatmentViewInput = {
      settings: [
        S('w1', 0, {
          startsOn: '2026-03-04',
          firstDueOn: '2026-03-18',
          gridOriginOn: '2026-03-18',
          frequency: WEEK,
          times: ['20:00'],
        }),
      ],
      lines: [],
      today: '2026-03-17',
    }
    c = moved(c, '2026-03-18', '20:00', '2026-03-22', false)
    c = edited(on(c, '2026-03-20'), { frequency: QUARTER, times: ['20:00'], endsOn: '2026-05-06' })
    expect(c.lines.some(({ status }) => status === 'given' || status === 'missed')).toBe(false)
    const request = { frequency: QUARTER, times: ['12:00', '18:00', '23:00'], endsOn: '2026-05-06' }
    const asked = newSettings(on(c, '2026-03-23'), request)
    expect(asked).toMatchObject({
      question: { correct: { refusal: { reason: 'no-dose-before-end' } } },
    })
    expect('question' in asked && 'refusal' in asked.question.keep).toBe(false)
  })

  it('deux téléphones : un report plus récent que la réponse tient, son arrivée reste', () => {
    const after = edited(graine726(), SANS_HEURE, 'correct')
    const answeredAt = '2026-03-23T09:00:00.000Z'
    const settings = after.settings.map((each) =>
      each.id === 's3' ? { ...each, updatedAt: answeredAt } : each,
    )
    const fresh = after.lines.map((line) =>
      line.id === 'l10' ? { ...line, updatedAt: '2026-03-23T18:00:00.000Z' } : line,
    )
    expect(effectOf({ ...after, settings }, 'l10')).toEqual({
      kind: 'idle',
      reason: 'nothing-to-move',
    })
    const merged = { ...after, settings, lines: fresh }
    expect(effectOf(merged, 'l10')).toMatchObject({ kind: 'moves', arrival: '2026-03-18' })
    expect(readings(merged).moteur.aRenseigner).toContain('2026-03-18 14:00')
  })
})
