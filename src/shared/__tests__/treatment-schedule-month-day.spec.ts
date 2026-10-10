// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Frequency } from '../domain/treatment-schedule'

import {
  carnet,
  done,
  due,
  dueDays,
  monthly,
  record,
  scheduleOf,
  stored,
  weekly,
  type Carnet,
} from './treatment-schedule-fixtures'

const everyMonth = { value: 1, unit: 'month' } as const

function changed(book: Carnet, today: string, frequency: Frequency, times: string[]): Carnet {
  const dates = scheduleOf(book, today).newPeriod(frequency, times)
  const previous = book.periods.at(-1)!
  const next = {
    ...previous,
    id: `p${book.periods.length + 1}`,
    ...dates,
    frequency,
    times,
    createdAt: `${today}T10:00:00.000Z`,
  }
  return { ...book, periods: [...book.periods, next] }
}

function upcomingDays(book: Carnet, today: string, count: number): string[] {
  return [...new Set(dueDays(scheduleOf(book, today).upcoming(count * 2)))].slice(0, count)
}

function alone(book: Carnet, today: string, from: string, to: string, time?: string): Carnet {
  const { report, shift } = scheduleOf(book, today).move(due(from, time), to, false)
  expect(shift.action).toBe('none')
  if (report.action !== 'create') throw new Error('report attendu')
  return { ...book, doses: [...book.doses, stored(report.dose)] }
}

const the31st = done(carnet(monthly({ firstDueOn: '2027-01-31' })), '2027-01-31')
const february = done(the31st, '2027-02-28')

describe('mensuel : changer les heures ou la posologie ne change pas le jour du mois (#736)', () => {
  it('mensuel du 31, heures changées le 15 févr. : 28 févr., 31 mars, 30 avr., 31 mai', () => {
    const book = changed(the31st, '2027-02-15', everyMonth, ['08:00'])

    expect(upcomingDays(book, '2027-02-15', 4)).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
    ])
  })

  it.each([
    ['les heures', ['08:00']],
    ['la posologie', []],
  ])('mensuel du 31, %s changées le 28 févr., dose du jour pas encore donnée', (_, times) => {
    const book = changed(the31st, '2027-02-28', everyMonth, times)

    expect(upcomingDays(book, '2027-02-28', 3)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30'])
  })

  it.each([
    ['le 28 févr., dose du jour donnée', '2027-02-28', ['08:00']],
    ['le 5 mars', '2027-03-05', ['08:00']],
    ['le 5 mars, posologie', '2027-03-05', []],
  ])('mensuel du 31, changé %s : 31 mars, 30 avr.', (_, today, times) => {
    const book = changed(february, today, everyMonth, times)

    expect(upcomingDays(book, today, 3)).toEqual(['2027-03-31', '2027-04-30', '2027-05-31'])
  })

  it.each([
    ['du 30', '2027-01-30', '2027-02-15', ['2027-02-28', '2027-03-30', '2027-04-30']],
    ['du 29', '2027-01-29', '2027-02-15', ['2027-02-28', '2027-03-29', '2027-04-29']],
    ['du 31, année bissextile', '2028-01-31', '2028-02-15', ['2028-02-29', '2028-03-31']],
    ['du 30, année bissextile', '2028-01-30', '2028-02-15', ['2028-02-29', '2028-03-30']],
  ])(
    'mensuel %s, heures changées : le jour du mois revient après février',
    (_, first, today, expected) => {
      const book = done(carnet(monthly({ firstDueOn: first })), first)

      expect(
        upcomingDays(changed(book, today, everyMonth, ['08:00']), today, expected.length),
      ).toEqual(expected)
    },
  )

  it('tous les 2 mois depuis le 31 déc., heures changées : 28 févr., 30 avr., 30 juin, 31 août', () => {
    const everyTwo = { value: 2, unit: 'month' } as const
    const book = done(
      carnet(monthly({ firstDueOn: '2026-12-31', frequency: everyTwo })),
      '2026-12-31',
    )

    expect(upcomingDays(changed(book, '2027-01-15', everyTwo, ['08:00']), '2027-01-15', 4)).toEqual(
      ['2027-02-28', '2027-04-30', '2027-06-30', '2027-08-31'],
    )
  })

  it('tous les 3 mois depuis le 30 nov., heures changées après le 28 févr. : 30 mai, 30 août', () => {
    const everyThree = { value: 3, unit: 'month' } as const
    let book = done(
      carnet(monthly({ firstDueOn: '2026-11-30', frequency: everyThree })),
      '2026-11-30',
    )
    book = done(book, '2027-02-28')

    expect(
      upcomingDays(changed(book, '2027-03-05', everyThree, ['08:00']), '2027-03-05', 2),
    ).toEqual(['2027-05-30', '2027-08-30'])
  })

  it('une journée bornée entamée en avance garde le jour du mois après elle (G24)', () => {
    const times = ['08:00', '20:00']
    let book = carnet(monthly({ firstDueOn: '2027-03-31', times }))
    book = done(done(book, '2027-03-31'), '2027-03-31')
    book = record(book, '2027-04-29', {
      kind: 'given',
      due: due('2027-04-30', '08:00'),
      givenOn: '2027-04-29',
      shiftsFollowing: false,
    })
    const after = changed(book, '2027-04-29', everyMonth, ['09:00', '21:00'])

    expect(scheduleOf(after, '2027-04-29').upcoming(3)).toEqual([
      due('2027-04-30', '21:00', 'p2'),
      due('2027-05-31', '09:00', 'p2'),
      due('2027-05-31', '21:00', 'p2'),
    ])
  })

  it('après un report seul du 28 févr. au 2 mars, heures changées : 2 mars, 31 mars, 30 avr.', () => {
    const book = alone(the31st, '2027-02-10', '2027-02-28', '2027-03-02')

    expect(
      upcomingDays(changed(book, '2027-02-15', everyMonth, ['08:00']), '2027-02-15', 3),
    ).toEqual(['2027-03-02', '2027-03-31', '2027-04-30'])
  })

  it.each([
    ['heures changées', ['09:00', '21:00']],
    ['posologie changée', ['08:00', '20:00']],
  ])('jour d’arrivée d’un report seul entamé et passé, %s : 31 mars, 30 avr.', (_, times) => {
    let book = carnet(monthly({ firstDueOn: '2027-01-31', times: ['08:00', '20:00'] }))
    book = done(done(book, '2027-01-31'), '2027-01-31')
    book = alone(book, '2027-02-10', '2027-02-28', '2027-03-02', '08:00')
    book = done(book, '2027-03-02')

    expect(upcomingDays(changed(book, '2027-03-03', everyMonth, times), '2027-03-03', 2)).toEqual([
      '2027-03-31',
      '2027-04-30',
    ])
  })

  it('avec décalage, la suite repart du jour d’arrivée et garde son jour du mois', () => {
    const book = record(the31st, '2027-02-10', {
      kind: 'postponed',
      due: due('2027-02-28'),
      to: '2027-03-02',
    })

    expect(
      upcomingDays(changed(book, '2027-02-15', everyMonth, ['08:00']), '2027-02-15', 3),
    ).toEqual(['2027-03-02', '2027-04-02', '2027-05-02'])
  })

  it('décalage arrivé un 30 : la suite reste au 30 après février', () => {
    let book = done(carnet(monthly({ firstDueOn: '2027-01-15' })), '2027-01-15')
    book = record(book, '2027-01-20', {
      kind: 'postponed',
      due: due('2027-02-15'),
      to: '2027-01-30',
    })
    book = done(book, '2027-01-30')

    expect(
      upcomingDays(changed(book, '2027-02-05', everyMonth, ['08:00']), '2027-02-05', 3),
    ).toEqual(['2027-02-28', '2027-03-30', '2027-04-30'])
  })

  describe('fréquence changée : la nouvelle grille part du jour réel de la dernière prise, borné compris', () => {
    const everyTwo = { value: 2, unit: 'month' } as const

    it('mensuel du 31 déc., passage à tous les 2 mois le 10 janv. : 28 févr., 28 avr., 28 juin', () => {
      const book = done(carnet(monthly({ firstDueOn: '2026-12-31' })), '2026-12-31')

      expect(upcomingDays(changed(book, '2027-01-10', everyTwo, []), '2027-01-10', 3)).toEqual([
        '2027-02-28',
        '2027-04-28',
        '2027-06-28',
      ])
    })

    it('mensuel du 31, 28 févr. donné, passage à tous les 2 mois le 5 mars : 28 avr., 28 juin', () => {
      expect(upcomingDays(changed(february, '2027-03-05', everyTwo, []), '2027-03-05', 2)).toEqual([
        '2027-04-28',
        '2027-06-28',
      ])
    })

    it('tous les 2 mois depuis le 31 janv., passage à tous les mois le 3 févr. : 28 févr., 28 mars', () => {
      const book = done(
        carnet(monthly({ firstDueOn: '2027-01-31', frequency: everyTwo })),
        '2027-01-31',
      )

      expect(upcomingDays(changed(book, '2027-02-03', everyMonth, []), '2027-02-03', 2)).toEqual([
        '2027-02-28',
        '2027-03-28',
      ])
    })

    it('hebdomadaire, dernière prise le 31 janv., passage à tous les mois : 28 févr., 28 mars', () => {
      const book = done(carnet(weekly({ firstDueOn: '2027-01-31' })), '2027-01-31')

      expect(upcomingDays(changed(book, '2027-02-03', everyMonth, []), '2027-02-03', 2)).toEqual([
        '2027-02-28',
        '2027-03-28',
      ])
    })
  })
})
