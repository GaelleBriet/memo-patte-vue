// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveBounds,
  moveDose,
  removeLine,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { edited, moved, on, recorded } from './dose-calendar.reglage-corrige.aides'
import { DAY, H, keys, setting, WEEK } from './dose-calendar.v2.aides'

// #1283 : Milo, tous les jours à 8 h et 20 h dès le 11 avril ; le 9, la dose de 8 h du 11 reportée
// au 15 avec la case ; le 11, « Modifier » : « Prochaine dose » le 13. Le 13 porte la dose reportée.
function milo(times: string[] = H, firstDueOn = '2026-04-13'): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [setting('p1', '2026-04-11', DAY, times)],
    lines: [],
    today: '2026-04-09',
  }
  const first = times[0] ?? null
  const reported = on(moved(start, '2026-04-11', first, '2026-04-15'), '2026-04-11')
  return edited(reported, { frequency: DAY, times, endsOn: null, firstDueOn })
}

function movedAlone(
  input: TreatmentViewInput,
  dueOn: string,
  dueTime: string | null,
  to: string,
  shiftsFollowing = false,
): TreatmentViewInput {
  const settingId = treatmentView(input).currentSetting!.id
  const result = moveDose(input, { due: { settingId, dueOn, dueTime }, to, shiftsFollowing })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return recorded(input, result.changes)
}

const advancedTo11 = (dueTime: string, shiftsFollowing: boolean) =>
  movedAlone(milo(), '2026-04-13', dueTime, '2026-04-11', shiftsFollowing)

const throughThe12 = (times: string[], dueTime: string | null) =>
  movedAlone(
    movedAlone(milo(times), '2026-04-13', dueTime, '2026-04-12'),
    '2026-04-12',
    dueTime,
    '2026-04-11',
  )

const calendars = (input: TreatmentViewInput) => ({
  moteur: keys(
    treatmentView(input)
      .slots('2026-04-09', '2026-04-14')
      .map(({ due }) => due),
  ),
  reference: referenceReading({ ...input, until: '2026-04-14' })
    .upcoming.filter((key) => key >= '2026-04-09')
    .slice(0, 8),
})

describe('La première dose d’une date choisie avancée au jour d’origine de son report (G13, Q50, #1283)', () => {
  it('avant le geste : rien avant le 13', () => {
    expect(calendars(milo()).moteur).toEqual([
      '2026-04-13 08:00',
      '2026-04-13 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ])
  })

  it('8 h du 13 avancée au 11 sans la case : le 11 à 8 h et 20 h, le 13 ne garde rien', () => {
    const expected = [
      '2026-04-11 08:00',
      '2026-04-11 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('08:00', false))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })

  it('20 h du 13 avancée au 11 sans la case : le 11 à 20 h, le 13 garde 8 h', () => {
    const expected = [
      '2026-04-11 20:00',
      '2026-04-13 08:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('20:00', false))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })

  it.each([
    [H, '08:00', ['2026-04-11 08:00', '2026-04-11 20:00', '2026-04-14 08:00', '2026-04-14 20:00']],
    [H, '20:00', ['2026-04-11 20:00', '2026-04-13 08:00', '2026-04-14 08:00', '2026-04-14 20:00']],
    [[], null, ['2026-04-11', '2026-04-14']],
    [['08:00'], '08:00', ['2026-04-11 08:00', '2026-04-14 08:00']],
  ])(
    'heures %j, %s du 13 au 12 puis du 12 au 11, sans la case : la dose arrive le 11',
    (times, dueTime, expected) => {
      const { moteur, reference } = calendars(throughThe12(times, dueTime))

      expect({
        moteur: moteur.slice(0, expected.length),
        reference: reference.slice(0, expected.length),
      }).toEqual({
        moteur: expected,
        reference: expected,
      })
    },
  )

  // Trou connu #1303 : avec la case, le report et son décalage sont supprimés et rien n'arrive le 11.
  it.fails('8 h du 13 avancée au 11 avec la case : la série repart du 11', () => {
    const expected = [
      '2026-04-11 08:00',
      '2026-04-11 20:00',
      '2026-04-12 08:00',
      '2026-04-12 20:00',
      '2026-04-13 08:00',
      '2026-04-13 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('08:00', true))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })
})

// Q59 : après le geste, la dose arrivée le 11 garde le 13 comme jour d'origine (G6, Q55).
const CASES: [string[], string | null, string[]][] = [
  [H, '08:00', ['2026-04-13 08:00', '2026-04-13 20:00', '2026-04-14 08:00']],
  [H, '20:00', ['2026-04-13 08:00', '2026-04-13 20:00', '2026-04-14 08:00']],
  [[], null, ['2026-04-13', '2026-04-14']],
  [['08:00'], '08:00', ['2026-04-13 08:00', '2026-04-14 08:00']],
]

function arrivedOn11(times: string[], dueTime: string | null) {
  const input = movedAlone(milo(times), '2026-04-13', dueTime, '2026-04-11')
  const settingId = treatmentView(input).currentSetting!.id
  return { input, due: { settingId, dueOn: '2026-04-11', dueTime } }
}

describe('La dose arrivée le 11 se redéplace depuis le 13, son jour d’origine (G6, G13, Q59, #1283)', () => {
  it.each(CASES)(
    'heures %j, %s : sans la case, seul le retour au 13 est permis',
    (times, dueTime) => {
      const { input, due } = arrivedOn11(times, dueTime)

      expect(moveBounds(input, due, false)).toEqual({
        earliest: '2026-04-13',
        latest: '2026-04-13',
        excluded: [],
      })
      expect(moveDose(input, { due, to: '2026-04-12', shiftsFollowing: false })).toEqual({
        refusal: { reason: 'out-of-bounds', earliest: '2026-04-13', latest: '2026-04-13' },
      })
    },
  )

  it.each(CASES)(
    'heures %j, %s : le retour au 13 sans la case annule le geste',
    (times, dueTime, expected) => {
      const { input, due } = arrivedOn11(times, dueTime)
      const back = movedAlone(input, due.dueOn, due.dueTime, '2026-04-13')

      expect(calendars(back).moteur.slice(0, expected.length)).toEqual(expected)
      expect(back.lines.filter(({ status }) => status !== 'shift')).toEqual([])
    },
  )

  it.each(CASES)('heures %j, %s : avec la case, le 13 et après, jamais le 12', (times, dueTime) => {
    const { input, due } = arrivedOn11(times, dueTime)

    expect(moveBounds(input, due, true)).toEqual({
      earliest: '2026-04-13',
      latest: null,
      excluded: [],
    })
  })

  it.each(CASES)(
    'heures %j, %s : « Supprimer » le report remet le 13',
    (times, dueTime, expected) => {
      const { input } = arrivedOn11(times, dueTime)
      const report = input.lines.find(({ status }) => status === 'postponed')!
      const result = removeLine(input, report.id)
      if ('refusal' in result) throw new Error(JSON.stringify(result))

      expect(calendars(recorded(input, result.changes)).moteur.slice(0, expected.length)).toEqual(
        expected,
      )
    },
  )
})

describe('Le 12 porte 8 h et 20 h reportées : 20 h seule ramenée au 11 est refusée (Q51, Q59)', () => {
  it('le report apporte 8 h, plus tôt que l’heure touchée : « Supprime d’abord le report du 11 »', () => {
    const input = movedAlone(milo(), '2026-04-13', '08:00', '2026-04-12')
    const settingId = treatmentView(input).currentSetting!.id
    const due = { settingId, dueOn: '2026-04-12', dueTime: '20:00' }

    expect(moveDose(input, { due, to: '2026-04-11', shiftsFollowing: false })).toEqual({
      refusal: { reason: 'arrival-shared', on: '2026-04-11' },
    })
  })
})

describe('Un report plus ancien que la date choisie, ramené à son jour d’origine, ne prend pas sa dose (Q59)', () => {
  // Graine 733002387 : tous les 2 jours dès le 29 mars ; le 2 avril, la dose du 4 avancée au 3, puis
  // « Modifier » : chaque mois, « Prochaine dose » le 8 ; la dose du 3 ramenée au 4.
  it('le 8 garde sa dose', () => {
    const start: TreatmentViewInput = {
      settings: [setting('p1', '2026-03-29', { value: 2, unit: 'day' })],
      lines: [],
      today: '2026-04-02',
    }
    const monthly = { value: 1, unit: 'month' } as const
    const input = edited(movedAlone(start, '2026-04-04', null, '2026-04-03'), {
      frequency: monthly,
      times: [],
      endsOn: null,
      firstDueOn: '2026-04-08',
    })
    const settingId = treatmentView(input).currentSetting!.id
    const due = { settingId, dueOn: '2026-04-03', dueTime: null }
    const result = moveDose(input, { due, to: '2026-04-04', shiftsFollowing: false })
    if ('refusal' in result) throw new Error(JSON.stringify(result))

    const after = recorded(input, result.changes)
    const days = (read: TreatmentViewInput) =>
      keys(
        treatmentView(read)
          .slots('2026-04-02', '2026-04-08')
          .map((slot) => slot.due),
      )

    expect(days(input)).toEqual(['2026-04-03', '2026-04-08'])
    expect(days(after)).toContain('2026-04-08')
  })
})

// Q60 : Luna, chaque semaine à 20 h dès le 7 mars ; le 5, la dose du 7 reportée au 25 avec la case,
// puis « Modifier » : tous les 3 mois, « Prochaine dose » le 8 ; le 7, « Prochaine dose » sur le 25.
function luna(): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [setting('p1', '2026-03-07', WEEK, ['20:00'])],
    lines: [],
    today: '2026-03-05',
  }
  const reported = moved(start, '2026-03-07', '20:00', '2026-03-25')
  const quarterly = { value: 3, unit: 'month' } as const
  return on(
    edited(reported, {
      frequency: quarterly,
      times: ['20:00'],
      endsOn: null,
      firstDueOn: '2026-03-08',
    }),
    '2026-03-07',
  )
}

const lunaDays = (input: TreatmentViewInput) =>
  keys(
    treatmentView(input)
      .slots('2026-03-01', '2026-06-30')
      .map(({ due }) => due),
  )

describe('Le retour au jour d’origine, seule date, n’est permis que s’il y remet une dose (Q60)', () => {
  it('Luna : sans la case, le 25 ne revient pas au 7, d’où le décalage de son report l’a sorti', () => {
    const input = luna()
    const settingId = treatmentView(input).currentSetting!.id
    const due = { settingId, dueOn: '2026-03-25', dueTime: '20:00' }

    expect(lunaDays(input)).toEqual(['2026-03-08 20:00', '2026-03-25 20:00', '2026-06-08 20:00'])
    expect(moveBounds(input, due, false)).toEqual({ refusal: { reason: 'no-date-alone' } })
    expect(moveDose(input, { due, to: '2026-03-07', shiftsFollowing: false })).toEqual({
      refusal: { reason: 'no-date-alone' },
    })
  })

  it('Luna : « Supprimer » le report reste permis', () => {
    const input = luna()
    const report = input.lines.find(({ status }) => status === 'postponed')!
    const result = removeLine(input, report.id)
    if ('refusal' in result) throw new Error(JSON.stringify(result))

    expect(lunaDays(recorded(input, result.changes))).toEqual([
      '2026-03-08 20:00',
      '2026-06-08 20:00',
    ])
  })

  it('tous les jours à 20 h : la dose du 7 reportée au 10 avec la case revient au 7, seule date', () => {
    const start: TreatmentViewInput = {
      settings: [setting('p1', '2026-03-07', DAY, ['20:00'])],
      lines: [],
      today: '2026-03-07',
    }
    const input = moved(start, '2026-03-07', '20:00', '2026-03-10')
    const settingId = treatmentView(input).currentSetting!.id
    const due = { settingId, dueOn: '2026-03-10', dueTime: '20:00' }

    expect(moveBounds(input, due, false)).toEqual({
      earliest: '2026-03-07',
      latest: '2026-03-07',
      excluded: [],
    })
    expect(lunaDays(movedAlone(input, due.dueOn, due.dueTime, '2026-03-07')).slice(0, 3)).toEqual([
      '2026-03-07 20:00',
      '2026-03-08 20:00',
      '2026-03-09 20:00',
    ])
  })

  it.each([
    ['08:00', ['2026-04-11 08:00', '2026-04-11 20:00', '2026-04-13 08:00', '2026-04-13 20:00']],
    ['20:00', ['2026-04-11 20:00', '2026-04-12 08:00', '2026-04-13 08:00', '2026-04-13 20:00']],
  ])(
    'Milo, « Prochaine dose » le 12 : %s du 12 revient au 11, seule date, et y remet la dose',
    (dueTime, expected) => {
      const input = milo(H, '2026-04-12')
      const settingId = treatmentView(input).currentSetting!.id
      const due = { settingId, dueOn: '2026-04-12', dueTime }

      expect(moveBounds(input, due, false)).toEqual({
        earliest: '2026-04-11',
        latest: '2026-04-11',
        excluded: [],
      })
      const { moteur, reference } = calendars(movedAlone(input, due.dueOn, dueTime, '2026-04-11'))

      expect({ moteur: moteur.slice(0, 4), reference: reference.slice(0, 4) }).toEqual({
        moteur: expected,
        reference: expected,
      })
    },
  )
})
