// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  noteDose,
  treatmentView,
  type Line,
  type LineChange,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { edited, on, readings } from './dose-calendar.reglage-corrige.aides'
import { TWO_DAYS, line, setting } from './dose-calendar.v2.aides'

const FOUR = ['06:00', '12:00', '18:00', '23:00']
const THREE_DAYS = { value: 3, unit: 'day' } as const

const givenOn = (note: Line, on: string): Line => ({ ...note, givenOn: on })

const reportEffect = (input: TreatmentViewInput, dueOn: string) =>
  treatmentView(input).history.find(
    ({ line }) => line.status === 'postponed' && line.dueOn === dueOn,
  )!.effect.kind

describe('R7, R9.2 : « Elles n’étaient pas à donner » ne saute pas l’arrivée d’un report qu’elle rendrait sans effet', () => {
  // Graine 7810000235 : tous les 2 jours à 6, 12, 18 et 23 h ; le 28 mars, la dose du 30 donnée ; le
  // 3 avril, la dose du 5 à 6 h reportée au 7 avec « Décaler aussi les doses suivantes », puis 8 h et
  // 20 h dès le 3 ; le 7, 20 h seule.
  function seed235(): TreatmentViewInput {
    const lines = [
      line('s1', 'missed', '2026-03-17', '18:00'),
      line('s2', 'postponed', '2026-03-27', '06:00', '2026-04-08'),
      givenOn(line('s2', 'given', '2026-03-27', '23:00'), '2026-03-28'),
      line('s2', 'shift', '2026-03-27', '06:00', '2026-03-28'),
      givenOn(line('s2', 'given', '2026-03-30', '06:00'), '2026-03-28'),
      line('s2', 'postponed', '2026-04-05', '06:00', '2026-04-07'),
      line('s2', 'shift', '2026-04-05', '06:00', '2026-04-07'),
    ]
    const until = { endsOn: '2026-05-08' }
    return {
      settings: [
        setting('s1', '2026-03-17', TWO_DAYS, FOUR, {
          ...until,
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
        setting('s2', '2026-03-23', TWO_DAYS, FOUR, {
          ...until,
          startsOn: '2026-03-21',
          createdAt: '2026-01-01T00:00:00.500Z',
        }),
        setting('s3', '2026-04-03', TWO_DAYS, ['08:00', '20:00'], {
          ...until,
          gridOriginOn: null,
          firstDueChosen: false,
        }),
      ],
      lines,
      today: '2026-04-07',
    }
  }

  it('graine 7810000235 : le 7 garde les doses reportées du 5, le report reste en vigueur, les doses du 1er avril restent à renseigner', () => {
    const after = edited(
      seed235(),
      { frequency: TWO_DAYS, times: ['20:00'], endsOn: '2026-05-08' },
      'correct',
    )
    const { moteur, reference } = readings(after)
    expect(moteur.phase).toBe('today')
    expect(moteur.moment).toEqual([
      '2026-04-07 06:00',
      '2026-04-07 12:00',
      '2026-04-07 18:00',
      '2026-04-07 23:00',
    ])
    expect(moteur.aRenseigner).toContain('2026-04-01 06:00')
    expect(reportEffect(after, '2026-04-05')).toBe('moves')
    expect(moteur).toEqual(reference)
  })

  // « C'est fait » sur la dose du jour telle que la fiche la montre, sous le réglage de ses heures.
  function noted(input: TreatmentViewInput, dueOn: string, dueTime: string): TreatmentViewInput {
    const due = treatmentView(input)
      .slots(dueOn, dueOn)
      .find((slot) => slot.due.dueTime === dueTime)!.due
    const result = noteDose(input, {
      due,
      status: 'given',
      givenOn: input.today,
      shiftsFollowing: false,
    })
    if ('refusal' in result) throw new Error(JSON.stringify(result))
    const created = result.changes.flatMap((change: LineChange) =>
      change.action === 'create'
        ? [{ ...change.line, id: 'l-noted', updatedAt: '2026-02-01T00:00:00.000Z' }]
        : [],
    )
    return { ...input, lines: [...input.lines, ...created] }
  }

  const eightOh = { frequency: TWO_DAYS, times: ['08:01', '20:01'], endsOn: '2026-05-08' }

  it('graine 7810000235, le lendemain de l’arrivée, 6 h du 7 donnée : la réponse retire les doses du 7 restées sans prise, la prise de 6 h garde le 7, le report devient sans effet (#873, décision du 18 octobre 2026)', () => {
    const input = on(noted(seed235(), '2026-04-07', '06:00'), '2026-04-08')
    expect(readings(input).moteur.moment).toEqual([
      '2026-04-08 06:00',
      '2026-04-08 12:00',
      '2026-04-08 18:00',
    ])
    const after = edited(input, eightOh, 'correct')
    const { moteur, reference } = readings(after)
    expect(moteur.moment).toEqual(['2026-04-08 06:00', '2026-04-08 12:00', '2026-04-08 18:00'])
    expect(moteur.aRenseigner.filter((key) => key.startsWith('2026-04-07'))).toEqual([])
    const early = treatmentView(after).history.find(
      ({ line }) => line.status === 'given' && line.dueOn === '2026-04-07',
    )!
    expect(early.effect).toEqual({ kind: 'covers', key: '2026-04-07 06:00' })
    expect(reportEffect(after, '2026-04-05')).toBe('idle')
    expect(moteur).toEqual(reference)
  })

  it('graine 7810000235, le lendemain de l’arrivée, sans prise le 7 : la réponse retire les doses du 7, le report devient sans effet (#873, décision du 18 octobre 2026)', () => {
    const after = edited(on(seed235(), '2026-04-08'), eightOh, 'correct')
    const { moteur, reference } = readings(after)
    expect(moteur.moment).toEqual(['2026-04-08 06:00', '2026-04-08 12:00', '2026-04-08 18:00'])
    expect(moteur.aRenseigner.filter((key) => key.startsWith('2026-04-07'))).toEqual([])
    expect(reportEffect(after, '2026-04-05')).toBe('idle')
    expect(moteur).toEqual(reference)
  })

  it('graine 7810000235, pas 38 : le report du 5 reste en vigueur sans repartir du 7, le rythme hebdomadaire garde le 15', () => {
    const weekly = { value: 1, unit: 'week' } as const
    const base = seed235()
    const input: TreatmentViewInput = {
      settings: [
        ...base.settings.slice(0, 2),
        setting('s3', '2026-04-08', weekly, ['08:00', '20:00'], {
          startsOn: '2026-04-03',
          endsOn: '2026-04-23',
          firstDueChosen: false,
        }),
      ],
      lines: [
        ...base.lines.filter(({ dueOn }) => dueOn !== '2026-03-30'),
        line('s2', 'missed', '2026-04-07', '23:00'),
      ],
      today: '2026-04-08',
    }
    const request = { frequency: weekly, times: ['06:00', '08:00', '20:00'], endsOn: '2026-04-23' }
    const after = edited(input, request, 'correct')
    const { moteur, reference } = readings(after)
    expect(moteur.ensuite).toEqual(['2026-04-08 06:00', '2026-04-08 12:00', '2026-04-08 18:00'])
    expect(
      treatmentView(after)
        .upcoming({ limit: 6 })
        .map(({ dueOn }) => dueOn),
    ).toContain('2026-04-15')
    expect(reportEffect(after, '2026-04-05')).toBe('moves')
    expect(moteur).toEqual(reference)
  })

  // Graine 7810000909 : tous les 3 jours à 20 h dès le 29 mars, puis 6, 12, 18 et 23 h dès le 29 ; la
  // dose du 1er avril à 20 h reportée au 11 avec « Décaler aussi les doses suivantes » ; le 3, 9 h
  // ajoutée aux heures.
  function seed909(): TreatmentViewInput {
    const lines = [
      givenOn(line('s1', 'extra', '2026-03-23'), '2026-03-23'),
      givenOn(line('s1', 'extra', '2026-03-22'), '2026-03-22'),
      line('s1', 'missed', '2026-03-23'),
      line('s3', 'postponed', '2026-04-01', '20:00', '2026-04-11'),
      line('s3', 'shift', '2026-04-01', '20:00', '2026-04-11'),
      givenOn(line('s2', 'given', '2026-03-26', '20:00'), '2026-03-24'),
      line('s3', 'extra', '2026-04-02', '20:00'),
    ]
    const settings = [
      setting('s1', '2026-03-23', { value: 3, unit: 'month' }, [], {
        stoppedOn: '2026-03-23',
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
      setting('s2', '2026-03-26', THREE_DAYS, ['08:00', '14:00', '20:00'], {
        startsOn: '2026-03-25',
        createdAt: '2026-01-01T00:00:00.100Z',
      }),
      setting('s3', '2026-03-29', THREE_DAYS, ['20:00'], {
        startsOn: '2026-03-28',
        createdAt: '2026-01-01T00:00:00.200Z',
      }),
      setting('s4', '2026-03-29', THREE_DAYS, FOUR, {
        endsOn: '2026-04-20',
        gridOriginOn: null,
        firstDueChosen: false,
      }),
    ]
    return { settings, lines, today: '2026-04-03' }
  }

  it('graine 7810000909 : la dose du 11 reste, le report reste en vigueur, puis le 14 aux nouvelles heures', () => {
    const times = ['06:00', '09:00', '12:00', '18:00', '23:00']
    const after = edited(
      seed909(),
      { frequency: THREE_DAYS, times, endsOn: '2026-04-20' },
      'correct',
    )
    const { moteur, reference } = readings(after)
    expect(moteur.moment).toEqual(['2026-04-11 20:00'])
    expect(moteur.ensuite).toEqual(['2026-04-11 20:00', '2026-04-14 06:00', '2026-04-14 09:00'])
    expect(reportEffect(after, '2026-04-01')).toBe('moves')
    expect(moteur).toEqual(reference)
  })
})
