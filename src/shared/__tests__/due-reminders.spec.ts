// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import {
  dueReminderPrefix,
  dueReminders,
  parseReminderKey,
  type DueReminderTexts,
} from '../due-reminders'

const ID = '22222222-2222-4222-8222-222222222222'
const ENTRY = { kind: 'vaccination', id: ID } as const
/** Construite à l'appel : le fuseau n'est forcé qu'une fois les tests lancés. */
const NOW = () => new Date(2026, 8, 15, 12)

const texts: DueReminderTexts = (moment) => ({ title: `titre ${moment}`, body: `corps ${moment}` })

let previousTz: string | undefined

beforeAll(() => {
  previousTz = process.env.TZ
  process.env.TZ = 'Europe/Paris'
})

afterAll(() => {
  process.env.TZ = previousTz
})

function reminders(dueDates: string[], now: Date) {
  return dueReminders(ENTRY, dueDates, texts, now)
}

/** `yyyy-MM-dd:moment` de chaque rappel, sans le préfixe de l'entrée. */
function slots(list: { key: string }[]): string[] {
  return list.map(({ key }) => key.slice(dueReminderPrefix(ENTRY).length))
}

describe('dueReminderPrefix', () => {
  it('préfixe toutes les clés d’une entrée par son type et son identifiant', () => {
    expect(dueReminderPrefix(ENTRY)).toBe(`vaccination:${ID}:`)
    expect(dueReminderPrefix({ kind: 'treatment', id: ID })).toBe(`treatment:${ID}:`)
  })
})

describe('dueReminders', () => {
  it('programme trois jours avant, le jour même et trois jours après, à 9 h heure locale', () => {
    expect(reminders(['2026-10-15'], NOW())).toEqual([
      {
        key: `vaccination:${ID}:2026-10-15:before`,
        title: 'titre before',
        body: 'corps before',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `vaccination:${ID}:2026-10-15:due`,
        title: 'titre due',
        body: 'corps due',
        at: new Date(2026, 9, 15, 9),
      },
      {
        key: `vaccination:${ID}:2026-10-15:overdue`,
        title: 'titre overdue',
        body: 'corps overdue',
        at: new Date(2026, 9, 18, 9),
      },
    ])
  })

  it('ne programme rien sans échéance', () => {
    expect(reminders([], NOW())).toEqual([])
  })

  it('saute le rappel de trois jours avant quand l’échéance tombe dans deux jours', () => {
    expect(slots(reminders(['2026-09-17'], new Date(2026, 8, 15, 8)))).toEqual([
      '2026-09-17:due',
      '2026-09-17:overdue',
    ])
  })

  it('garde le rappel du jour même quand il n’est pas encore 9 h', () => {
    const result = reminders(['2026-09-15'], new Date(2026, 8, 15, 8, 59))

    expect(result.map(({ at }) => at)).toEqual([new Date(2026, 8, 15, 9), new Date(2026, 8, 18, 9)])
  })

  it('ne garde que la relance pour une échéance du jour passée 9 h', () => {
    expect(slots(reminders(['2026-09-15'], new Date(2026, 8, 15, 9)))).toEqual([
      '2026-09-15:overdue',
    ])
  })

  it('ne programme plus rien quand la relance est passée', () => {
    expect(reminders(['2026-09-12'], new Date(2026, 8, 15, 9))).toEqual([])
  })

  it('programme toujours la première échéance à venir, même à huit mois', () => {
    expect(slots(reminders(['2027-05-15'], NOW()))).toEqual([
      '2027-05-15:before',
      '2027-05-15:due',
      '2027-05-15:overdue',
    ])
  })

  it('ne programme les échéances suivantes que dans les 60 jours à venir', () => {
    expect(slots(reminders(['2026-10-15', '2026-11-14', '2026-12-14'], NOW()))).toEqual([
      '2026-10-15:before',
      '2026-10-15:due',
      '2026-10-15:overdue',
      '2026-11-14:before',
      '2026-11-14:due',
    ])
  })

  it('ne borne pas l’échéance à venir quand la précédente attend encore sa relance', () => {
    expect(slots(reminders(['2026-09-14', '2026-12-14'], NOW()))).toEqual([
      '2026-09-14:overdue',
      '2026-12-14:before',
      '2026-12-14:due',
      '2026-12-14:overdue',
    ])
  })

  it('ignore la relance et le rappel avant qui débordent sur le cycle voisin, tous les deux jours', () => {
    expect(slots(reminders(['2026-09-20', '2026-09-22', '2026-09-24'], NOW()))).toEqual([
      '2026-09-20:before',
      '2026-09-20:due',
      '2026-09-22:due',
      '2026-09-24:due',
      '2026-09-24:overdue',
    ])
  })

  it('programme chaque échéance, triées dans le temps', () => {
    expect(slots(reminders(['2026-10-08', '2026-10-01'], NOW()))).toEqual([
      '2026-10-01:before',
      '2026-10-01:due',
      '2026-10-01:overdue',
      '2026-10-08:before',
      '2026-10-08:due',
      '2026-10-08:overdue',
    ])
  })

  it('ne sonne qu’une fois quand deux rappels tombent à la même heure, le jour même d’abord', () => {
    expect(slots(reminders(['2026-10-01', '2026-10-04'], NOW()))).toEqual([
      '2026-10-01:before',
      '2026-10-01:due',
      '2026-10-04:due',
      '2026-10-04:overdue',
    ])
  })

  it('préfère la relance au rappel de trois jours avant à la même heure', () => {
    expect(slots(reminders(['2026-10-01', '2026-10-07'], NOW()))).toEqual([
      '2026-10-01:before',
      '2026-10-01:due',
      '2026-10-01:overdue',
      '2026-10-07:due',
      '2026-10-07:overdue',
    ])
  })

  it('reste à 9 h locale quand le passage à l’heure d’été tombe entre les rappels', () => {
    const result = reminders(['2026-03-30'], new Date(2026, 2, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-03-27T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-04-02T07:00:00.000Z',
    ])
  })

  it('reste à 9 h locale le jour du passage à l’heure d’hiver', () => {
    const result = reminders(['2026-10-25'], new Date(2026, 9, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-10-22T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-28T08:00:00.000Z',
    ])
  })
})

describe('parseReminderKey', () => {
  it('relit l’entrée, l’échéance et le moment d’une clé posée par dueReminders', () => {
    const key = dueReminders(ENTRY, ['2026-10-15'], texts, NOW())[0]?.key ?? ''

    expect(parseReminderKey(key)).toEqual({
      entry: `vaccination:${ID}`,
      dueDate: '2026-10-15',
      moment: 'before',
    })
  })

  it.each([
    ['une clé sans moment', `vaccination:${ID}:2026-10-15`],
    ['un moment inconnu', `vaccination:${ID}:2026-10-15:soon`],
    ['une clé d’un autre domaine', 'weight:3'],
    ['une clé à rallonge', `vaccination:${ID}:2026-10-15:due:2`],
  ])('ne lit pas %s', (_, key) => {
    expect(parseReminderKey(key)).toBeNull()
  })
})
