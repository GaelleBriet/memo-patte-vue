// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, preview, treatmentView, type SettingsRequest } from '../domain/dose-calendar'
import type {
  Frequency,
  Line,
  SettingsPlan,
  TreatmentViewInput,
} from '../domain/dose-calendar/types'
import { DAY, H, keys, line, MONTH, setting, TWO_DAYS, WEEK } from './dose-calendar.v2.aides'

const THREE_HOURS = ['08:00', '14:00', '20:00']

function planOf(input: TreatmentViewInput, asked: SettingsRequest) {
  const result = newSettings(input, asked)
  if (!('plan' in result)) throw new Error(`pas de plan : ${JSON.stringify(result)}`)
  return result.plan
}

const given = (settingId: string, dueOn: string, dueTime: string, givenOn: string): Line => ({
  ...line(settingId, 'given', dueOn, dueTime),
  givenOn,
})

const effectsOf = (input: TreatmentViewInput, lines: Line[]) => {
  const { history } = treatmentView(input)
  return lines.map((each) => history.find(({ line: read }) => read.id === each.id)!.effect)
}

describe('R4 : une journée qui porte des lignes et quitte le calendrier garde sa lecture', () => {
  describe('toutes les 2 semaines à 8 h, 14 h et 20 h dès le 13 mars, puis mensuel à 8 h et 20 h ouvert le 11 ; le 13 est complet', () => {
    const fortnight: Frequency = { value: 2, unit: 'week' }
    const first = setting('s1', '2026-03-13', fortnight, THREE_HOURS, { endsOn: '2026-04-03' })
    const monthly = setting('s2', '2026-03-13', MONTH, H, {
      startsOn: '2026-03-11',
      endsOn: '2026-04-03',
    })
    const old20 = given('s1', '2026-03-13', '20:00', '2026-03-08')
    const report = line('s1', 'postponed', '2026-03-13', '08:00', '2026-03-31')
    const new20 = given('s2', '2026-03-13', '20:00', '2026-03-10')
    const input = {
      settings: [first, monthly],
      lines: [old20, report, new20],
      today: '2026-03-11',
    }

    it('avant : le 13 se lit avec sa ligne la plus récente (8 h et 20 h), les deux prises de 20 h sont une dose, le report emporte 8 h au 31 (décision du 15 octobre 2026)', () => {
      expect(effectsOf(input, [old20, report, new20])).toEqual([
        { kind: 'idle', reason: 'superseded' },
        { kind: 'moves', keys: ['2026-03-13 08:00'], arrival: '2026-03-31' },
        { kind: 'covers', key: '2026-03-13 20:00' },
      ])
    })

    it('Q26 : « Prochaine dose » le 11 est refusée, les prises du 13 sont plus lointaines (décision du 2026-10-13)', () => {
      const asked = { frequency: MONTH, times: H, endsOn: '2026-04-03', firstDueOn: '2026-03-11' }
      expect(newSettings(input, asked)).toEqual({ refusal: { reason: 'later-dose' } })
    })

    it('le même réglage reçu d’un autre appareil, première dose le 11 : le 13 sort du calendrier et garde sa lecture, 8 h arrive le 31 (décision du 15 octobre 2026)', () => {
      const plan: SettingsPlan = {
        action: 'create',
        setting: {
          startsOn: '2026-03-11',
          firstDueOn: '2026-03-11',
          gridOriginOn: '2026-03-11',
          firstDueChosen: true,
          pastDosesStayUnlogged: false,
          endsOn: '2026-04-03',
          frequency: MONTH,
          times: H,
        },
      }
      const view = preview(input, plan)
      expect(keys(view.slots('2026-03-12', '2026-04-30').map(({ due }) => due))).toEqual([
        '2026-03-31 08:00',
      ])
      expect(view.history.find(({ line: read }) => read.id === report.id)!.effect).toMatchObject({
        kind: 'moves',
      })
    })
  })

  describe('tous les 2 jours à 8 h et 20 h dès le 3 avr. ; le 5, 20 h donnée, puis heures à 8 h, 14 h et 20 h ; 14 h donnée, 20 h oubliée', () => {
    const twice = setting('s1', '2026-04-03', TWO_DAYS, H)
    const thrice = setting('s2', '2026-04-05', TWO_DAYS, THREE_HOURS, { gridOriginOn: null })
    const done = [
      line('s1', 'given', '2026-04-03', '08:00'),
      line('s1', 'given', '2026-04-03', '20:00'),
    ]
    const old20 = line('s1', 'given', '2026-04-05', '20:00')
    const new14 = line('s2', 'given', '2026-04-05', '14:00')
    const missed20 = line('s2', 'missed', '2026-04-05', '20:00')
    const input = {
      settings: [twice, thrice],
      lines: [...done, old20, new14, missed20],
      today: '2026-04-05',
    }
    const expected = [
      { kind: 'covers', key: '2026-04-05 08:00' },
      { kind: 'covers', key: '2026-04-05 14:00' },
      { kind: 'covers', key: '2026-04-05 20:00' },
    ]

    it('avant : la prise de 20 h de l’ancien réglage couvre 8 h', () => {
      expect(effectsOf(input, [old20, new14, missed20])).toEqual(expected)
    })

    it('tous les 3 jours, première échéance le 8 : le 5 sort du calendrier, chaque prise garde son heure', () => {
      const plan = planOf(input, {
        frequency: { value: 3, unit: 'day' },
        times: THREE_HOURS,
        endsOn: null,
      })
      expect(plan.setting.firstDueOn).toBe('2026-04-08')
      const view = preview(input, plan)
      const effects = [old20, new14, missed20].map(
        (each) => view.history.find(({ line: read }) => read.id === each.id)!.effect,
      )
      expect(effects).toEqual(expected)
    })
  })
})

describe('R3, R4 : une journée sortie du calendrier n’est pas reprise par la posologie', () => {
  it('tous les 3 jours à 6, 12, 18 et 23 h dès le 30 mars, 6, 12 et 18 h données en avance, remplacé le 29 par le même rythme dès le 2 avr. (6 h du 2 donnée) ; posologie le 30 : les prises du 30 restent sans effet', () => {
    const hours = ['06:00', '12:00', '18:00', '23:00']
    const everyThree: Frequency = { value: 3, unit: 'day' }
    const first = setting('s1', '2026-03-30', everyThree, hours)
    const replacing = setting('s2', '2026-04-02', everyThree, hours, { startsOn: '2026-03-29' })
    const notes = ['06:00', '12:00', '18:00'].map((hour) =>
      given('s1', '2026-03-30', hour, '2026-03-27'),
    )
    const ahead = given('s2', '2026-04-02', '06:00', '2026-03-29')
    const input = { settings: [first, replacing], lines: [...notes, ahead], today: '2026-03-30' }
    const idle = notes.map(() => ({ kind: 'idle', reason: 'nothing-to-cover' }))
    expect(effectsOf(input, notes)).toEqual(idle)
    const plan = planOf(input, { frequency: everyThree, times: hours, endsOn: null })
    const view = preview(input, plan)
    expect(
      notes.map((each) => view.history.find(({ line: read }) => read.id === each.id)!.effect),
    ).toEqual(idle)
  })
})

describe('R1, R4 : seul le réglage qui cède la place lit sa journée de fin', () => {
  it('tous les 2 jours dès le 1er avr., dose du 9 donnée en avance ; le 5, tous les 3 jours dès le 12 (12 donné) ; posologie le 9 : la prise du 9 reste sans effet', () => {
    const everyTwo = setting('s1', '2026-04-01', TWO_DAYS)
    const everyThree = setting('s2', '2026-04-12', { value: 3, unit: 'day' }, [], {
      startsOn: '2026-04-05',
    })
    const ninth = { ...line('s1', 'given', '2026-04-09'), givenOn: '2026-04-04' }
    const twelfth = { ...line('s2', 'given', '2026-04-12'), givenOn: '2026-04-06' }
    const input = { settings: [everyTwo, everyThree], lines: [ninth, twelfth], today: '2026-04-09' }
    const idle = [{ kind: 'idle', reason: 'nothing-to-cover' }]
    expect(effectsOf(input, [ninth])).toEqual(idle)
    const plan = planOf(input, { frequency: { value: 3, unit: 'day' }, times: [], endsOn: null })
    expect(plan.action).toBe('create')
    const view = preview(input, plan)
    expect(
      view.history.filter(({ line: read }) => read.id === ninth.id).map(({ effect }) => effect),
    ).toEqual(idle)
  })
})

describe('R7 : un réglage qui a eu des jours ne reprend pas une journée de son successeur', () => {
  it('chaque jour dès le 21 mars, puis toutes les 2 semaines à 20 h dès le 24 ; dose du 11 avr., sortie du calendrier, reportée au 9 : le 9 à 20 h reste à donner', () => {
    const daily = setting('s1', '2026-03-21', { value: 1, unit: 'day' })
    const fortnight = setting('s2', '2026-03-24', { value: 2, unit: 'week' }, ['20:00'])
    const report = line('s2', 'postponed', '2026-04-11', '20:00', '2026-04-09')
    const view = treatmentView({
      settings: [daily, fortnight],
      lines: [report],
      today: '2026-03-28',
    })
    expect(keys(view.upcoming({ limit: 3 }))).toContain('2026-04-09 20:00')
  })
})

describe('R7 : un réglage remplacé le jour où il commence ne lit que ses propres reports', () => {
  const everyThree: Frequency = { value: 3, unit: 'day' }
  const reportEffect = (input: TreatmentViewInput, asked: SettingsRequest, report: Line) => {
    const view = preview(input, planOf(input, asked))
    const effect = view.history.find(({ line: read }) => read.id === report.id)!.effect
    return { effect, upcoming: keys(view.upcoming({ limit: 3 })) }
  }

  it('chaque semaine à 8 h dès le 3 oct. (8 h donnée), le 3 tous les 2 jours à 9 h ; dose du 17 reportée au 18 ; le 16, tous les 3 jours dès le 20 : le 18 garde sa dose de 9 h', () => {
    const weekly = setting('s1', '2026-10-03', WEEK, ['08:00'])
    const everyTwo = setting('s2', '2026-10-05', TWO_DAYS, ['09:00'], { startsOn: '2026-10-03' })
    const report = line('s2', 'postponed', '2026-10-17', '09:00', '2026-10-18')
    const input = {
      settings: [weekly, everyTwo],
      lines: [line('s1', 'given', '2026-10-03', '08:00'), report],
      today: '2026-10-16',
    }
    const asked = {
      frequency: everyThree,
      times: ['09:00'],
      endsOn: null,
      firstDueOn: '2026-10-20',
    }
    expect(reportEffect(input, asked, report)).toEqual({
      effect: { kind: 'moves', keys: ['2026-10-17 09:00'], arrival: '2026-10-18' },
      upcoming: ['2026-10-18 09:00', '2026-10-20 09:00', '2026-10-23 09:00'],
    })
  })

  it('chaque jour à 8, 20 et 22 h dès le 3 oct. (8 h donnée), le 3 tous les 2 jours à 9 h ; dose du 17 reportée au 18 ; le 16, tous les 3 jours à 8, 20 et 22 h dès le 20 : le 18 ne reçoit qu’une dose, à 9 h (décision du 15 octobre 2026)', () => {
    const hours = ['08:00', '20:00', '22:00']
    const daily = setting('s1', '2026-10-03', DAY, hours)
    const everyTwo = setting('s2', '2026-10-03', TWO_DAYS, ['09:00'])
    const report = line('s2', 'postponed', '2026-10-17', '09:00', '2026-10-18')
    const input = {
      settings: [daily, everyTwo],
      lines: [line('s1', 'given', '2026-10-03', '08:00'), report],
      today: '2026-10-16',
    }
    const asked = { frequency: everyThree, times: hours, endsOn: null, firstDueOn: '2026-10-20' }
    expect(reportEffect(input, asked, report)).toEqual({
      effect: { kind: 'moves', keys: ['2026-10-17 09:00'], arrival: '2026-10-18' },
      upcoming: ['2026-10-18 09:00', '2026-10-20 08:00', '2026-10-20 20:00'],
    })
  })
})

describe('R3, R4 : la prise du jour où le réglage cède la place couvre son échéance', () => {
  it('chaque jeudi à 8 h et 20 h dès le 1er oct., 8 h du 8 donnée ; le 8, heures à 9 h et 21 h dès le 15 : la prise couvre le 8 à 8 h', () => {
    const weekly = setting('s1', '2026-10-01', WEEK, H)
    const eighth = line('s1', 'given', '2026-10-08', '08:00')
    const done = [
      line('s1', 'given', '2026-10-01', '08:00'),
      line('s1', 'given', '2026-10-01', '20:00'),
    ]
    const input = { settings: [weekly], lines: [...done, eighth], today: '2026-10-08' }
    const covers = [{ kind: 'covers', key: '2026-10-08 08:00' }]
    for (const frequency of [WEEK, { value: 2, unit: 'week' } as Frequency]) {
      const asked = { frequency, times: ['09:00', '21:00'], endsOn: null, firstDueOn: '2026-10-15' }
      const view = preview(input, planOf(input, asked))
      expect(
        view.history.filter(({ line: read }) => read.id === eighth.id).map(({ effect }) => effect),
      ).toEqual(covers)
    }
  })
})
