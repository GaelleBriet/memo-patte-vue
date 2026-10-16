// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { applied, newSettings, play, preview, type SettingsRequest } from '../domain/dose-calendar'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { keys, line, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' as const }

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

describe('#787, TR-8, Q20 : un rythme qui ne laisse plus aucune dose avant la date de fin (décision du 2026-10-12)', () => {
  const everyTwo = setting('p1', '2026-10-01', TWO_DAYS, [], { endsOn: '2026-10-10' })
  const input = {
    settings: [everyTwo],
    lines: [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-03')],
    today: '2026-10-04',
  }
  const monthly = (endsOn: string): SettingsRequest => ({
    frequency: { value: 1, unit: 'month' },
    times: [],
    endsOn,
  })

  it('tous les 2 jours du 1er oct., fin le 10, doses des 1er et 3 données ; le 4, mensuel : refusé à l’enregistrement', () => {
    expect(newSettings(input, monthly('2026-10-10'))).toEqual({
      refusal: { reason: 'no-dose-before-end' },
    })
    expect(newSettings(input, { ...monthly('2026-10-10'), firstDueOn: '2026-11-03' })).toEqual({
      refusal: { reason: 'no-dose-before-end' },
    })
  })

  it('même carnet, date de fin repoussée au 10 nov. : le 3 nov. est proposé', () => {
    expect(planOf(input, monthly('2026-11-10')).setting.firstDueOn).toBe('2026-11-03')
  })

  it.each([
    ['hebdomadaire', WEEK],
    ['mensuel', { value: 1, unit: 'month' as const }],
  ])(
    'même carnet, dose du 5 donnée en avance le 4 ; le 4, %s : refusé, les doses du 7 et du 9 ne disparaissent pas sans un mot',
    (_, frequency) => {
      const ahead = { ...line('p1', 'given', '2026-10-05'), givenOn: '2026-10-04' }
      const carnet = { ...input, lines: [...input.lines, ahead] }
      expect(newSettings(carnet, { frequency, times: [], endsOn: '2026-10-10' })).toEqual({
        refusal: { reason: 'no-dose-before-end' },
      })
    },
  )
})

describe('#787 : le critère est la première dose encore à donner, après la date de fin ou non (décision du 2026-10-12)', () => {
  const daily = { value: 1, unit: 'day' as const }

  it('tous les 2 jours du 2 oct., fin le 4, dose du 2 donnée ; le 4, jour d’échéance, tous les jours : accepté, première dose le 4', () => {
    const own = setting('p1', '2026-10-02', TWO_DAYS, [], { endsOn: '2026-10-04' })
    const carnet = {
      settings: [own],
      lines: [line('p1', 'given', '2026-10-02')],
      today: '2026-10-04',
    }
    expect(
      planOf(carnet, { frequency: daily, times: [], endsOn: '2026-10-04' }).setting.firstDueOn,
    ).toBe('2026-10-04')
  })

  it('tous les 2 jours du 1er oct., fin le 4, doses du 1er et du 3 données ; le 4, mensuel : aucune dose le 4, refusé', () => {
    const own = setting('p1', '2026-10-01', TWO_DAYS, [], { endsOn: '2026-10-04' })
    const carnet = {
      settings: [own],
      lines: [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-03')],
      today: '2026-10-04',
    }
    expect(
      newSettings(carnet, {
        frequency: { value: 1, unit: 'month' },
        times: [],
        endsOn: '2026-10-04',
      }),
    ).toEqual({ refusal: { reason: 'no-dose-before-end' } })
  })

  it('graine 850001702 : tous les 3 jours, réglage du 22 mars, première dose le 4 avr., fin le 4 ; le 26, dose du 4 avancée au 31 mars avec décalage, puis posologie seule : le réglage garde ses dates, accepté', () => {
    const s1 = setting('s1', '2026-03-20', THREE_DAYS)
    const s2 = setting('s2', '2026-04-04', THREE_DAYS, [], {
      startsOn: '2026-03-22',
      endsOn: '2026-04-04',
    })
    const carnet = {
      settings: [s1, s2],
      lines: [
        line('s1', 'missed', '2026-03-20'),
        line('s1', 'postponed', '2026-03-23', null, '2026-04-04'),
        line('s2', 'shift', '2026-03-23', null, '2026-04-04'),
      ],
      today: '2026-03-26',
    }
    const moved = play(carnet, {
      kind: 'move',
      due: { settingId: 's2', dueOn: '2026-04-04', dueTime: null },
      to: '2026-03-31',
      shiftsFollowing: true,
    })
    if ('refusal' in moved) throw new Error(JSON.stringify(moved))
    const after = applied(carnet, moved.changes)
    expect(
      newSettings(after, { frequency: THREE_DAYS, times: [], endsOn: '2026-04-04' }),
    ).not.toHaveProperty('refusal')
  })

  it.each([
    ['2026-10-15', { refusal: { reason: 'no-dose-before-end' } }],
    ['2026-10-25', { plan: expect.objectContaining({ action: 'rewrite' }) }],
  ])(
    'Milo, chaque lundi à 8 h, dose du 12 donnée le 7 ; réglage à 10 h du 7 sans prise, première dose le 19 sur la grille du 12 ; le 9, « Prochaine dose » le 12 et fin le %s : même origine, première dose changée, le critère s’applique',
    (endsOn, expected) => {
      const m1 = setting('m1', '2026-10-05', WEEK, ['08:00'])
      const m2 = setting('m2', '2026-10-19', WEEK, ['10:00'], {
        startsOn: '2026-10-07',
        gridOriginOn: '2026-10-12',
      })
      const carnet = {
        settings: [m1, m2],
        lines: [
          line('m1', 'given', '2026-10-05', '08:00'),
          { ...line('m1', 'given', '2026-10-12', '08:00'), givenOn: '2026-10-07' },
        ],
        today: '2026-10-09',
      }
      const asked = { frequency: WEEK, times: ['10:00'], endsOn, firstDueOn: '2026-10-12' }
      expect(newSettings(carnet, asked)).toEqual(expected)
    },
  )

  it('même carnet, date de fin passée (le 3) : accepté, comme avant', () => {
    const own = setting('p1', '2026-10-01', TWO_DAYS, [], { endsOn: '2026-10-04' })
    const carnet = {
      settings: [own],
      lines: [line('p1', 'given', '2026-10-01'), line('p1', 'given', '2026-10-03')],
      today: '2026-10-04',
    }
    expect(
      'plan' in
        newSettings(carnet, {
          frequency: { value: 1, unit: 'month' },
          times: [],
          endsOn: '2026-10-03',
        }),
    ).toBe(true)
  })
})

describe('#806, Q38, R12 : « Elles n’étaient pas à donner » refusé quand il ne laisse plus aucune dose avant la date de fin (décision du 2026-10-13)', () => {
  const daily = { value: 1, unit: 'day' as const }
  const threeTimes = ['08:00', '14:00', '20:00']
  const s1 = setting('s1', '2026-03-14', daily, threeTimes, { endsOn: '2026-04-06' })
  const s2 = setting('s2', '2026-03-17', daily, ['06:00', '12:00', '18:00', '23:00'], {
    endsOn: '2026-04-06',
    gridOriginOn: null,
  })
  const carnet = {
    settings: [s1, s2],
    lines: [
      line('s1', 'postponed', '2026-03-17', '14:00', '2026-04-05'),
      line('s1', 'shift', '2026-03-17', '14:00', '2026-04-05'),
      line('s1', 'given', '2026-03-16', '08:00'),
    ],
    today: '2026-03-18',
  }
  const asked: SettingsRequest = { frequency: daily, times: threeTimes, endsOn: '2026-03-25' }

  it('d’après la graine 975000503 : chaque jour à 8, 14 et 20 h, fin le 6 avr. ; le 17 mars, 14 h reportée au 5 avr. avec décalage, puis 6, 12, 18 et 23 h ; le 18, retour à 8, 14 et 20 h, fin le 25 mars : « pas à donner » refusé, « à renseigner » reste possible', () => {
    const result = newSettings(carnet, asked)
    if (!('question' in result)) throw new Error(JSON.stringify(result))
    expect(result.question.correct).toEqual({ refusal: { reason: 'no-dose-before-end' } })
    expect(result.question.keep).toMatchObject({ action: 'create' })
    expect(keys(result.question.fallen)).toEqual(['2026-03-17 06:00'])
    expect(keys(preview(carnet, result.question.keep).currentDoses)).toEqual(['2026-03-17 06:00'])
  })

  it('même carnet, la date proposée passée telle quelle : même réponse', () => {
    const result = newSettings(carnet, asked)
    if (!('question' in result)) throw new Error(JSON.stringify(result))
    const date = result.shownOn ?? result.question.keep.setting.firstDueOn
    expect(newSettings(carnet, { ...asked, firstDueOn: date })).toEqual(result)
  })

  describe('#817, même carnet, fin laissée au 6 avr., « Prochaine dose » le 19 : « Elles restent à renseigner » (décision du 2026-10-13)', () => {
    const chosen = { ...asked, endsOn: '2026-04-06', firstDueOn: '2026-03-19' }
    const keepOf = (input: TreatmentViewInput, request: SettingsRequest) => {
      const result = newSettings(input, request)
      if (!('question' in result)) throw new Error(JSON.stringify(result))
      return result.question.keep
    }

    it('la nouvelle grille part du 19, le report du 5 avr. et son décalage restent tels quels', () => {
      const keep = keepOf(carnet, chosen)
      expect(keep).toMatchObject({ action: 'create', setting: { firstDueOn: '2026-03-19' } })
      expect(keep.lines).toBeUndefined()
      const read = preview(carnet, keep)
      expect(keys(read.upcoming({ limit: 1 }))).toEqual(['2026-03-19 08:00'])
      const byId = (lines: readonly { id: string }[]) =>
        [...lines].sort((a, b) => a.id.localeCompare(b.id))
      expect(byId(read.history.map(({ line }) => line))).toEqual(byId(carnet.lines))
    })

    it('la dose de 6 h du 17 reste en retard (#817)', () => {
      const read = preview(carnet, keepOf(carnet, chosen))
      expect([read.phase, keys(read.currentDoses)]).toEqual(['overdue', ['2026-03-17 06:00']])
    })

    it('tous les 2 jours à 8 h dès le 1er, rien de noté ; le 6, 9 h et « Prochaine dose » le 8, hors de la grille : la dose du 5 reste en retard, puis 8, 10 (#817)', () => {
      const everyTwo = setting('t1', '2026-10-01', TWO_DAYS, ['08:00'])
      const input = { settings: [everyTwo], lines: [], today: '2026-10-06' }
      const request = {
        frequency: TWO_DAYS,
        times: ['09:00'],
        endsOn: null,
        firstDueOn: '2026-10-08',
      }
      const read = preview(input, keepOf(input, request))
      expect([read.phase, keys(read.currentDoses)]).toEqual(['overdue', ['2026-10-05 08:00']])
      expect(keys(read.upcoming({ limit: 2 }))).toEqual(['2026-10-08 09:00', '2026-10-10 09:00'])
    })
  })

  it('même carnet, fin laissée au 6 avr. : les deux réponses restent possibles', () => {
    const result = newSettings(carnet, { ...asked, endsOn: '2026-04-06' })
    if (!('question' in result)) throw new Error(JSON.stringify(result))
    expect(result.question.correct).toHaveProperty('setting')
  })
})
