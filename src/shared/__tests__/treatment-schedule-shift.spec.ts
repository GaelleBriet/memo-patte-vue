// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  carnet,
  done,
  due,
  dueDays,
  lastDose,
  monthly,
  period,
  record,
  redate,
  scheduleOf,
  stored,
  weekly,
  withoutDose,
  type Carnet,
} from './treatment-schedule-fixtures'

function shiftsOf(book: Carnet) {
  return book.doses.filter(({ status }) => status === 'shift')
}

describe('la ligne de décalage, écrite par les gestes qui décalent la suite (§2.6)', () => {
  it('« C’est fait » en retard écrit la prise et un décalage ancré à sa date réelle', () => {
    const book = done(carnet(weekly({ firstDueOn: '2026-10-16' })), '2026-10-19')

    expect(shiftsOf(book)).toEqual([
      expect.objectContaining({ dueOn: '2026-10-16', status: 'shift', nextDueDate: '2026-10-19' }),
    ])
    expect(dueDays(scheduleOf(book, '2026-10-19').upcoming(2))).toEqual([
      '2026-10-26',
      '2026-11-02',
    ])
  })

  it('« Prochaine dose » écrit le report et son décalage, à la même date', () => {
    const book = record(carnet(weekly({ firstDueOn: '2026-10-16' })), '2026-10-15', {
      kind: 'postponed',
      due: due('2026-10-16'),
      to: '2026-10-19',
    })

    expect(
      book.doses.map(({ status, dueOn, nextDueDate }) => [status, dueOn, nextDueDate]),
    ).toEqual([
      ['shift', '2026-10-16', '2026-10-19'],
      ['postponed', '2026-10-16', '2026-10-19'],
    ])
  })

  it('une prise notée à sa date n’écrit aucun décalage', () => {
    expect(shiftsOf(done(carnet(weekly()), '2026-09-01'))).toEqual([])
  })
})

describe('une ligne de décalage autonome (N6) : rien ne se supprime en cascade', () => {
  const pixel = done(carnet(weekly({ firstDueOn: '2026-10-16' })), '2026-10-19')

  it('la prise supprimée, son échéance revient, puis le rythme décalé (TR-26)', () => {
    const schedule = scheduleOf(withoutDose(pixel, lastDose(pixel).id), '2026-10-19')

    expect(schedule.currentDoses).toEqual([due('2026-10-16')])
    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-10-26', '2026-11-02', '2026-11-09'])
    expect(schedule.doses).toEqual([expect.objectContaining({ status: 'shift' })])
  })

  it('seule, elle ne fait disparaître ni son échéance d’origine ni ce qui la précède', () => {
    const shiftOnly: Carnet = {
      ...carnet(weekly()),
      doses: [
        stored({
          periodId: 'p1',
          dueOn: '2026-09-15',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-09-17',
        }),
      ],
    }

    expect(dueDays(scheduleOf(shiftOnly, '2026-09-01').upcoming(5))).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-15',
      '2026-09-24',
      '2026-10-01',
    ])
  })

  it('son échéance d’origine hors de la grille, elle s’applique encore (§2.6, règle 3)', () => {
    const offGrid: Carnet = {
      ...carnet(weekly()),
      doses: [
        stored({
          periodId: 'p1',
          dueOn: '2026-09-10',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-09-12',
        }),
      ],
    }

    expect(dueDays(scheduleOf(offGrid, '2026-09-01').upcoming(3))).toEqual([
      '2026-09-01',
      '2026-09-08',
      '2026-09-19',
    ])
  })

  it('deux décalages de la même échéance (deux appareils) : le plus récent vaut', () => {
    const line = (anchor: string) =>
      stored({
        periodId: 'p1',
        dueOn: '2026-09-08',
        dueTime: null,
        givenOn: null,
        status: 'shift',
        nextDueDate: anchor,
      })
    const older = line('2026-09-09')
    const newer = line('2026-09-11')
    const book: Carnet = { ...carnet(weekly()), doses: [older, newer] }
    const schedule = scheduleOf(book, '2026-09-01')

    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-09-01', '2026-09-08', '2026-09-18'])
    expect(schedule.doses.map(({ id }) => id)).toEqual([newer.id])
  })
})

describe('Q5 : entre deux appareils, une prise l’emporte sur un report de la même échéance', () => {
  it('le report est sans effet et part avec la prochaine écriture', () => {
    const report = stored({
      periodId: 'p1',
      dueOn: '2026-09-08',
      dueTime: null,
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-09-10',
    })
    const prise = stored({
      periodId: 'p1',
      dueOn: '2026-09-08',
      dueTime: null,
      givenOn: '2026-09-08',
      status: 'given',
      nextDueDate: '2026-09-15',
    })
    const book: Carnet = { ...carnet(weekly()), doses: [prise, report] }
    const schedule = scheduleOf(book, '2026-09-09')

    expect(schedule.staleDoseIds).toEqual([report.id])
    expect(schedule.doses.map(({ id }) => id)).toEqual([prise.id])
    expect(dueDays(schedule.upcoming(1))).toEqual(['2026-09-15'])
  })
})

describe('les limites du §11 de la spec, fermées par la ligne de décalage', () => {
  it('3a : dose non renseignée du 8 notée le 8, redatée au 9 → dose du moment le 15', () => {
    const milo = record(done(carnet(weekly()), '2026-09-01'), '2026-09-20', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-09-08',
    })
    const schedule = scheduleOf(
      redate(milo, '2026-09-20', lastDose(milo).id, '2026-09-09'),
      '2026-09-20',
    )

    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
  })

  it('3b : dose du moment notée par erreur le 1er, corrigée au 10 → prochaine le 17', () => {
    const milo = record(done(carnet(weekly()), '2026-09-01'), '2026-09-10', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-09-01',
    })
    const corrected = redate(milo, '2026-09-10', lastDose(milo).id, '2026-09-10')

    expect(scheduleOf(corrected, '2026-09-10').currentDoses).toEqual([due('2026-09-17')])
  })

  it('3c : mensuel du 30 juil., dose non renseignée du 30 août notée le 31 → 30 oct., 30 nov., 30 déc.', () => {
    const luna = record(carnet(monthly({ firstDueOn: '2026-07-30' })), '2026-10-10', {
      kind: 'given',
      due: due('2026-08-30'),
      givenOn: '2026-08-31',
    })

    expect(shiftsOf(luna)).toEqual([])
    expect(dueDays(scheduleOf(luna, '2026-10-10').upcoming(3))).toEqual([
      '2026-10-30',
      '2026-11-30',
      '2026-12-30',
    ])
  })

  it('3c’ : la dose du moment du 30 août donnée le 31 → 30 sept., 31 oct., 30 nov. (Q3)', () => {
    const luna = done(carnet(monthly({ firstDueOn: '2026-08-30' })), '2026-08-31')

    expect(dueDays(scheduleOf(luna, '2026-08-31').upcoming(3))).toEqual([
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
    ])
  })

  it('3e : mensuel du 31 janv., posologie changée le 20 févr. → 28 févr., 31 mars, 30 avr.', () => {
    const book = done(carnet(monthly({ firstDueOn: '2027-01-31' })), '2027-01-31')
    const dates = scheduleOf(book, '2027-02-20').newPeriod({ value: 1, unit: 'month' }, [])

    expect(dates).toEqual({
      startsOn: '2027-02-20',
      firstDueOn: '2027-02-28',
      referenceOn: '2027-01-31',
    })
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        monthly({ id: 'p2', ...dates, createdAt: '2027-02-20T10:00:00.000Z' }),
      ],
    }
    expect(dueDays(scheduleOf(changed, '2027-02-20').upcoming(3))).toEqual([
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
    ])
  })

  it('un jour de référence qui ne passe pas par la première échéance est ignoré', () => {
    const odd = monthly({ firstDueOn: '2027-02-10', referenceOn: '2027-01-31' })

    expect(dueDays(scheduleOf(carnet(odd), '2027-02-01').upcoming(2))).toEqual([
      '2027-02-10',
      '2027-03-10',
    ])
  })
})

describe('la famille M6 du test d’invariants : aucune échéance ne disparaît', () => {
  it('graine 13503355 : report du 10 au 11 supprimé après l’oubli du 13 → le 10 revient, le décalage garde 13, 15', () => {
    const everyTwoDays = period({ firstDueOn: '2026-03-10', frequency: { value: 2, unit: 'day' } })
    let book = record(carnet(everyTwoDays), '2026-03-11', {
      kind: 'postponed',
      due: due('2026-03-10'),
      to: '2026-03-11',
    })
    const report = lastDose(book)
    book = record(book, '2026-03-14', { kind: 'missed', due: due('2026-03-13') })
    const missed = lastDose(book)
    book = withoutDose(book, report.id)

    const schedule = scheduleOf(book, '2026-03-14')
    expect(schedule.unloggedDoses).toEqual([due('2026-03-10')])
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-03-15', '2026-03-17'])

    expect(scheduleOf(withoutDose(book, missed.id), '2026-03-14').currentDoses).toEqual([
      due('2026-03-13'),
    ])
  })

  it('un report dont l’échéance d’origine a quitté la grille reste en vigueur : sa journée d’arrivée garde ses heures', () => {
    const times = ['08:00', '20:00']
    const metacam = period({
      firstDueOn: '2026-03-01',
      frequency: { value: 2, unit: 'day' },
      times,
    })
    let book = done(carnet(metacam), '2026-03-01')
    book = record(book, '2026-03-02', {
      kind: 'given',
      due: due('2026-03-01', '20:00'),
      givenOn: '2026-03-02',
    })
    const evening = lastDose(book)
    book = record(book, '2026-03-03', {
      kind: 'postponed',
      due: due('2026-03-04', '08:00'),
      to: '2026-03-05',
    })
    book = record(book, '2026-03-05', {
      kind: 'given',
      due: due('2026-03-05', '08:00'),
      givenOn: '2026-03-05',
    })
    const arrival = lastDose(book)
    book = redate(book, '2026-03-05', evening.id, '2026-03-01')

    const schedule = scheduleOf(withoutDose(book, arrival.id), '2026-03-05')
    expect(schedule.currentDoses).toEqual([due('2026-03-05', '08:00'), due('2026-03-05', '20:00')])
  })

  it('dose avancée puis donnée un autre jour : son décalage l’emporte sur celui du report (graine 906391)', () => {
    const sixWeeks = period({ firstDueOn: '2026-03-28', frequency: { value: 6, unit: 'week' } })
    const today = '2026-03-30'
    let book = done(carnet(sixWeeks), today, '2026-03-28')
    book = record(book, today, { kind: 'postponed', due: due('2026-05-09'), to: '2026-04-04' })
    book = record(book, '2026-04-04', {
      kind: 'given',
      due: due('2026-04-04'),
      givenOn: '2026-04-02',
    })

    expect(dueDays(scheduleOf(book, '2026-04-04').upcoming(2))).toEqual([
      '2026-05-14',
      '2026-06-25',
    ])
  })
})
