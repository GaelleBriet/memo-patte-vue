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

function reminders(dueDate: string | null, now: Date) {
  return dueReminders({ kind: 'vaccination', id: ID, dueDate }, texts, now)
}

describe('dueReminderKeys', () => {
  it('donne une clé stable pour trois jours avant et une pour le jour même', () => {
    expect(dueReminderKeys({ kind: 'vaccination', id: ID })).toEqual([
      `vaccination:${ID}:before`,
      `vaccination:${ID}:due`,
    ])
    expect(dueReminderKeys({ kind: 'treatment', id: ID })).toEqual([
      `treatment:${ID}:before`,
      `treatment:${ID}:due`,
    ])
  })
})

describe('dueReminders', () => {
  it('programme trois jours avant et le jour même, à 9 h heure locale', () => {
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
    ])
  })

  it('ne programme rien sans échéance', () => {
    expect(reminders(null, new Date(2026, 8, 15, 12))).toEqual([])
  })

  it('ne garde que le jour même quand l’échéance tombe dans deux jours', () => {
    const result = reminders('2026-09-17', new Date(2026, 8, 15, 8))

    expect(result.map(({ key }) => key)).toEqual([`vaccination:${ID}:due`])
  })

  it('garde le rappel du jour même quand il n’est pas encore 9 h', () => {
    const result = reminders('2026-09-15', new Date(2026, 8, 15, 8, 59))

    expect(result.map(({ at }) => at)).toEqual([new Date(2026, 8, 15, 9)])
  })

  it('ne programme rien pour une échéance du jour passée 9 h', () => {
    expect(reminders('2026-09-15', new Date(2026, 8, 15, 9))).toEqual([])
    expect(reminders('2026-09-15', new Date(2026, 8, 15, 10))).toEqual([])
  })

  it('ne programme rien pour une échéance dépassée', () => {
    expect(reminders('2026-09-01', new Date(2026, 8, 15, 8))).toEqual([])
  })

  it('ne programme que dans les 60 jours à venir', () => {
    const now = new Date(2026, 8, 15, 12)

    expect(reminders('2026-11-14', now).map(({ key }) => key)).toEqual([
      `vaccination:${ID}:before`,
      `vaccination:${ID}:due`,
    ])
    expect(reminders('2026-11-15', now).map(({ key }) => key)).toEqual([`vaccination:${ID}:before`])
    expect(reminders('2026-11-18', now)).toEqual([])
  })

  it('reste à 9 h locale quand le passage à l’heure d’été tombe entre les deux rappels', () => {
    const result = reminders('2026-03-30', new Date(2026, 2, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-03-27T08:00:00.000Z',
      '2026-03-30T07:00:00.000Z',
    ])
  })

  it('reste à 9 h locale le jour du passage à l’heure d’hiver', () => {
    const result = reminders('2026-10-25', new Date(2026, 9, 1))

    expect(result.map(({ at }) => at.toISOString())).toEqual([
      '2026-10-22T07:00:00.000Z',
      '2026-10-25T08:00:00.000Z',
    ])
  })
})
