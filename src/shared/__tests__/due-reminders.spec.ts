// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { dueReminderKeys, dueReminders, type DueReminderTexts } from '../due-reminders'

const ID = '22222222-2222-4222-8222-222222222222'

const texts: DueReminderTexts = (moment) => ({ title: `titre ${moment}`, body: `corps ${moment}` })

let previousTz: string | undefined

beforeAll(() => {
  previousTz = process.env.TZ
  process.env.TZ = 'Europe/Paris'
})

afterAll(() => {
  process.env.TZ = previousTz
})

function reminders(dueDate: string | null, now: Date, missedDueDate?: string) {
  return dueReminders({ kind: 'vaccination', id: ID, dueDate, missedDueDate }, texts, now)
}

function keys(list: { key: string }[]): string[] {
  return list.map(({ key }) => key.split(':')[2]!)
}

describe('dueReminderKeys', () => {
  it('donne une clé stable avant, le jour même et en retard', () => {
    expect(dueReminderKeys({ kind: 'vaccination', id: ID })).toEqual([
      `vaccination:${ID}:before`,
      `vaccination:${ID}:due`,
      `vaccination:${ID}:overdue`,
    ])
    expect(dueReminderKeys({ kind: 'treatment', id: ID })).toEqual([
      `treatment:${ID}:before`,
      `treatment:${ID}:due`,
      `treatment:${ID}:overdue`,
    ])
  })
})

describe('dueReminders', () => {
  it('programme trois jours avant, le jour même et trois jours après, à 9 h heure locale', () => {
    const result = reminders('2026-10-15', new Date(2026, 8, 15, 12))

    expect(result).toEqual([
      {
        key: `vaccination:${ID}:before`,
        title: 'titre before',
        body: 'corps before',
        at: new Date(2026, 9, 12, 9),
      },
      {
        key: `vaccination:${ID}:due`,
        title: 'titre due',
        body: 'corps due',
        at: new Date(2026, 9, 15, 9),
      },
      {
        key: `vaccination:${ID}:overdue`,
        title: 'titre overdue',
        body: 'corps overdue',
        at: new Date(2026, 9, 18, 9),
      },
    ])
  })

  it('ne programme rien sans échéance', () => {
    expect(reminders(null, new Date(2026, 8, 15, 12))).toEqual([])
  })

  it('saute le rappel de trois jours avant quand l’échéance tombe dans deux jours', () => {
    expect(keys(reminders('2026-09-17', new Date(2026, 8, 15, 8)))).toEqual(['due', 'overdue'])
  })

  it('garde le rappel du jour même quand il n’est pas encore 9 h', () => {
    const result = reminders('2026-09-15', new Date(2026, 8, 15, 8, 59))

    expect(result.map(({ at }) => at)).toEqual([new Date(2026, 8, 15, 9), new Date(2026, 8, 18, 9)])
  })

  it('ne garde que la relance pour une échéance du jour passée 9 h', () => {
    expect(keys(reminders('2026-09-15', new Date(2026, 8, 15, 9)))).toEqual(['overdue'])
  })

  it('relance une échéance dépassée tant que ses trois jours de retard sont à venir', () => {
    const result = reminders('2026-09-13', new Date(2026, 8, 15, 12))

    expect(result.map(({ key, at }) => [key, at])).toEqual([
      [`vaccination:${ID}:overdue`, new Date(2026, 8, 16, 9)],
    ])
  })

  it('ne programme plus rien quand la relance est passée', () => {
    expect(reminders('2026-09-12', new Date(2026, 8, 15, 9))).toEqual([])
    expect(reminders('2026-09-01', new Date(2026, 8, 15, 8))).toEqual([])
  })

  it('relance l’échéance manquée plutôt que la suivante tant que sa relance est à venir', () => {
    const result = reminders('2026-10-14', new Date(2026, 8, 15, 12), '2026-09-14')

    expect(result.map(({ key, at }) => [key, at])).toEqual([
      [`vaccination:${ID}:overdue`, new Date(2026, 8, 17, 9)],
      [`vaccination:${ID}:before`, new Date(2026, 9, 11, 9)],
      [`vaccination:${ID}:due`, new Date(2026, 9, 14, 9)],
    ])
  })

  it('relance l’échéance suivante quand celle de l’échéance manquée est passée', () => {
    const result = reminders('2026-10-10', new Date(2026, 8, 15, 12), '2026-09-10')

    expect(keys(result)).toEqual(['before', 'due', 'overdue'])
    expect(result.at(-1)?.at).toEqual(new Date(2026, 9, 13, 9))
  })

  it('ne programme que dans les 60 jours à venir', () => {
    const now = new Date(2026, 8, 15, 12)

    expect(keys(reminders('2026-11-11', now))).toEqual(['before', 'due', 'overdue'])
    expect(keys(reminders('2026-11-14', now))).toEqual(['before', 'due'])
    expect(keys(reminders('2026-11-15', now))).toEqual(['before'])
    expect(reminders('2026-11-18', now)).toEqual([])
  })

  it('reste à 9 h locale quand le passage à l’heure d’été tombe entre les rappels', () => {
    const result = reminders('2026-03-30', new Date(2026, 2, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-03-27T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
      '2026-04-02T07:00:00.000Z',
    ])
  })

  it('reste à 9 h locale le jour du passage à l’heure d’hiver', () => {
    const result = reminders('2026-10-25', new Date(2026, 9, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-10-22T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
      '2026-10-28T08:00:00.000Z',
    ])
  })
})
