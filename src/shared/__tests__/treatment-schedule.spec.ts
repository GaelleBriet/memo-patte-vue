// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import {
  ScheduleTooLongError,
  isAdvanced,
  treatmentSchedule,
  type Due,
  type Frequency,
  type TreatmentDoseInput,
  type TreatmentPeriodInput,
} from '../domain/treatment-schedule'

import {
  applied,
  carnet,
  days,
  done,
  doneEachDay,
  due,
  dueDays,
  storedMove,
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

function withPeriod(
  book: Carnet,
  fields: Pick<
    TreatmentPeriodInput,
    'startsOn' | 'firstDueOn' | 'referenceOn' | 'frequency' | 'times'
  >,
): Carnet {
  const created = period({ id: 'p2', createdAt: '2026-10-02T09:00:00.000Z', ...fields })
  return { ...book, periods: [...book.periods, created] }
}

describe('échéances d’une période (TR-7, T1, T2)', () => {
  it('la première échéance est la première prise de la période', () => {
    const schedule = scheduleOf(carnet(period({ firstDueOn: '2026-10-05' })), '2026-10-01')

    expect(schedule.currentDoses).toEqual([due('2026-10-05')])
    expect(schedule.phase).toBe('upcoming')
    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-10-05', '2026-10-06', '2026-10-07'])
  })

  it('après une prise donnée, la suite repart de sa date réelle', () => {
    const book = done(carnet(weekly()), '2026-09-03')

    expect(lastDose(book)).toMatchObject({
      dueOn: '2026-09-01',
      givenOn: '2026-09-03',
      status: 'given',
      nextDueDate: '2026-09-10',
    })
    expect(dueDays(scheduleOf(book, '2026-09-03').upcoming(2))).toEqual([
      '2026-09-10',
      '2026-09-17',
    ])
  })

  it('après une prise oubliée, la suite repart de son échéance', () => {
    const book = record(carnet(weekly()), '2026-09-03', {
      kind: 'missed',
      due: due('2026-09-01'),
    })

    expect(lastDose(book)).toMatchObject({
      givenOn: null,
      status: 'missed',
      nextDueDate: '2026-09-08',
    })
    expect(dueDays(scheduleOf(book, '2026-09-03').upcoming(2))).toEqual([
      '2026-09-08',
      '2026-09-15',
    ])
  })

  it('après un report, la suite repart de la nouvelle date', () => {
    const book = record(carnet(weekly()), '2026-09-01', {
      kind: 'postponed',
      due: due('2026-09-01'),
      to: '2026-09-04',
    })

    expect(lastDose(book)).toMatchObject({
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-09-04',
    })
    const schedule = scheduleOf(book, '2026-09-01')
    expect(schedule.currentDoses).toEqual([due('2026-09-04')])
    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-09-04', '2026-09-11', '2026-09-18'])
  })

  it('en mois, la suite garde le jour de la première échéance : 31 janv. → 28 févr. → 31 mars', () => {
    const schedule = scheduleOf(carnet(monthly({ firstDueOn: '2026-01-31' })), '2026-01-31')

    expect(dueDays(schedule.upcoming(4))).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
  })

  it('elle ne dérive pas quand les prises tombent à leur date ou sont oubliées', () => {
    let book = carnet(monthly({ firstDueOn: '2026-01-31' }))
    book = done(book, '2026-01-31')
    book = done(book, '2026-02-28')
    book = record(book, '2026-03-31', { kind: 'missed', due: due('2026-03-31') })

    expect(book.doses.map((dose) => dose.nextDueDate)).toEqual([
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ])
    expect(dueDays(scheduleOf(book, '2026-04-01').upcoming(2))).toEqual([
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('une prise donnée un autre jour que son échéance devient la nouvelle référence', () => {
    const book = done(carnet(monthly({ firstDueOn: '2026-01-30' })), '2026-01-31')

    expect(lastDose(book).nextDueDate).toBe('2026-02-28')
    expect(dueDays(scheduleOf(book, '2026-01-31').upcoming(2))).toEqual([
      '2026-02-28',
      '2026-03-31',
    ])
  })

  describe('période ouverte par « Modifier » (Q7)', () => {
    const milo = doneEachDay(carnet(weekly()), '2026-09-01', '2026-09-01')
    const miloOn8 = done(milo, '2026-09-08')
    const fifteenDays = { value: 15, unit: 'day' } as const

    it('la première dose est la dernière prise plus la nouvelle fréquence', () => {
      expect(scheduleOf(miloOn8, '2026-09-10').newPeriod(fifteenDays, [])).toEqual({
        startsOn: '2026-09-10',
        firstDueOn: '2026-09-23',
        referenceOn: '2026-09-23',
      })
    })

    it('jamais avant aujourd’hui : Milo, dernière prise le 8 sept., passé à 15 jours le 29', () => {
      expect(scheduleOf(miloOn8, '2026-09-29').newPeriod(fifteenDays, [])).toEqual({
        startsOn: '2026-09-29',
        firstDueOn: '2026-09-29',
        referenceOn: '2026-09-29',
      })
    })

    it('sans aucune prise, aujourd’hui', () => {
      expect(scheduleOf(carnet(weekly()), '2026-09-29').newPeriod(fifteenDays, [])).toEqual({
        startsOn: '2026-09-29',
        firstDueOn: '2026-09-29',
        referenceOn: '2026-09-29',
      })
    })
  })
})

describe('une prise ne déplace la suite que si elle couvre la dose du moment (TR-7, TR-18, Q8)', () => {
  it('Milbemax prévu le 22 et donné le 23 : la suite repart du 23', () => {
    let book = done(carnet(monthly({ firstDueOn: '2026-08-22' })), '2026-08-22')
    expect(scheduleOf(book, '2026-09-23').currentDoses).toEqual([due('2026-09-22')])

    book = done(book, '2026-09-23')

    expect(lastDose(book).nextDueDate).toBe('2026-10-23')
    expect(scheduleOf(book, '2026-09-23').currentDoses).toEqual([due('2026-10-23')])
  })

  it('Panacur : la dose du 6 oct. notée le 7 à 8 h 15 laisse prévue celle du 7 à 20 h', () => {
    let book = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-01', times: ['20:00'] })),
      '2026-10-01',
      '2026-10-05',
    )
    const before = scheduleOf(book, '2026-10-07')
    expect(before.currentDoses).toEqual([due('2026-10-07', '20:00')])
    expect(before.unloggedDoses).toEqual([due('2026-10-06', '20:00')])

    book = record(book, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-06', '20:00'),
      givenOn: '2026-10-07',
    })

    expect(lastDose(book)).toMatchObject({ dueOn: '2026-10-06', nextDueDate: '2026-10-07' })
    const after = scheduleOf(book, '2026-10-07')
    expect(after.currentDoses).toEqual([due('2026-10-07', '20:00')])
    expect(after.unloggedDoses).toEqual([])
  })
})

describe('date de fin (TR-8, TR-12)', () => {
  const ending = carnet(period({ firstDueOn: '2026-10-01', endsOn: '2026-10-03' }))

  it('aucune échéance après la date de fin', () => {
    expect(dueDays(scheduleOf(ending, '2026-10-01').upcoming(10))).toEqual([
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
    ])
  })

  it('après la date de fin, plus de dose du moment, et ce qui reste sans prise est à renseigner', () => {
    const schedule = scheduleOf(ending, '2026-10-05')

    expect(schedule.phase).toBe('ended')
    expect(schedule.currentDoses).toEqual([])
    expect(schedule.nextDue).toBeNull()
    expect(schedule.upcoming(5)).toEqual([])
    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-10-01', '2026-10-02', '2026-10-03'])
    expect(schedule.finished).toBe(false)
  })
})

describe('reporter la prochaine dose (TR-9)', () => {
  const book = done(carnet(period()), '2026-09-01')

  it('le report remplace l’échéance d’origine, les doses d’avant restent à renseigner', () => {
    expect(dueDays(scheduleOf(book, '2026-09-05').unloggedDoses)).toEqual(
      days('2026-09-02', '2026-09-04'),
    )

    const postponed = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-07',
    })

    const sameDay = scheduleOf(postponed, '2026-09-05')
    expect(sameDay.currentDoses).toEqual([due('2026-09-07')])
    expect(dueDays(sameDay.unloggedDoses)).toEqual(days('2026-09-02', '2026-09-04'))
    expect(dueDays(scheduleOf(postponed, '2026-09-08').unloggedDoses)).toEqual([
      ...days('2026-09-02', '2026-09-04'),
      '2026-09-07',
    ])
  })
})

describe('dose du moment (TR-10, TR-11)', () => {
  it('la dernière échéance jusqu’à aujourd’hui, encore sans prise : en retard', () => {
    const schedule = scheduleOf(done(carnet(weekly()), '2026-09-01'), '2026-09-10')

    expect(schedule.currentDoses).toEqual([due('2026-09-08')])
    expect(schedule.phase).toBe('overdue')
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('à défaut, la prochaine, jamais une date passée', () => {
    const book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const schedule = scheduleOf(book, '2026-09-10')

    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
    expect(schedule.phase).toBe('upcoming')
    expect(schedule.nextDue).toEqual(due('2026-09-15'))
  })

  describe('Luna, à 8 h et 20 h (Q6)', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['20:00', '08:00'] }))

    it('à 21 h, rien de noté : chaque heure du jour est une dose du jour, aucune en retard', () => {
      const schedule = scheduleOf(luna, '2026-09-28')

      expect(schedule.currentDoses).toEqual([
        due('2026-09-28', '08:00'),
        due('2026-09-28', '20:00'),
      ])
      expect(schedule.phase).toBe('today')
    })

    it('la dose de 8 h notée, reste celle de 20 h ; les deux notées, la prochaine', () => {
      const at8 = record(luna, '2026-09-28', {
        kind: 'given',
        due: due('2026-09-28', '08:00'),
        givenOn: '2026-09-28',
      })
      expect(scheduleOf(at8, '2026-09-28').currentDoses).toEqual([due('2026-09-28', '20:00')])

      const both = done(at8, '2026-09-28')
      const schedule = scheduleOf(both, '2026-09-28')
      expect(schedule.currentDoses).toEqual([due('2026-09-29', '08:00')])
      expect(schedule.phase).toBe('upcoming')
      expect(schedule.nextDue).toEqual(due('2026-09-29', '08:00'))
    })

    it('une heure non notée reste du jour jusqu’à minuit, puis devient non renseignée', () => {
      const nextDay = scheduleOf(luna, '2026-09-29')

      expect(nextDay.unloggedDoses).toEqual([
        due('2026-09-28', '08:00'),
        due('2026-09-28', '20:00'),
      ])
      expect(nextDay.currentDoses).toEqual([due('2026-09-29', '08:00'), due('2026-09-29', '20:00')])
      expect(nextDay.phase).toBe('today')
    })

    it('les échéances à venir gardent leurs heures, jour après jour', () => {
      expect(scheduleOf(luna, '2026-09-28').upcoming(3)).toEqual([
        due('2026-09-28', '08:00'),
        due('2026-09-28', '20:00'),
        due('2026-09-29', '08:00'),
      ])
    })
  })

  describe('Métacam, tous les 2 jours à 8 h et 20 h : on raisonne par journée (Q23)', () => {
    const metacam = carnet(
      period({
        firstDueOn: '2026-09-27',
        frequency: { value: 2, unit: 'day' },
        times: ['08:00', '20:00'],
      }),
    )
    const day27 = [due('2026-09-27', '08:00'), due('2026-09-27', '20:00')]

    it('le lendemain, les deux heures de la journée sont en retard, rien n’est non renseigné', () => {
      const schedule = scheduleOf(metacam, '2026-09-28')

      expect(schedule.currentDoses).toEqual(day27)
      expect(schedule.phase).toBe('overdue')
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('une heure notée, l’autre reste seule en retard, quel que soit l’ordre', () => {
      const at20 = record(metacam, '2026-09-27', {
        kind: 'given',
        due: due('2026-09-27', '20:00'),
        givenOn: '2026-09-27',
      })
      const schedule = scheduleOf(at20, '2026-09-28')

      expect(schedule.currentDoses).toEqual([due('2026-09-27', '08:00')])
      expect(schedule.unloggedDoses).toEqual([])
    })

    it('quand la journée d’échéance suivante arrive, la journée passée devient non renseignée', () => {
      const schedule = scheduleOf(metacam, '2026-09-29')

      expect(schedule.unloggedDoses).toEqual(day27)
      expect(schedule.currentDoses).toEqual([
        due('2026-09-29', '08:00'),
        due('2026-09-29', '20:00'),
      ])
      expect(schedule.phase).toBe('today')
    })

    it('« Prochaine dose » au 29 emporte les deux heures en retard', () => {
      const moved = record(metacam, '2026-09-28', {
        kind: 'postponed',
        due: due('2026-09-27', '20:00'),
        to: '2026-09-29',
      })
      const schedule = scheduleOf(moved, '2026-09-28')

      expect(schedule.unloggedDoses).toEqual([])
      expect(schedule.upcoming(3)).toEqual([
        due('2026-09-29', '08:00'),
        due('2026-09-29', '20:00'),
        due('2026-10-01', '08:00'),
      ])
    })
  })
})

describe('chaque prise vise une échéance (TR-13)', () => {
  it('jour et heure : la prise de 20 h vise l’échéance de 20 h', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))

    expect(
      scheduleOf(luna, '2026-09-28').doseFor({
        kind: 'given',
        due: due('2026-09-28', '20:00'),
        givenOn: '2026-09-28',
      }),
    ).toEqual({
      dose: {
        periodId: 'p1',
        dueOn: '2026-09-28',
        dueTime: '20:00',
        givenOn: '2026-09-28',
        status: 'given',
        nextDueDate: '2026-09-29',
      },
      shift: null,
    })
  })

  describe('depuis la notification d’un jour passé, par « Donnée quand ? »', () => {
    const book = carnet(period({ firstDueOn: '2026-09-27' }))

    it.each([
      ['aujourd’hui', '2026-09-29'],
      ['le jour prévu', '2026-09-28'],
    ])('« %s » note l’échéance de la notification, sans toucher la dose du jour', (_, givenOn) => {
      const noted = record(book, '2026-09-29', { kind: 'given', due: due('2026-09-28'), givenOn })

      expect(lastDose(noted)).toMatchObject({ dueOn: '2026-09-28', givenOn })
      const schedule = scheduleOf(noted, '2026-09-29')
      expect(schedule.currentDoses).toEqual([due('2026-09-29')])
      expect(schedule.unloggedDoses).toEqual([due('2026-09-27')])
    })
  })

  describe('une prise notée à une date, sans heure désignée', () => {
    const book = done(carnet(weekly()), '2026-09-01')

    it('vise la dernière échéance tombée à cette date ou avant', () => {
      const schedule = scheduleOf(book, '2026-09-20')

      expect(schedule.dueForDate('2026-09-10')).toEqual(due('2026-09-08'))
      expect(schedule.dueForDate('2026-09-15')).toEqual(due('2026-09-15'))
    })

    it('notée en avance, vise la prochaine', () => {
      const schedule = scheduleOf(done(book, '2026-09-08'), '2026-09-13')

      expect(schedule.dueForDate('2026-09-13')).toEqual(due('2026-09-15'))
    })

    it('sur un jour noté oublié, vise cette échéance pour la repasser en donnée (TR-22)', () => {
      const missed = record(book, '2026-09-08', { kind: 'missed', due: due('2026-09-08') })

      expect(scheduleOf(missed, '2026-09-20').dueForDate('2026-09-10')).toEqual(due('2026-09-08'))
    })

    it('après la date de fin, rien à viser en avance', () => {
      const ended = done(
        carnet(period({ firstDueOn: '2026-09-01', endsOn: '2026-09-01' })),
        '2026-09-01',
      )

      expect(scheduleOf(ended, '2026-09-01').dueForDate('2026-09-01')).toBeNull()
    })
  })

  describe('à plusieurs heures', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-25', times: ['08:00', '20:00'] }))

    it('vise l’heure choisie', () => {
      expect(scheduleOf(luna, '2026-09-28').dueForDate('2026-09-26', '20:00')).toEqual(
        due('2026-09-26', '20:00'),
      )
    })

    it('en avance, vise la prochaine échéance à cette heure', () => {
      const allNoted = doneEachDay(
        doneEachDay(luna, '2026-09-25', '2026-09-28'),
        '2026-09-25',
        '2026-09-28',
      )

      expect(scheduleOf(allNoted, '2026-09-28').dueForDate('2026-09-28', '20:00')).toEqual(
        due('2026-09-29', '20:00'),
      )
    })

    it('une heure que la période n’a pas ne vise rien', () => {
      expect(scheduleOf(luna, '2026-09-28').dueForDate('2026-09-28', '09:00')).toBeNull()
    })
  })

  it('une échéance passée devient non renseignée dès qu’une plus récente est tombée', () => {
    const everyThreeDays = carnet(
      period({ firstDueOn: '2026-09-25', frequency: { value: 3, unit: 'day' } }),
    )

    const before = scheduleOf(everyThreeDays, '2026-09-27')
    expect(before.currentDoses).toEqual([due('2026-09-25')])
    expect(before.unloggedDoses).toEqual([])

    const after = scheduleOf(everyThreeDays, '2026-09-28')
    expect(after.currentDoses).toEqual([due('2026-09-28')])
    expect(after.unloggedDoses).toEqual([due('2026-09-25')])
  })
})

describe('prochaine échéance', () => {
  it('quand la dose du jour reste à donner, la prochaine est la suivante', () => {
    const schedule = scheduleOf(carnet(period({ firstDueOn: '2026-09-28' })), '2026-09-28')

    expect(schedule.currentDoses).toEqual([due('2026-09-28')])
    expect(schedule.nextDue).toEqual(due('2026-09-29'))
  })
})

describe('une dose non renseignée n’est jamais un retard (TR-14)', () => {
  it('le traitement est du jour, avec ses doses à renseigner à part', () => {
    const book = doneEachDay(carnet(period()), '2026-09-01', '2026-09-02')
    const schedule = scheduleOf(book, '2026-09-28')

    expect(schedule.phase).toBe('today')
    expect(schedule.unloggedDoses).toHaveLength(25)
  })
})

describe('changer la date d’une prise (TR-24 bis, T3)', () => {
  let book = done(carnet(monthly({ firstDueOn: '2026-08-05' })), '2026-08-05')
  book = done(book, '2026-09-05')
  const septemberDose = lastDose(book)
  book = record(book, '2026-10-01', {
    kind: 'postponed',
    due: due('2026-10-05'),
    to: '2026-10-10',
  })
  const report = lastDose(book)
  const reportShift = book.doses.find(({ status }) => status === 'shift')

  it('la prise déplacée recalcule la prochaine dose qu’elle fixe, et dit si le report est gardé', () => {
    expect(scheduleOf(book, '2026-10-02').redate(septemberDose.id, '2026-08-28')).toEqual({
      dose: {
        periodId: 'p1',
        dueOn: '2026-09-05',
        dueTime: null,
        givenOn: '2026-08-28',
        status: 'given',
        nextDueDate: '2026-10-10',
      },
      shift: {
        action: 'create',
        dose: {
          periodId: 'p1',
          dueOn: '2026-09-05',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-08-28',
        },
      },
      postponement: {
        doseIds: [report.id],
        kept: true,
        line: {
          periodId: 'p1',
          dueOn: '2026-09-28',
          dueTime: null,
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-10-10',
        },
        shiftIds: [reportShift?.id],
        shiftLine: {
          periodId: 'p1',
          dueOn: '2026-09-28',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-10-10',
        },
      },
    })
  })

  it('un report placé après elle est gardé, sans dose à renseigner de plus', () => {
    const moved = redate(book, '2026-10-02', septemberDose.id, '2026-08-28')
    const schedule = scheduleOf(moved, '2026-10-02')

    expect(schedule.currentDoses).toEqual([due('2026-10-10')])
    expect(schedule.phase).toBe('upcoming')
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('à égale distance de deux échéances, le report garde celle d’avant', () => {
    const moved = redate(book, '2026-10-02', septemberDose.id, '2026-08-20')
    const schedule = scheduleOf(moved, '2026-10-02')

    expect(schedule.currentDoses).toEqual([due('2026-10-10')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  describe('la dose de septembre donnée le 7, qui a décalé la suite, puis la suivante reportée au 10 oct.', () => {
    let late = done(carnet(monthly({ firstDueOn: '2026-08-05' })), '2026-08-05')
    late = done(late, '2026-09-07')
    const lateDose = lastDose(late)
    late = record(late, '2026-10-01', {
      kind: 'postponed',
      due: due('2026-10-07'),
      to: '2026-10-10',
    })
    const lateReport = lastDose(late)
    const lateReportShift = late.doses.find(
      ({ status, dueOn }) => status === 'shift' && dueOn === '2026-10-07',
    )

    it('un report qui ne tombe plus après la prise déplacée est dépassé : ses lignes partent, la suite repart de la prise', () => {
      expect(scheduleOf(late, '2026-10-20').redate(lateDose.id, '2026-10-12').postponement).toEqual(
        { doseIds: [lateReport.id, lateReportShift?.id], kept: false },
      )

      const schedule = scheduleOf(
        redate(late, '2026-10-20', lateDose.id, '2026-10-12'),
        '2026-10-20',
      )

      expect(schedule.currentDoses).toEqual([due('2026-11-12')])
      expect(schedule.unloggedDoses).toEqual([])
      expect(schedule.doses.map((dose) => dose.id)).not.toContain(lateReport.id)
    })

    it('un report qui tombe le jour même de la prise déplacée est dépassé aussi', () => {
      expect(scheduleOf(late, '2026-10-20').redate(lateDose.id, '2026-10-10')).toMatchObject({
        dose: { nextDueDate: '2026-11-10' },
        shift: { action: 'rewrite', dose: { nextDueDate: '2026-10-10' } },
        postponement: { kept: false },
      })

      const after = scheduleOf(redate(late, '2026-10-20', lateDose.id, '2026-10-10'), '2026-10-20')
      expect(after.currentDoses).toEqual([due('2026-11-10')])
      expect(after.doses.map((dose) => dose.id)).not.toContain(lateReport.id)
    })
  })

  it('notée à sa date, une prise dont l’échéance n’est plus la dose du moment ne décale rien quand on la redate (N1)', () => {
    const schedule = scheduleOf(
      redate(book, '2026-10-20', septemberDose.id, '2026-10-12'),
      '2026-10-20',
    )

    expect(schedule.currentDoses).toEqual([due('2026-10-10')])
    expect(schedule.doses.map((dose) => dose.id)).toContain(report.id)
  })

  it('sans report juste après elle, rien à garder', () => {
    const [august] = book.doses

    expect(
      scheduleOf(book, '2026-10-02').redate(august?.id ?? '', '2026-08-06').postponement,
    ).toBeNull()
  })

  it('une dose non renseignée notée tard puis redatée ne déplace toujours rien (Q8)', () => {
    let panacur = done(carnet(period({ firstDueOn: '2026-10-05' })), '2026-10-05')
    panacur = record(panacur, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-06'),
      givenOn: '2026-10-07',
    })

    expect(
      scheduleOf(panacur, '2026-10-08').redate(lastDose(panacur).id, '2026-10-08').dose.nextDueDate,
    ).toBe('2026-10-07')
  })

  it('corriger la date d’une dose renseignée ne fait disparaître aucune dose non renseignée', () => {
    let daily = done(carnet(period()), '2026-09-01')
    daily = record(daily, '2026-09-05', {
      kind: 'given',
      due: due('2026-09-02'),
      givenOn: '2026-09-02',
    })

    const schedule = scheduleOf(
      redate(daily, '2026-09-05', lastDose(daily).id, '2026-09-03'),
      '2026-09-05',
    )

    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-09-03', '2026-09-04'])
    expect(schedule.currentDoses).toEqual([due('2026-09-05')])
  })

  it('une prise du moment avancée fait apparaître l’échéance qu’elle ne couvre plus', () => {
    const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const schedule = scheduleOf(
      redate(milo, '2026-09-12', lastDose(milo).id, '2026-09-03'),
      '2026-09-20',
    )

    expect(schedule.unloggedDoses).toEqual([due('2026-09-10')])
    expect(schedule.currentDoses).toEqual([due('2026-09-17')])
  })

  it('redatée quand son échéance n’est plus la dose du moment, une prise notée à sa date ne décale rien (N1)', () => {
    const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const schedule = scheduleOf(
      redate(milo, '2026-09-20', lastDose(milo).id, '2026-09-03'),
      '2026-09-20',
    )

    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
  })

  it('refuse une prise inconnue ou qui n’est pas donnée', () => {
    const schedule = scheduleOf(book, '2026-10-02')

    expect(() => schedule.redate('inconnue', '2026-10-01')).toThrow(
      'Aucune prise donnée ni prise en plus à redater : inconnue',
    )
    expect(() => schedule.redate(report.id, '2026-10-01')).toThrow(
      'Aucune prise donnée ni prise en plus à redater',
    )
  })
})

describe('corriger une prise renseignée suivie d’un report (Q8, TR-24 bis)', () => {
  it('la prise du 2 renseignée puis redatée au 8 ne touche ni le report ni les doses à renseigner', () => {
    let book = done(carnet(period()), '2026-09-01')
    book = record(book, '2026-09-05', {
      kind: 'given',
      due: due('2026-09-02'),
      givenOn: '2026-09-02',
    })
    const renseigned = lastDose(book)
    book = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-07',
    })
    expect(dueDays(scheduleOf(book, '2026-09-08').unloggedDoses)).toEqual([
      '2026-09-03',
      '2026-09-04',
      '2026-09-07',
    ])

    expect(scheduleOf(book, '2026-09-08').redate(renseigned.id, '2026-09-08')).toEqual({
      dose: expect.objectContaining({ givenOn: '2026-09-08', nextDueDate: '2026-09-03' }),
      shift: { action: 'none' },
      postponement: null,
    })
    const schedule = scheduleOf(
      redate(book, '2026-09-08', renseigned.id, '2026-09-08'),
      '2026-09-08',
    )
    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-09-03', '2026-09-04', '2026-09-07'])
    expect(schedule.currentDoses).toEqual([due('2026-09-08')])
  })

  it('la dose du 6 notée le 9 puis redatée au 10 ne touche pas le report (scénario B)', () => {
    let book = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-01', times: ['20:00'] })),
      '2026-10-01',
      '2026-10-05',
    )
    book = record(book, '2026-10-07', {
      kind: 'postponed',
      due: due('2026-10-07', '20:00'),
      to: '2026-10-09',
    })
    book = record(book, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-06', '20:00'),
      givenOn: '2026-10-09',
    })
    const late = lastDose(book)

    expect(scheduleOf(book, '2026-10-10').redate(late.id, '2026-10-10')).toMatchObject({
      dose: { nextDueDate: '2026-10-09' },
      shift: { action: 'none' },
      postponement: null,
    })
    const schedule = scheduleOf(redate(book, '2026-10-10', late.id, '2026-10-10'), '2026-10-10')
    expect(schedule.unloggedDoses).toEqual([due('2026-10-09', '20:00')])
    expect(schedule.currentDoses).toEqual([due('2026-10-10', '20:00')])
  })

  it('une prise renseignée après le report ne le dépasse jamais', () => {
    let book = done(carnet(period()), '2026-09-01')
    book = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-07',
    })
    book = record(book, '2026-09-05', {
      kind: 'given',
      due: due('2026-09-04'),
      givenOn: '2026-09-04',
    })

    expect(
      scheduleOf(book, '2026-09-08').redate(lastDose(book).id, '2026-09-08').postponement,
    ).toBeNull()
  })
})

describe('reports et doses notées tard', () => {
  it('une dose non renseignée notée tard ne rend pas un report dépassé (scénario B)', () => {
    let book = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-01', times: ['20:00'] })),
      '2026-10-01',
      '2026-10-05',
    )
    book = record(book, '2026-10-07', {
      kind: 'postponed',
      due: due('2026-10-07', '20:00'),
      to: '2026-10-09',
    })
    book = record(book, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-06', '20:00'),
      givenOn: '2026-10-09',
    })

    const schedule = scheduleOf(book, '2026-10-09')
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([due('2026-10-09', '20:00')])
  })

  it('deux reports successifs : le second repart de la date du premier', () => {
    let book = done(carnet(weekly()), '2026-09-01')
    book = record(book, '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })
    book = record(book, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-12'),
      to: '2026-09-15',
    })

    expect(scheduleOf(book, '2026-09-13').currentDoses).toEqual([due('2026-09-15')])
    const later = scheduleOf(book, '2026-09-16')
    expect(later.currentDoses).toEqual([due('2026-09-15')])
    expect(later.unloggedDoses).toEqual([])
  })
})

describe('mois avec un jour de référence de 29 à 31 (T2)', () => {
  it('la dose du 31 janv. notée tard le 1er mars ne fait pas dériver la suite au 28 (scénario C)', () => {
    const book = record(carnet(monthly({ firstDueOn: '2026-01-31' })), '2026-03-01', {
      kind: 'given',
      due: due('2026-01-31'),
      givenOn: '2026-03-01',
    })

    expect(dueDays(scheduleOf(book, '2026-03-01').upcoming(3))).toEqual([
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
    ])
  })

  it('à 8 h et 20 h, la prise de 8 h le 28 févr. garde le 31 mars (scénario D)', () => {
    const start = carnet(monthly({ firstDueOn: '2026-01-31', times: ['08:00', '20:00'] }))
    const january = doneEachDay(
      doneEachDay(start, '2026-01-31', '2026-01-31'),
      '2026-01-31',
      '2026-01-31',
    )
    const book = done(january, '2026-02-28')

    expect(scheduleOf(book, '2026-02-28').upcoming(3)).toEqual([
      due('2026-02-28', '20:00'),
      due('2026-03-31', '08:00'),
      due('2026-03-31', '20:00'),
    ])
  })
})

describe('supprimer un report (TR-24)', () => {
  it('l’échéance d’origine redevient la dose du moment ; son décalage reste (N8)', () => {
    const book = doneEachDay(carnet(period()), '2026-09-01', '2026-09-04')
    const postponed = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-07',
    })

    const schedule = scheduleOf(withoutDose(postponed, lastDose(postponed).id), '2026-09-05')

    expect(schedule.currentDoses).toEqual([due('2026-09-05')])
    expect(schedule.unloggedDoses).toEqual([])
    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-09-05', '2026-09-08', '2026-09-09'])
  })

  it('le décalage supprimé aussi, la suite d’avant revient', () => {
    const book = done(carnet(weekly()), '2026-09-01')
    const postponed = record(book, '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })
    const unmoved = {
      ...postponed,
      doses: postponed.doses.filter(({ dueOn }) => dueOn !== '2026-09-08'),
    }

    const schedule = scheduleOf(unmoved, '2026-09-16')

    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
    expect(schedule.unloggedDoses).toEqual([due('2026-09-08')])
  })

  it('Pixel le vendredi : report du 16 au 19 supprimé, le 16 revient puis le 26 et le 2 nov. (N6)', () => {
    const pixel = carnet(weekly({ firstDueOn: '2026-10-09' }))
    const postponed = record(done(pixel, '2026-10-09'), '2026-10-15', {
      kind: 'postponed',
      due: due('2026-10-16'),
      to: '2026-10-19',
    })

    const schedule = scheduleOf(withoutDose(postponed, lastDose(postponed).id), '2026-10-15')

    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-10-16', '2026-10-26', '2026-11-02'])
  })

  it('le décalage seul supprimé, le report garde sa date et les doses suivantes leur jour (N6)', () => {
    const pixel = carnet(weekly({ firstDueOn: '2026-10-09' }))
    const postponed = record(done(pixel, '2026-10-09'), '2026-10-15', {
      kind: 'postponed',
      due: due('2026-10-16'),
      to: '2026-10-19',
    })
    const shift = postponed.doses.find(({ status }) => status === 'shift')

    const schedule = scheduleOf(withoutDose(postponed, shift?.id ?? ''), '2026-10-15')

    expect(dueDays(schedule.upcoming(3))).toEqual(['2026-10-19', '2026-10-23', '2026-10-30'])
  })

  it('une prise notée après le report garde son échéance et fixe toujours la suite', () => {
    let book = done(carnet(weekly()), '2026-09-01')
    book = record(book, '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })
    const report = lastDose(book)
    book = done(book, '2026-09-12')

    const schedule = scheduleOf(withoutDose(book, report.id), '2026-09-20')

    expect(schedule.unloggedDoses).toEqual([due('2026-09-08')])
    expect(schedule.currentDoses).toEqual([due('2026-09-19')])
  })
})

describe('deux appareils (TR-25, RA-20)', () => {
  const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
  const given = stored({
    periodId: 'p1',
    dueOn: '2026-09-28',
    dueTime: '08:00',
    givenOn: '2026-09-28',
    status: 'given',
    nextDueDate: '2026-09-28',
  })
  const missed = stored({
    periodId: 'p1',
    dueOn: '2026-09-28',
    dueTime: '08:00',
    givenOn: null,
    status: 'missed',
    nextDueDate: '2026-09-28',
  })

  it('deux lignes d’une même échéance n’en font qu’une, la plus récemment modifiée gagne', () => {
    const later = { ...given, updatedAt: '2026-09-28T19:00:00.000Z' }

    expect(scheduleOf({ ...luna, doses: [given, missed] }, '2026-09-28').doses).toEqual([missed])
    expect(scheduleOf({ ...luna, doses: [later, missed] }, '2026-09-28').doses).toEqual([later])
  })

  it('deux prises d’un même jour à deux heures différentes restent deux prises', () => {
    const evening = stored({
      periodId: 'p1',
      dueOn: '2026-09-28',
      dueTime: '20:00',
      givenOn: '2026-09-28',
      status: 'given',
      nextDueDate: '2026-09-29',
    })
    const schedule = scheduleOf({ ...luna, doses: [evening, given] }, '2026-09-28')

    expect(schedule.doses).toEqual([given, evening])
    expect(schedule.currentDoses).toEqual([due('2026-09-29', '08:00')])
  })
})

describe('correction ou nouvelle période (TR-28, T4)', () => {
  const book = carnet(weekly())

  it('sans prise dans la période, une modification est une correction', () => {
    expect(scheduleOf(book, '2026-09-03').currentPeriodHasDose).toBe(false)
  })

  it.each([
    ['donnée', { kind: 'given', due: due('2026-09-01'), givenOn: '2026-09-03' }],
    ['oubliée', { kind: 'missed', due: due('2026-09-01') }],
    ['reportée', { kind: 'postponed', due: due('2026-09-01'), to: '2026-09-05' }],
  ] as const)('une prise %s ouvre une nouvelle période', (_, gesture) => {
    const schedule = scheduleOf(record(book, '2026-09-03', gesture), '2026-09-03')

    expect(schedule.currentPeriodHasDose).toBe(true)
    expect(schedule.currentPeriodId).toBe('p1')
  })

  it('les prises d’une période précédente ne comptent pas', () => {
    const previous = done(book, '2026-09-01')
    const changed = {
      ...previous,
      periods: [...previous.periods, weekly({ id: 'p2', firstDueOn: '2026-09-08' })],
    }

    expect(scheduleOf(changed, '2026-09-08').currentPeriodHasDose).toBe(false)
  })
})

describe('changement de rythme et arrêt (TR-28, TR-30, Q9)', () => {
  const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
  const changed: Carnet = {
    ...milo,
    periods: [
      period({
        id: 'p2',
        startsOn: '2026-09-29',
        firstDueOn: '2026-09-29',
        frequency: { value: 15, unit: 'day' },
      }),
      ...milo.periods,
    ],
  }

  it('les échéances de l’ancien rythme sans prise avant aujourd’hui restent à renseigner (Q7)', () => {
    const schedule = scheduleOf(changed, '2026-09-29')

    expect(schedule.unloggedDoses).toEqual([due('2026-09-15'), due('2026-09-22')])
    expect(schedule.currentDoses).toEqual([due('2026-09-29', null, 'p2')])
    expect(schedule.currentPeriodId).toBe('p2')
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-09-29', '2026-10-14'])
  })

  const daily = doneEachDay(
    carnet(period({ firstDueOn: '2026-09-20' })),
    '2026-09-20',
    '2026-09-25',
  )

  function stopped(book: Carnet, on: string): Carnet {
    return { ...book, periods: book.periods.map((p) => ({ ...p, stoppedOn: on })) }
  }

  it('l’arrêt retire la dose du jour non notée ; celles d’avant restent à renseigner', () => {
    const schedule = scheduleOf(stopped(daily, '2026-09-28'), '2026-09-28')

    expect(schedule.phase).toBe('stopped')
    expect(schedule.currentDoses).toEqual([])
    expect(schedule.nextDue).toBeNull()
    expect(schedule.upcoming(5)).toEqual([])
    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-09-26', '2026-09-27'])
  })

  it('plus aucune échéance après l’arrêt, même des jours plus tard', () => {
    const schedule = scheduleOf(stopped(daily, '2026-09-28'), '2026-10-02')

    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-09-26', '2026-09-27'])
    expect(schedule.upcoming(5)).toEqual([])
  })

  it('arrêté le lendemain (autre appareil en avance) : la dose du jour attend le lendemain pour être à renseigner', () => {
    const book = stopped(doneEachDay(daily, '2026-09-26', '2026-09-27'), '2026-09-29')

    const sameDay = scheduleOf(book, '2026-09-28')
    expect(sameDay.phase).toBe('stopped')
    expect(sameDay.currentDoses).toEqual([])
    expect(sameDay.unloggedDoses).toEqual([])
    expect(scheduleOf(book, '2026-09-29').unloggedDoses).toEqual([due('2026-09-28')])
  })

  it('la dose du jour notée avant l’arrêt reste au carnet', () => {
    const book = stopped(doneEachDay(daily, '2026-09-26', '2026-09-28'), '2026-09-28')
    const schedule = scheduleOf(book, '2026-09-28')

    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.doses.at(-1)).toMatchObject({ dueOn: '2026-09-28', status: 'given' })
  })

  it('une dose en retard au moment de l’arrêt reste à renseigner', () => {
    const book = doneEachDay(carnet(weekly()), '2026-09-01', '2026-09-01')
    const weeklyUntil15 = done(done(book, '2026-09-08'), '2026-09-15')
    expect(scheduleOf(weeklyUntil15, '2026-09-28').phase).toBe('overdue')

    const schedule = scheduleOf(stopped(weeklyUntil15, '2026-09-28'), '2026-09-28')

    expect(schedule.unloggedDoses).toEqual([due('2026-09-22')])
    expect(schedule.finished).toBe(false)
  })

  describe('arrêté avant sa date de début (#594)', () => {
    const future = carnet(period({ firstDueOn: '2026-10-07', stoppedOn: '2026-10-06' }))

    it.each(['2026-10-06', '2026-10-07', '2026-11-30'])(
      'aucune dose à renseigner ni à venir, le %s',
      (today) => {
        const schedule = scheduleOf(future, today)

        expect(schedule.phase).toBe('stopped')
        expect(schedule.currentDoses).toEqual([])
        expect(schedule.unloggedDoses).toEqual([])
        expect(schedule.upcoming(5)).toEqual([])
        expect(schedule.finished).toBe(true)
      },
    )

    it('repris ensuite, la période arrêtée avant son début ne laisse rien à renseigner', () => {
      const resumed: Carnet = {
        ...future,
        periods: [
          ...future.periods,
          period({ id: 'p2', firstDueOn: '2026-10-10', createdAt: '2026-10-08T08:00:00.000Z' }),
        ],
      }

      const schedule = scheduleOf(resumed, '2026-10-12')

      expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-10-10', '2026-10-11'])
      expect(schedule.unloggedDoses.every(({ periodId }) => periodId === 'p2')).toBe(true)
    })
  })
})

describe('terminé (TR-31)', () => {
  it('un arrêté qui a encore des doses à renseigner reste en cours ; renseigné, il est terminé', () => {
    let book = doneEachDay(carnet(period({ firstDueOn: '2026-09-20' })), '2026-09-20', '2026-09-25')
    book = { ...book, periods: book.periods.map((p) => ({ ...p, stoppedOn: '2026-09-28' })) }
    expect(scheduleOf(book, '2026-09-28').finished).toBe(false)

    for (const day of ['2026-09-26', '2026-09-27']) {
      book = record(book, '2026-09-28', { kind: 'given', due: due(day), givenOn: day })
    }

    const schedule = scheduleOf(book, '2026-09-28')
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.finished).toBe(true)
  })

  it('une prise notée en avance pour la dernière échéance le termine', () => {
    const book = done(
      carnet(
        period({
          firstDueOn: '2026-10-08',
          endsOn: '2026-10-10',
          frequency: { value: 2, unit: 'day' },
        }),
      ),
      '2026-10-08',
    )
    const inAdvance = record(book, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-10'),
      givenOn: '2026-10-09',
    })

    const schedule = scheduleOf(inAdvance, '2026-10-09')
    expect(schedule.phase).toBe('ended')
    expect(schedule.finished).toBe(true)
  })
})

describe('critères d’acceptation de la spec (§8)', () => {
  const lastOn2 = doneEachDay(carnet(period()), '2026-09-01', '2026-09-02')

  it('1. dernière prise le 2 sept., ouverte le 28 : dose du jour et 25 doses non renseignées', () => {
    const schedule = scheduleOf(lastOn2, '2026-09-28')

    expect(schedule.currentDoses).toEqual([due('2026-09-28')])
    expect(schedule.phase).toBe('today')
    expect(dueDays(schedule.unloggedDoses)).toEqual(days('2026-09-03', '2026-09-27'))
  })

  it('2. « C’est fait » : prochaine dose le 29, le bandeau reste', () => {
    const schedule = scheduleOf(done(lastOn2, '2026-09-28'), '2026-09-28')

    expect(schedule.currentDoses).toEqual([due('2026-09-29')])
    expect(schedule.phase).toBe('upcoming')
    expect(schedule.unloggedDoses).toHaveLength(25)
  })

  it('3. mensuel donné le 2 août puis le 28 sept. : rien à renseigner, prochaine dose le 28 oct.', () => {
    const book = done(
      done(carnet(monthly({ firstDueOn: '2026-08-02' })), '2026-08-02'),
      '2026-09-28',
    )
    const schedule = scheduleOf(book, '2026-09-28')

    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([due('2026-10-28')])
    expect(schedule.nextDue).toEqual(due('2026-10-28'))
  })

  it('4. « Choisir les jours » : 20 données et 5 oubliées, le bandeau disparaît ; « Annuler » le ramène', () => {
    const schedule = scheduleOf(lastOn2, '2026-09-28')
    const unchecked = new Set([
      '2026-09-05',
      '2026-09-10',
      '2026-09-11',
      '2026-09-20',
      '2026-09-27',
    ])
    const written = schedule.unloggedDoses.map((unlogged) =>
      stored(
        schedule.doseFor(
          unchecked.has(unlogged.dueOn)
            ? { kind: 'missed', due: unlogged }
            : { kind: 'given', due: unlogged, givenOn: unlogged.dueOn },
        ).dose,
      ),
    )
    const chosen = { ...lastOn2, doses: [...lastOn2.doses, ...written] }

    const after = scheduleOf(chosen, '2026-09-28')
    expect(written.filter((dose) => dose.status === 'missed')).toHaveLength(5)
    expect(after.unloggedDoses).toEqual([])
    expect(after.currentDoses).toEqual([due('2026-09-28')])
    expect(scheduleOf(lastOn2, '2026-09-28').unloggedDoses).toHaveLength(25)
  })

  it('5. fréquence changée entre deux prises : renseigner l’écart n’en crée pas d’autre et ne bouge pas la dose du moment', () => {
    let book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    book = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          startsOn: '2026-09-29',
          firstDueOn: '2026-09-29',
          frequency: { value: 15, unit: 'day' },
        }),
      ],
    }
    book = done(book, '2026-09-29')
    for (const day of ['2026-09-15', '2026-09-22']) {
      book = record(book, '2026-09-30', { kind: 'given', due: due(day), givenOn: day })
    }

    const schedule = scheduleOf(book, '2026-09-30')
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentDoses).toEqual([due('2026-10-14', null, 'p2')])
    expect(book.doses.filter((dose) => dose.periodId === 'p1')).toHaveLength(4)
  })

  it('6. première prise demain : rien de noté, prochaine dose demain', () => {
    const schedule = scheduleOf(carnet(period({ firstDueOn: '2026-09-29' })), '2026-09-28')

    expect(schedule.doses).toEqual([])
    expect(schedule.currentDoses).toEqual([due('2026-09-29')])
    expect(schedule.phase).toBe('upcoming')
  })

  it('7. date de fin au 10 oct., prise du 10 notée, rien à renseigner : terminé', () => {
    const book = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-08', endsOn: '2026-10-10' })),
      '2026-10-08',
      '2026-10-09',
    )
    const before = scheduleOf(book, '2026-10-10')
    expect(before.phase).toBe('today')
    expect(before.finished).toBe(false)

    const schedule = scheduleOf(done(book, '2026-10-10'), '2026-10-10')
    expect(schedule.phase).toBe('ended')
    expect(schedule.finished).toBe(true)
  })

  it('8. date de fin passée et deux doses non renseignées : à renseigner, hors des retards', () => {
    const book = done(
      carnet(period({ firstDueOn: '2026-10-08', endsOn: '2026-10-10' })),
      '2026-10-08',
    )
    const schedule = scheduleOf(book, '2026-10-12')

    expect(schedule.phase).toBe('ended')
    expect(schedule.unloggedDoses).toEqual([due('2026-10-09'), due('2026-10-10')])
    expect(schedule.finished).toBe(false)
  })

  it('9. avec des prises, changer la fréquence ouvre une période ; sans prise, c’est une correction', () => {
    expect(scheduleOf(lastOn2, '2026-09-28').currentPeriodHasDose).toBe(true)
    expect(scheduleOf(carnet(period()), '2026-09-28').currentPeriodHasDose).toBe(false)
  })

  it('10. « Reprendre » : nouvelle période, la période arrêtée reste intacte', () => {
    const stopped = {
      ...lastOn2,
      periods: [period({ stoppedOn: '2026-09-02' })],
    }
    const resumed = {
      ...stopped,
      periods: [...stopped.periods, period({ id: 'p2', firstDueOn: '2026-10-05' })],
    }
    const schedule = scheduleOf(resumed, '2026-10-01')

    expect(schedule.doses).toEqual(stopped.doses)
    expect(schedule.currentDoses).toEqual([due('2026-10-05', null, 'p2')])
    expect(schedule.unloggedDoses).toEqual([])
  })
})

describe('exemples du tableau des écarts', () => {
  it.each([
    [
      'quotidien, prises les 1er et 2',
      carnet(period()),
      ['2026-09-01', '2026-09-02'],
      days('2026-09-03', '2026-09-27'),
      '2026-09-28',
    ],
    [
      'quotidien, prises les 1er, 2 et 28',
      carnet(period()),
      ['2026-09-01', '2026-09-02', '2026-09-28'],
      days('2026-09-03', '2026-09-27'),
      '2026-09-29',
    ],
    [
      'mensuel, prises les 2 août et 28 sept.',
      carnet(monthly({ firstDueOn: '2026-08-02' })),
      ['2026-08-02', '2026-09-28'],
      [],
      '2026-10-28',
    ],
    [
      'mensuel, prise le 2 juil.',
      carnet(monthly({ firstDueOn: '2026-07-02' })),
      ['2026-07-02'],
      ['2026-08-02'],
      '2026-09-02',
    ],
    [
      'hebdomadaire, prise le 1er sept.',
      carnet(weekly()),
      ['2026-09-01'],
      ['2026-09-08', '2026-09-15'],
      '2026-09-22',
    ],
  ])('%s, le 28 sept.', (_, start, givenDays, unlogged, current) => {
    const book = givenDays.reduce((result, day) => done(result, day), start)
    const schedule = scheduleOf(book, '2026-09-28')

    expect(dueDays(schedule.unloggedDoses)).toEqual(unlogged)
    expect(dueDays(schedule.currentDoses)).toEqual([current])
  })
})

describe('déplacer la prochaine dose plus tôt ou plus tard (TR-9, Q17)', () => {
  const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
  const advanced = record(milo, '2026-09-13', {
    kind: 'postponed',
    due: due('2026-09-15'),
    to: '2026-09-14',
  })

  it('la dose avancée devient la prochaine dose', () => {
    const schedule = scheduleOf(advanced, '2026-09-13')

    expect(schedule.currentDoses).toEqual([due('2026-09-14')])
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-09-14', '2026-09-21'])
  })

  it('notée le jour même, la suite repart de cette prise', () => {
    const noted = done(advanced, '2026-09-14')

    expect(lastDose(noted)).toMatchObject({ dueOn: '2026-09-14', nextDueDate: '2026-09-21' })
    const schedule = scheduleOf(noted, '2026-09-14')
    expect(schedule.currentDoses).toEqual([due('2026-09-21')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('non notée, elle est en retard le lendemain, pas non renseignée', () => {
    const nextDay = scheduleOf(advanced, '2026-09-15')
    expect(nextDay.currentDoses).toEqual([due('2026-09-14')])
    expect(nextDay.phase).toBe('overdue')
    expect(nextDay.unloggedDoses).toEqual([])

    const nextWeek = scheduleOf(advanced, '2026-09-21')
    expect(nextWeek.currentDoses).toEqual([due('2026-09-21')])
    expect(nextWeek.unloggedDoses).toEqual([due('2026-09-14')])
  })

  it('une dose reportée puis avancée prend la dernière date choisie', () => {
    const postponed = record(milo, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-20',
    })
    const moved = record(postponed, '2026-09-16', {
      kind: 'postponed',
      due: due('2026-09-20'),
      to: '2026-09-18',
    })

    expect(scheduleOf(moved, '2026-09-16').currentDoses).toEqual([due('2026-09-18')])
    const late = scheduleOf(moved, '2026-09-19')
    expect(late.currentDoses).toEqual([due('2026-09-18')])
    expect(late.phase).toBe('overdue')
    expect(late.unloggedDoses).toEqual([])
  })

  it('une dose avancée deux fois prend la dernière date choisie', () => {
    const early = record(milo, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-14',
    })
    const earlier = record(early, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-14'),
      to: '2026-09-13',
    })

    expect(scheduleOf(earlier, '2026-09-12').currentDoses).toEqual([due('2026-09-13')])
    const late = scheduleOf(earlier, '2026-09-14')
    expect(late.currentDoses).toEqual([due('2026-09-13')])
    expect(late.unloggedDoses).toEqual([])
  })

  it('une dose avancée puis reportée prend la dernière date choisie', () => {
    const moved = record(advanced, '2026-09-14', {
      kind: 'postponed',
      due: due('2026-09-14'),
      to: '2026-09-17',
    })

    const schedule = scheduleOf(moved, '2026-09-14')
    expect(schedule.currentDoses).toEqual([due('2026-09-17')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('l’historique sait dire « Avancée » ou « Reportée »', () => {
    const postponed = record(milo, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-20',
    })

    expect(isAdvanced(lastDose(advanced))).toBe(true)
    expect(isAdvanced(lastDose(postponed))).toBe(false)
    expect(isAdvanced(lastDose(milo))).toBe(false)
  })

  it('une date passée est refusée', () => {
    expect(() => scheduleOf(milo, '2026-09-13').move(due('2026-09-15'), '2026-09-12')).toThrow(
      /date passée/,
    )
  })

  it('une prise déplacée après une dose déplacée deux fois dépasse sa ligne', () => {
    let book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-09')
    const september8 = lastDose(book)
    book = record(book, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-16'),
      to: '2026-09-20',
    })
    const line = lastDose(book)
    book = record(book, '2026-09-16', {
      kind: 'postponed',
      due: due('2026-09-20'),
      to: '2026-09-18',
    })
    const shift = book.doses.find(({ status, dueOn }) => status === 'shift' && dueOn === line.dueOn)

    expect(scheduleOf(book, '2026-09-20').redate(september8.id, '2026-09-19')).toMatchObject({
      dose: { nextDueDate: '2026-09-26' },
      postponement: { doseIds: [line.id, shift?.id], kept: false },
    })
  })
})

describe('déplacements successifs d’une même dose (TR-9, Q17, Q18)', () => {
  function moved(book: Carnet, today: string, from: string, to: string): Carnet {
    return record(book, today, { kind: 'postponed', due: due(from), to })
  }

  const daily = doneEachDay(carnet(period()), '2026-09-01', '2026-09-04')

  it('reportée au 7 puis ramenée au 6 : la suite repart du 6, le 7 reste une échéance', () => {
    const once = moved(daily, '2026-09-05', '2026-09-05', '2026-09-07')
    const book = moved(once, '2026-09-05', '2026-09-07', '2026-09-06')

    expect(dueDays(scheduleOf(book, '2026-09-05').upcoming(4))).toEqual(
      days('2026-09-06', '2026-09-09'),
    )
    const after6 = done(book, '2026-09-06')
    expect(scheduleOf(after6, '2026-09-06').currentDoses).toEqual([due('2026-09-07')])
    const after7 = done(after6, '2026-09-07')
    const schedule = scheduleOf(after7, '2026-09-07')
    expect(schedule.currentDoses).toEqual([due('2026-09-08')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('reportée au 9 puis ramenée au 7 : le 9 reste une échéance', () => {
    const once = moved(daily, '2026-09-05', '2026-09-05', '2026-09-09')
    const schedule = scheduleOf(moved(once, '2026-09-05', '2026-09-09', '2026-09-07'), '2026-09-11')

    expect(dueDays(schedule.unloggedDoses)).toEqual(days('2026-09-07', '2026-09-10'))
    expect(schedule.currentDoses).toEqual([due('2026-09-11')])
  })

  it('15 → 20 → 22 → 18 : le 21, rien de noté, la dose du 18 est en retard', () => {
    let book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    book = moved(book, '2026-09-13', '2026-09-15', '2026-09-20')
    book = moved(book, '2026-09-16', '2026-09-20', '2026-09-22')
    book = moved(book, '2026-09-17', '2026-09-22', '2026-09-18')
    const schedule = scheduleOf(book, '2026-09-21')

    expect(schedule.currentDoses).toEqual([due('2026-09-18')])
    expect(schedule.phase).toBe('overdue')
    expect(schedule.unloggedDoses).toEqual([])
  })
})

describe('une ligne par déplacement (Q18)', () => {
  const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')

  it('déplacer de nouveau réécrit la ligne : « Reportée au 18 sept. (prévue le 15 sept.) »', () => {
    const book = record(milo, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-20',
    })
    const line = lastDose(book)

    const shiftLine = book.doses.find(({ status }) => status === 'shift')
    expect(scheduleOf(book, '2026-09-16').move(due('2026-09-20'), '2026-09-18')).toEqual({
      report: {
        action: 'rewrite',
        dose: {
          periodId: 'p1',
          dueOn: '2026-09-15',
          dueTime: null,
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-09-18',
        },
        doseId: line.id,
      },
      shift: {
        action: 'rewrite',
        dose: {
          periodId: 'p1',
          dueOn: '2026-09-15',
          dueTime: null,
          givenOn: null,
          status: 'shift',
          nextDueDate: '2026-09-18',
        },
        doseId: shiftLine?.id,
      },
    })
    const again = record(book, '2026-09-16', {
      kind: 'postponed',
      due: due('2026-09-20'),
      to: '2026-09-18',
    })
    const moves = again.doses.filter((dose) => dose.status === 'postponed')
    expect(moves).toHaveLength(1)
    expect(isAdvanced(moves[0] ?? line)).toBe(false)
  })

  it('une dose avancée puis déplacée de nouveau garde sa ligne et son échéance d’origine', () => {
    let book = record(milo, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-14',
    })
    book = record(book, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-14'),
      to: '2026-09-13',
    })

    const moves = book.doses.filter((dose) => dose.status === 'postponed')
    expect(moves).toEqual([
      expect.objectContaining({ dueOn: '2026-09-15', nextDueDate: '2026-09-13' }),
    ])
    expect(isAdvanced(moves[0] ?? lastDose(book))).toBe(true)
  })

  it('après une dose avancée, « Fait à une autre date » vise la dose avancée', () => {
    const advanced = record(milo, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-14',
    })
    const schedule = scheduleOf(advanced, '2026-09-16')

    const target = schedule.dueForDate('2026-09-15')
    expect(target).toEqual(due('2026-09-14'))
    expect(
      schedule.doseFor({ kind: 'given', due: target ?? due('2026-09-14'), givenOn: '2026-09-15' }),
    ).toMatchObject({
      dose: { dueOn: '2026-09-14', givenOn: '2026-09-15', nextDueDate: '2026-09-22' },
      shift: { dueOn: '2026-09-15', status: 'shift', nextDueDate: '2026-09-15' },
    })
  })
})

describe('bornes de « Prochaine dose » (TR-9, Q17, Q20)', () => {
  it('quotidien, dose du jour donnée : la prochaine ne peut pas être avancée à aujourd’hui', () => {
    const book = doneEachDay(carnet(period()), '2026-09-01', '2026-09-05')
    const schedule = scheduleOf(book, '2026-09-05')

    expect(schedule.moveBounds(due('2026-09-06'))).toEqual({ earliest: '2026-09-06', latest: null })
    expect(() => schedule.move(due('2026-09-06'), '2026-09-05')).toThrow(/échéance précédente/)
  })

  it('quotidien, dose du jour pas encore donnée : la suivante ne peut pas venir aujourd’hui', () => {
    const book = doneEachDay(carnet(period()), '2026-09-01', '2026-09-04')
    const schedule = scheduleOf(book, '2026-09-05')

    expect(schedule.moveBounds(due('2026-09-06'))?.earliest).toBe('2026-09-06')
    expect(() => schedule.move(due('2026-09-06'), '2026-09-05')).toThrow(/échéance précédente/)
  })

  it('tous les 2 jours : pas le jour de l’échéance précédente, le lendemain oui', () => {
    const every2 = { value: 2, unit: 'day' } as const
    const book = done(done(carnet(period({ frequency: every2 })), '2026-09-01'), '2026-09-03')
    const schedule = scheduleOf(book, '2026-09-03')

    expect(schedule.moveBounds(due('2026-09-05'))?.earliest).toBe('2026-09-04')
    expect(() => schedule.move(due('2026-09-05'), '2026-09-03')).toThrow(/échéance précédente/)
    const advanced = record(book, '2026-09-03', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-04',
    })
    expect(dueDays(scheduleOf(advanced, '2026-09-03').upcoming(3))).toEqual([
      '2026-09-04',
      '2026-09-06',
      '2026-09-08',
    ])
  })

  it('à 8 h et 20 h, tout donné le 28 : la dose du 29 à 8 h ne peut pas venir le 28', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
    const schedule = scheduleOf(done(done(luna, '2026-09-28'), '2026-09-28'), '2026-09-28')

    expect(schedule.moveBounds(due('2026-09-29', '08:00'))?.earliest).toBe('2026-09-29')
    expect(() => schedule.move(due('2026-09-29', '08:00'), '2026-09-28')).toThrow(
      /échéance précédente/,
    )
  })

  it('déplacer à aujourd’hui est permis', () => {
    const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')

    expect(scheduleOf(milo, '2026-09-13').moveBounds(due('2026-09-15'))?.earliest).toBe(
      '2026-09-13',
    )
    const today = record(milo, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-13',
    })
    expect(scheduleOf(today, '2026-09-13').currentDoses).toEqual([due('2026-09-13')])
  })

  it('déplacer de nouveau une dose déplacée garde la borne de son échéance d’origine', () => {
    const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const advanced = record(milo, '2026-09-12', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-14',
    })

    expect(scheduleOf(advanced, '2026-09-12').moveBounds(due('2026-09-14'))?.earliest).toBe(
      '2026-09-12',
    )
  })

  it('pas au-delà de la date de fin (Q20) : le 10 permis, le 12 refusé', () => {
    const ending = doneEachDay(carnet(period({ endsOn: '2026-09-10' })), '2026-09-01', '2026-09-09')
    const schedule = scheduleOf(ending, '2026-09-09')

    expect(schedule.moveBounds(due('2026-09-10'))).toEqual({
      earliest: '2026-09-10',
      latest: '2026-09-10',
    })
    expect(() => schedule.move(due('2026-09-10'), '2026-09-12')).toThrow(/date de fin/)
    expect(schedule.move(due('2026-09-10'), '2026-09-10')).toEqual({
      report: { action: 'none' },
      shift: { action: 'none' },
    })
  })

  it('une échéance déjà notée ne se déplace pas', () => {
    const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')

    expect(() => scheduleOf(milo, '2026-09-10').move(due('2026-09-08'), '2026-09-12')).toThrow(
      /déjà notée/,
    )
  })
})

describe('plusieurs heures : « Prochaine dose » déplace la journée (TR-9, Q21)', () => {
  const metacam = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))

  it.each([
    ['8 h', '08:00'],
    ['20 h', '20:00'],
  ])(
    'rien noté le 28, déplacé au 30 depuis la dose de %s : le 28 part en entier, le 29 rien, le 30 ses deux heures',
    (_, time) => {
      const book = record(metacam, '2026-09-28', {
        kind: 'postponed',
        due: due('2026-09-28', time),
        to: '2026-09-30',
      })

      const moves = book.doses.filter((dose) => dose.status === 'postponed')
      expect(moves).toEqual([
        expect.objectContaining({
          dueOn: '2026-09-28',
          dueTime: '08:00',
          nextDueDate: '2026-09-30',
        }),
      ])
      const sameDay = scheduleOf(book, '2026-09-28')
      expect(sameDay.currentDoses).toEqual([due('2026-09-30', '08:00')])
      expect(sameDay.upcoming(3)).toEqual([
        due('2026-09-30', '08:00'),
        due('2026-09-30', '20:00'),
        due('2026-10-01', '08:00'),
      ])
      expect(scheduleOf(book, '2026-09-29').unloggedDoses).toEqual([])
    },
  )

  it('8 h notée le 28 : seule 20 h part, le 30 ne reçoit qu’elle (#735)', () => {
    const at8 = done(metacam, '2026-09-28')
    const book = record(at8, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '20:00'),
      to: '2026-09-30',
    })
    const schedule = scheduleOf(book, '2026-09-29')

    expect(schedule.doses).toEqual([
      expect.objectContaining({ dueTime: '08:00', status: 'given' }),
      expect.objectContaining({ dueTime: '20:00', status: 'shift', nextDueDate: '2026-09-30' }),
      expect.objectContaining({ dueTime: '20:00', status: 'postponed', nextDueDate: '2026-09-30' }),
    ])
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.upcoming(2)).toEqual([due('2026-09-30', '20:00'), due('2026-10-01', '08:00')])
  })

  it('avancer déplace aussi la journée : tous les 2 jours, le 5 avancé au 4', () => {
    const every2 = period({
      firstDueOn: '2026-09-03',
      frequency: { value: 2, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    const book = record(done(done(carnet(every2), '2026-09-03'), '2026-09-03'), '2026-09-04', {
      kind: 'postponed',
      due: due('2026-09-05', '08:00'),
      to: '2026-09-04',
    })
    const schedule = scheduleOf(book, '2026-09-04')

    expect(schedule.currentDoses).toEqual([due('2026-09-04', '08:00'), due('2026-09-04', '20:00')])
    expect(schedule.upcoming(4)).toEqual([
      due('2026-09-04', '08:00'),
      due('2026-09-04', '20:00'),
      due('2026-09-06', '08:00'),
      due('2026-09-06', '20:00'),
    ])
  })

  it('les bornes s’appliquent à la journée', () => {
    const yesterday = done(
      done(carnet(period({ firstDueOn: '2026-09-27', times: ['08:00', '20:00'] })), '2026-09-27'),
      '2026-09-27',
    )

    expect(
      scheduleOf(yesterday, '2026-09-28').moveBounds(due('2026-09-28', '20:00'))?.earliest,
    ).toBe('2026-09-28')
  })
})

describe('une dose remise à sa date d’origine reste à donner (TR-9)', () => {
  const milo = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')

  it.each([
    ['reportée au 20', '2026-09-20'],
    ['avancée au 14', '2026-09-14'],
  ])(
    '%s puis remise au 15 : la ligne du déplacement est supprimée, la dose du 15 revient',
    (_, to) => {
      const moved = record(milo, '2026-09-13', { kind: 'postponed', due: due('2026-09-15'), to })
      const line = lastDose(moved)
      const shiftLine = moved.doses.find(({ status }) => status === 'shift')

      expect(scheduleOf(moved, '2026-09-13').move(due(to), '2026-09-15')).toEqual({
        report: { action: 'delete', doseId: line.id },
        shift: { action: 'delete', doseId: shiftLine?.id },
      })
      const back = record(moved, '2026-09-13', {
        kind: 'postponed',
        due: due(to),
        to: '2026-09-15',
      })
      expect(back.doses).toEqual(milo.doses)
      const later = scheduleOf(back, '2026-09-16')
      expect(later.currentDoses).toEqual([due('2026-09-15')])
      expect(later.phase).toBe('overdue')
    },
  )

  it('à 8 h et 20 h, la journée du 28 déplacée au 30 puis remise au 28 retrouve ses deux heures', () => {
    const metacam = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
    const moved = record(metacam, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '08:00'),
      to: '2026-09-30',
    })
    const back = record(moved, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-30', '08:00'),
      to: '2026-09-28',
    })

    expect(back.doses).toEqual([])
    expect(scheduleOf(back, '2026-09-28').currentDoses).toEqual([
      due('2026-09-28', '08:00'),
      due('2026-09-28', '20:00'),
    ])
  })

  const ending = doneEachDay(carnet(period({ endsOn: '2026-09-10' })), '2026-09-01', '2026-09-09')

  it('fin le 10 : la dose du 10 « déplacée » au 10 n’écrit rien et reste à donner', () => {
    expect(scheduleOf(ending, '2026-09-09').move(due('2026-09-10'), '2026-09-10')).toEqual({
      report: { action: 'none' },
      shift: { action: 'none' },
    })
    const unchanged = record(ending, '2026-09-09', {
      kind: 'postponed',
      due: due('2026-09-10'),
      to: '2026-09-10',
    })
    const schedule = scheduleOf(unchanged, '2026-09-09')
    expect(schedule.currentDoses).toEqual([due('2026-09-10')])
    expect(schedule.finished).toBe(false)
  })

  it('une ligne « déplacée au jour même », venue d’ailleurs, est sans effet et hors de l’historique', () => {
    const neutral = storedMove(ending, '2026-09-10', '2026-09-10')
    const schedule = scheduleOf(neutral, '2026-09-09')

    expect(schedule.currentDoses).toEqual([due('2026-09-10')])
    expect(schedule.finished).toBe(false)
    expect(schedule.doses.map((dose) => dose.status)).not.toContain('postponed')
  })
})

describe('journée déplacée quand une heure est déjà notée (Q21)', () => {
  const metacam = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))

  it('journée du 28 déplacée au 30, 8 h donnée le 30, puis 20 h déplacée au 2 oct. : une nouvelle ligne, le 2 à 20 h seule (#735)', () => {
    let book = record(metacam, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '08:00'),
      to: '2026-09-30',
    })
    const first = lastDose(book)
    book = done(book, '2026-09-30')

    expect(
      scheduleOf(book, '2026-09-30').move(due('2026-09-30', '20:00'), '2026-10-02').report,
    ).toEqual({
      action: 'create',
      dose: expect.objectContaining({
        dueOn: '2026-09-30',
        dueTime: '20:00',
        nextDueDate: '2026-10-02',
      }),
    })
    book = record(book, '2026-09-30', {
      kind: 'postponed',
      due: due('2026-09-30', '20:00'),
      to: '2026-10-02',
    })
    expect(book.doses.find(({ id }) => id === first.id)).toEqual(first)
    const schedule = scheduleOf(book, '2026-10-01')
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.upcoming(2)).toEqual([due('2026-10-02', '20:00'), due('2026-10-03', '08:00')])
  })

  it('20 h notée avant 8 h le 28, puis 8 h déplacée au 30 : rien le 29, le 30 à 8 h seule (#735)', () => {
    let book = record(metacam, '2026-09-28', {
      kind: 'given',
      due: due('2026-09-28', '20:00'),
      givenOn: '2026-09-28',
    })
    book = record(book, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '08:00'),
      to: '2026-09-30',
    })
    const schedule = scheduleOf(book, '2026-09-29')

    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.upcoming(2)).toEqual([due('2026-09-30', '08:00'), due('2026-10-01', '08:00')])
  })
})

describe('bornes aux frontières d’une période (Q21, Q24)', () => {
  const luna = carnet(period({ firstDueOn: '2026-09-27', times: ['08:00', '20:00'] }))
  const changed: Carnet = {
    ...luna,
    periods: [
      ...luna.periods,
      period({
        id: 'p2',
        startsOn: '2026-09-28',
        firstDueOn: '2026-09-28',
        times: ['09:00', '21:00'],
      }),
    ],
  }
  const schedule = scheduleOf(changed, '2026-09-28')

  it('une dose non renseignée de l’ancien réglage ne se déplace pas', () => {
    expect(schedule.unloggedDoses).toEqual([due('2026-09-27', '08:00'), due('2026-09-27', '20:00')])
    expect(schedule.moveBounds(due('2026-09-27', '20:00'))).toBeNull()
    expect(() => schedule.move(due('2026-09-27', '20:00'), '2026-09-30')).toThrow(
      /ne se déplace pas/,
    )
  })

  it('la première dose du nouveau réglage ne vient pas avant le début de sa période', () => {
    const firstOfNew = due('2026-09-28', '09:00', 'p2')

    expect(schedule.moveBounds(firstOfNew)).toEqual({ earliest: '2026-09-28', latest: null })
  })
})

describe('contre-exemples trouvés par le test d’invariants', () => {
  it('à plusieurs heures, une prise donnée un autre jour ne refixe la suite que pour la dernière heure', () => {
    const threeTimes = period({
      firstDueOn: '2026-03-10',
      frequency: { value: 2, unit: 'week' },
      times: ['08:00', '14:00', '20:00'],
    })
    const book = record(carnet(threeTimes), '2026-03-10', {
      kind: 'given',
      due: due('2026-03-10', '08:00'),
      givenOn: '2026-03-04',
    })

    expect(lastDose(book).nextDueDate).toBe('2026-03-10')
    expect(scheduleOf(book, '2026-03-10').currentDoses).toEqual([
      due('2026-03-10', '14:00'),
      due('2026-03-10', '20:00'),
    ])
  })

  it('une dose ne s’avance pas au jour où la dernière prise a été donnée', () => {
    const twice = period({
      firstDueOn: '2026-03-07',
      frequency: { value: 2, unit: 'week' },
      times: ['08:00', '20:00'],
    })
    const book = record(done(carnet(twice), '2026-03-07'), '2026-03-08', {
      kind: 'given',
      due: due('2026-03-07', '20:00'),
      givenOn: '2026-03-08',
    })

    expect(scheduleOf(book, '2026-03-08').moveBounds(due('2026-03-22', '08:00'))?.earliest).toBe(
      '2026-03-09',
    )
  })

  it('une dose ne se déplace pas tant qu’une dose suivante porte un déplacement', () => {
    const book = record(carnet(weekly({ firstDueOn: '2026-04-04' })), '2026-04-11', {
      kind: 'postponed',
      due: due('2026-04-18'),
      to: '2026-04-17',
    })

    expect(scheduleOf(book, '2026-04-12').moveBounds(due('2026-04-11'))).toBeNull()
  })

  it('une nouvelle période ne commence pas avant celle qu’elle remplace', () => {
    const book = record(carnet(period({ firstDueOn: '2026-03-09' })), '2026-03-08', {
      kind: 'postponed',
      due: due('2026-03-09'),
      to: '2026-03-10',
    })

    expect(scheduleOf(book, '2026-03-08').newPeriod({ value: 1, unit: 'day' }, []).startsOn).toBe(
      '2026-03-09',
    )
  })

  it('une dose ne s’avance pas d’un intervalle entier : la suite retomberait sur son échéance d’origine', () => {
    const late = weekly({ startsOn: '2026-03-30', firstDueOn: '2026-04-06' })

    expect(scheduleOf(carnet(late), '2026-03-30').moveBounds(due('2026-04-06'))?.earliest).toBe(
      '2026-03-31',
    )
  })

  it('ni sur le jour d’origine d’un autre déplacement', () => {
    const every2 = period({ firstDueOn: '2026-03-22', frequency: { value: 2, unit: 'day' } })
    const book = record(carnet(every2), '2026-03-23', {
      kind: 'postponed',
      due: due('2026-03-24'),
      to: '2026-03-23',
    })

    expect(scheduleOf(book, '2026-03-23').moveBounds(due('2026-03-25'))?.earliest).toBe(
      '2026-03-25',
    )
  })

  it('une prise datée trop tôt ne refixe pas la suite sur l’échéance d’origine d’un déplacement', () => {
    const monthlyTwice = monthly({ firstDueOn: '2026-03-13', times: ['08:00', '20:00'] })
    let book = record(done(carnet(monthlyTwice), '2026-03-13'), '2026-03-15', {
      kind: 'given',
      due: due('2026-03-13', '20:00'),
      givenOn: '2026-03-15',
    })
    book = record(book, '2026-03-15', {
      kind: 'postponed',
      due: due('2026-04-15', '08:00'),
      to: '2026-03-16',
    })
    book = record(book, '2026-03-19', {
      kind: 'given',
      due: due('2026-03-16', '20:00'),
      givenOn: '2026-03-15',
    })

    expect(lastDose(book).nextDueDate).toBe('2026-04-16')
    expect(scheduleOf(book, '2026-03-19').currentDoses).toEqual([due('2026-03-16', '08:00')])
  })

  it('après une période précédente, la première dose ne s’avance pas non plus d’un intervalle entier', () => {
    const previous = done(
      done(carnet(weekly({ firstDueOn: '2026-03-16' })), '2026-03-16'),
      '2026-03-23',
    )
    const changed = {
      ...previous,
      periods: [
        ...previous.periods,
        weekly({ id: 'p2', startsOn: '2026-03-30', firstDueOn: '2026-04-06' }),
      ],
    }

    expect(
      scheduleOf(changed, '2026-03-30').moveBounds(due('2026-04-06', null, 'p2'))?.earliest,
    ).toBe('2026-03-31')
  })

  it('une dose se déplace au plus tôt au lendemain de la dernière prise notée, par sa date réelle', () => {
    const book = record(carnet(weekly()), '2026-09-10', {
      kind: 'given',
      due: due('2026-09-01'),
      givenOn: '2026-09-10',
    })

    expect(lastDose(book).nextDueDate).toBe('2026-09-08')
    expect(scheduleOf(book, '2026-09-10').moveBounds(due('2026-09-08'))?.earliest).toBe(
      '2026-09-11',
    )
  })

  it('à plusieurs heures, la suite ne repart de la date réelle que quand la journée est complète', () => {
    const twice = period({
      firstDueOn: '2026-03-08',
      frequency: { value: 2, unit: 'week' },
      times: ['08:00', '20:00'],
    })
    let book = record(carnet(twice), '2026-03-10', {
      kind: 'given',
      due: due('2026-03-08', '20:00'),
      givenOn: '2026-03-09',
    })
    expect(lastDose(book).nextDueDate).toBe('2026-03-22')

    book = record(book, '2026-03-10', {
      kind: 'given',
      due: due('2026-03-08', '08:00'),
      givenOn: '2026-03-08',
    })
    expect(scheduleOf(book, '2026-03-10').currentDoses).toEqual([due('2026-03-22', '08:00')])
  })

  it('une prise datée plus d’un intervalle avant son échéance ne change pas le calendrier', () => {
    const book = record(done(carnet(weekly()), '2026-09-01'), '2026-09-02', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-08-27',
    })

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ status: 'extra', nextDueDate: '2026-09-08' }),
    )
    expect(scheduleOf(book, '2026-09-02').currentDoses).toEqual([due('2026-09-08')])
  })

  it('une prise redatée garde le déplacement qui la suit en le rattachant à la dose qu’elle fixe', () => {
    let book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const september8 = lastDose(book)
    book = record(book, '2026-09-09', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-10',
    })
    const moved = lastDose(book)

    const movedShift = book.doses.find(({ status }) => status === 'shift')

    expect(scheduleOf(book, '2026-09-09').redate(september8.id, '2026-09-04')).toEqual({
      dose: expect.objectContaining({ givenOn: '2026-09-04', nextDueDate: '2026-09-10' }),
      shift: {
        action: 'create',
        dose: expect.objectContaining({ dueOn: '2026-09-08', nextDueDate: '2026-09-04' }),
      },
      postponement: {
        doseIds: [moved.id],
        kept: true,
        line: expect.objectContaining({ dueOn: '2026-09-11', nextDueDate: '2026-09-10' }),
        shiftIds: [movedShift?.id],
        shiftLine: expect.objectContaining({
          dueOn: '2026-09-11',
          status: 'shift',
          nextDueDate: '2026-09-10',
        }),
      },
    })
    expect(
      scheduleOf(redate(book, '2026-09-09', september8.id, '2026-09-04'), '2026-09-09')
        .currentDoses,
    ).toEqual([due('2026-09-10')])
  })
})

describe('réglage changé en cours de journée : le nouveau réglage vaut tout de suite (TR-28, Q24)', () => {
  const daily = { value: 1, unit: 'day' } as const
  const luna = carnet(period({ firstDueOn: '2026-09-27', times: ['08:00', '20:00'] }))
  const before = done(done(luna, '2026-09-27'), '2026-09-27')
  const at8 = done(before, '2026-09-28')

  function changedTo(book: Carnet, times: string[]): Carnet {
    const dates = scheduleOf(book, '2026-09-28').newPeriod(daily, times)
    const p2 = period({ id: 'p2', ...dates, times, createdAt: '2026-09-28T10:00:00.000Z' })
    return { ...book, periods: [...book.periods, p2] }
  }
  const leftToday = (book: Carnet) =>
    scheduleOf(book, '2026-09-28')
      .currentDoses.filter(({ dueOn }) => dueOn === '2026-09-28')
      .map(({ dueTime }) => dueTime)

  it('la nouvelle période commence aujourd’hui, même après une prise du jour', () => {
    expect(scheduleOf(at8, '2026-09-28').newPeriod(daily, ['09:00', '21:00'])).toEqual({
      startsOn: '2026-09-28',
      firstDueOn: '2026-09-28',
      referenceOn: '2026-09-28',
    })
  })

  it('8 h notée, nouveau réglage 9 h et 21 h : reste 21 h', () => {
    const changed = changedTo(at8, ['09:00', '21:00'])

    expect(leftToday(changed)).toEqual(['21:00'])
    expect(scheduleOf(changed, '2026-09-28').upcoming(3)).toEqual([
      due('2026-09-28', '21:00', 'p2'),
      due('2026-09-29', '09:00', 'p2'),
      due('2026-09-29', '21:00', 'p2'),
    ])
  })

  it('les premières heures sont les plus tôt, quel que soit l’ordre de saisie', () => {
    expect(leftToday(changedTo(at8, ['21:00', '09:00']))).toEqual(['21:00'])
  })

  it('8 h notée, nouveau réglage 8 h, 14 h et 20 h : restent 14 h et 20 h', () => {
    expect(leftToday(changedTo(at8, ['08:00', '14:00', '20:00']))).toEqual(['14:00', '20:00'])
  })

  it('8 h notée, nouveau réglage 9 h seule : rien ne reste aujourd’hui', () => {
    const dates = scheduleOf(at8, '2026-09-28').newPeriod(daily, ['09:00'])
    expect(dates).toEqual({
      startsOn: '2026-09-28',
      firstDueOn: '2026-09-29',
      referenceOn: '2026-09-29',
    })

    const schedule = scheduleOf(changedTo(at8, ['09:00']), '2026-09-28')
    expect(schedule.currentDoses).toEqual([due('2026-09-29', '09:00', 'p2')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('rien noté, nouveau réglage 9 h et 21 h : 9 h et 21 h', () => {
    const changed = changedTo(before, ['09:00', '21:00'])

    expect(leftToday(changed)).toEqual(['09:00', '21:00'])
    expect(scheduleOf(changed, '2026-09-28').phase).toBe('today')
  })

  it('il ne reste aucune dose de l’ancien réglage aujourd’hui', () => {
    const schedule = scheduleOf(changedTo(at8, ['09:00', '21:00']), '2026-09-28')

    expect(() => schedule.doseFor({ kind: 'missed', due: due('2026-09-28', '20:00') })).toThrow(
      /inconnue/,
    )
  })

  it('les échéances de l’ancien réglage des jours d’avant restent à renseigner', () => {
    const schedule = scheduleOf(
      changedTo(done(luna, '2026-09-27'), ['09:00', '21:00']),
      '2026-09-28',
    )

    expect(schedule.unloggedDoses).toEqual([due('2026-09-27', '20:00')])
  })

  it('une seconde prise notée dans le nouveau réglage compte au changement suivant', () => {
    const second = done(changedTo(at8, ['09:00', '21:00']), '2026-09-28')
    const dates = scheduleOf(second, '2026-09-28').newPeriod(daily, ['08:00', '14:00', '20:00'])
    const third: Carnet = {
      ...second,
      periods: [
        ...second.periods,
        period({
          id: 'p3',
          ...dates,
          times: ['08:00', '14:00', '20:00'],
          createdAt: '2026-09-28T22:00:00.000Z',
        }),
      ],
    }

    expect(scheduleOf(third, '2026-09-28').currentDoses).toEqual([due('2026-09-28', '20:00', 'p3')])
  })

  it('une reprise après un arrêt garde sa première prise du jour', () => {
    const stopped: Carnet = {
      ...at8,
      periods: [
        ...at8.periods.map((old) => ({ ...old, stoppedOn: '2026-09-28' })),
        period({
          id: 'p2',
          startsOn: '2026-09-28',
          firstDueOn: '2026-09-28',
          times: ['09:00'],
          createdAt: '2026-09-28T10:00:00.000Z',
        }),
      ],
    }

    expect(scheduleOf(stopped, '2026-09-28').currentDoses).toEqual([
      due('2026-09-28', '09:00', 'p2'),
    ])
  })

  it('à une prise par jour, la prochaine dose reste la dernière prise plus la fréquence', () => {
    const milo = done(carnet(weekly()), '2026-09-01')

    expect(scheduleOf(milo, '2026-09-01').newPeriod({ value: 15, unit: 'day' }, [])).toEqual({
      startsOn: '2026-09-01',
      firstDueOn: '2026-09-16',
      referenceOn: '2026-09-16',
    })
  })
})

describe('une dose ramenée au jour de sa ligne, quand ce jour n’est plus une échéance (N13)', () => {
  it('hebdomadaire : la ligne repart de l’échéance réellement remplacée, la prise suivante est à une semaine', () => {
    let book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const on8 = lastDose(book)
    book = record(book, '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-20',
    })
    book = redate(book, '2026-09-10', on8.id, '2026-09-10')
    const line = book.doses.find(({ status }) => status === 'postponed')

    expect(scheduleOf(book, '2026-09-10').move(due('2026-09-20'), '2026-09-15').report).toEqual({
      action: 'rewrite',
      doseId: line?.id,
      dose: {
        periodId: 'p1',
        dueOn: '2026-09-17',
        dueTime: null,
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-09-15',
      },
    })

    book = record(book, '2026-09-10', {
      kind: 'postponed',
      due: due('2026-09-20'),
      to: '2026-09-15',
    })
    book = done(book, '2026-09-15')
    expect(lastDose(book)).toMatchObject({ dueOn: '2026-09-15', nextDueDate: '2026-09-22' })
    expect(scheduleOf(book, '2026-09-15').upcoming(2)).toEqual([
      due('2026-09-22'),
      due('2026-09-29'),
    ])
  })

  it('à 8 h, 14 h et 20 h (graine 7613) : une heure donnée, les deux autres restent en retard', () => {
    const times = ['08:00', '14:00', '20:00']
    let book = carnet(weekly({ firstDueOn: '2026-03-24', times }))
    for (const time of ['14:00', '08:00']) {
      book = record(book, '2026-03-27', {
        kind: 'given',
        due: due('2026-03-24', time),
        givenOn: '2026-03-24',
      })
    }
    book = record(book, '2026-03-27', {
      kind: 'postponed',
      due: due('2026-03-31', '08:00'),
      to: '2026-04-24',
    })
    book = record(book, '2026-03-27', {
      kind: 'given',
      due: due('2026-03-24', '20:00'),
      givenOn: '2026-03-25',
    })
    book = record(book, '2026-03-27', {
      kind: 'postponed',
      due: due('2026-04-24', '08:00'),
      to: '2026-03-31',
    })
    const day31 = times.map((time) => due('2026-03-31', time))
    expect(scheduleOf(book, '2026-04-04').currentDoses).toEqual(day31)

    book = record(book, '2026-04-04', {
      kind: 'given',
      due: due('2026-03-31', '14:00'),
      givenOn: '2026-04-04',
    })
    expect(scheduleOf(book, '2026-04-04').currentDoses).toEqual([
      due('2026-03-31', '08:00'),
      due('2026-03-31', '20:00'),
    ])
  })

  it('une ligne « jour → même jour » venue d’ailleurs est sans effet, même hors de la suite', () => {
    let book = done(carnet(weekly()), '2026-09-03')
    book = storedMove(book, '2026-09-08', '2026-09-08')

    const schedule = scheduleOf(book, '2026-09-04')
    expect(schedule.staleDoseIds).toEqual([lastDose(book).id])
    expect(schedule.currentDoses).toEqual([due('2026-09-10')])
  })
})

describe('nouvelle période après une dose renseignée tard (N14, Q8, Q24)', () => {
  const daily = { value: 1, unit: 'day' } as const

  it('Panacur à 20 h : la dose du 6 notée le 7, posologie changée le 7 → la dose du 7 reste', () => {
    let book = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-01', times: ['20:00'] })),
      '2026-10-01',
      '2026-10-05',
    )
    book = record(book, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-06', '20:00'),
      givenOn: '2026-10-07',
    })
    expect(scheduleOf(book, '2026-10-07').currentDoses).toEqual([due('2026-10-07', '20:00')])

    expect(scheduleOf(book, '2026-10-07').newPeriod(daily, ['20:00'])).toEqual({
      startsOn: '2026-10-07',
      firstDueOn: '2026-10-07',
      referenceOn: '2026-10-07',
    })
  })

  it('fréquence changée après une dose renseignée tard : la suite part de son échéance, pas de sa date', () => {
    let book = done(carnet(weekly()), '2026-09-01')
    book = record(book, '2026-09-17', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-09-10',
    })
    expect(scheduleOf(book, '2026-09-17').currentDoses).toEqual([due('2026-09-15')])

    expect(scheduleOf(book, '2026-09-17').newPeriod({ value: 10, unit: 'day' }, [])).toEqual({
      startsOn: '2026-09-17',
      firstDueOn: '2026-09-18',
      referenceOn: '2026-09-18',
    })
  })

  it('à 8 h et 20 h : la dose du 27 à 20 h notée le 28, heures changées le 28 → les deux heures du 28', () => {
    let book = carnet(period({ firstDueOn: '2026-09-27', times: ['08:00', '20:00'] }))
    book = done(book, '2026-09-27')
    book = record(book, '2026-09-28', {
      kind: 'given',
      due: due('2026-09-27', '20:00'),
      givenOn: '2026-09-28',
    })
    const dates = scheduleOf(book, '2026-09-28').newPeriod(daily, ['09:00', '21:00'])
    expect(dates).toEqual({
      startsOn: '2026-09-28',
      firstDueOn: '2026-09-28',
      referenceOn: '2026-09-28',
    })

    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          ...dates,
          times: ['09:00', '21:00'],
          createdAt: '2026-09-28T10:00:00Z',
        }),
      ],
    }
    expect(scheduleOf(changed, '2026-09-28').currentDoses).toEqual([
      due('2026-09-28', '09:00', 'p2'),
      due('2026-09-28', '21:00', 'p2'),
    ])
  })

  it('même rythme, dose du jour sans prise et dose suivante déjà déplacée : la dose du jour reste', () => {
    let book = carnet(weekly({ firstDueOn: '2026-04-01' }))
    book = done(book, '2026-04-01')
    book = record(book, '2026-04-08', {
      kind: 'postponed',
      due: due('2026-04-15'),
      to: '2026-04-13',
    })

    const dates = scheduleOf(book, '2026-04-08').newPeriod({ value: 1, unit: 'week' }, [])
    expect(dates).toEqual({
      startsOn: '2026-04-08',
      firstDueOn: '2026-04-08',
      referenceOn: '2026-04-13',
    })
    const changed = withPeriod(book, { ...dates, frequency: { value: 1, unit: 'week' }, times: [] })
    expect(dueDays(scheduleOf(changed, '2026-04-08').upcoming(3))).toEqual([
      '2026-04-08',
      '2026-04-13',
      '2026-04-20',
    ])
  })

  it('des heures en double sont refusées', () => {
    expect(() =>
      scheduleOf(carnet(weekly()), '2026-09-01').newPeriod(daily, ['08:00', '08:00']),
    ).toThrow(/heures/)
  })
})

describe('pourquoi une dose ne se déplace pas, et quel chemin prend « Prochaine dose »', () => {
  it('dose d’une période précédente', () => {
    const luna = carnet(
      period({ firstDueOn: '2026-09-27' }),
      period({ id: 'p2', firstDueOn: '2026-09-28', createdAt: '2026-09-28T10:00:00Z' }),
    )

    expect(scheduleOf(luna, '2026-09-28').moveRefusal(due('2026-09-27'))).toBe('previous-period')
  })

  it('aucune date possible avant la date de fin', () => {
    const book = record(carnet(period({ endsOn: '2026-09-03' })), '2026-09-03', {
      kind: 'given',
      due: due('2026-09-02'),
      givenOn: '2026-09-03',
    })

    expect(scheduleOf(book, '2026-09-03').moveRefusal(due('2026-09-03'))).toBe('no-date-left')
  })

  it('une dose qui se déplace n’a pas de refus', () => {
    expect(scheduleOf(carnet(weekly()), '2026-09-01').moveRefusal(due('2026-09-01'))).toBeNull()
  })

  it('sans prise dans la période, « Prochaine dose » corrige la première échéance ; ensuite elle déplace', () => {
    const fresh = carnet(weekly())

    expect(scheduleOf(fresh, '2026-09-01').nextDoseChange).toBe('correction')
    expect(scheduleOf(done(fresh, '2026-09-01'), '2026-09-01').nextDoseChange).toBe('move')
  })

  it('un traitement arrêté n’a plus de prochaine dose à changer', () => {
    const stopped = carnet(weekly({ stoppedOn: '2026-09-03' }))

    expect(scheduleOf(stopped, '2026-09-04').nextDoseChange).toBeNull()
  })

  it('la date minimale n’est jamais avant le début de la période', () => {
    const book = carnet(weekly({ startsOn: '2026-09-20', firstDueOn: '2026-09-22' }))

    expect(scheduleOf(book, '2026-09-10').moveBounds(due('2026-09-22'))?.earliest).toBe(
      '2026-09-20',
    )
  })
})

describe('une prise oubliée le jour du changement compte comme une prise (Q24)', () => {
  it('8 h notée oubliée, nouveau réglage 9 h et 21 h : reste 21 h', () => {
    const daily = { value: 1, unit: 'day' } as const
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
    const missed = record(luna, '2026-09-28', { kind: 'missed', due: due('2026-09-28', '08:00') })
    const dates = scheduleOf(missed, '2026-09-28').newPeriod(daily, ['09:00', '21:00'])
    const changed: Carnet = {
      ...missed,
      periods: [
        ...missed.periods,
        period({
          id: 'p2',
          ...dates,
          times: ['09:00', '21:00'],
          createdAt: '2026-09-28T10:00:00Z',
        }),
      ],
    }

    expect(dates.firstDueOn).toBe('2026-09-28')
    expect(scheduleOf(changed, '2026-09-28').currentDoses).toEqual([
      due('2026-09-28', '21:00', 'p2'),
    ])
  })
})

describe('une prise supprimée devant un déplacement rend son échéance (TR-26)', () => {
  it('tous les 2 jours : la dose du 23 donnée le 22, celle du 24 reportée au 26, prise supprimée → le 23 revient', () => {
    const everyTwoDays = period({ firstDueOn: '2026-09-23', frequency: { value: 2, unit: 'day' } })
    let book = record(carnet(everyTwoDays), '2026-09-22', {
      kind: 'given',
      due: due('2026-09-23'),
      givenOn: '2026-09-22',
    })
    const prise = lastDose(book)
    book = record(book, '2026-09-22', {
      kind: 'postponed',
      due: due('2026-09-24'),
      to: '2026-09-26',
    })

    const schedule = scheduleOf(withoutDose(book, prise.id), '2026-09-24')
    expect(schedule.unloggedDoses).toEqual([due('2026-09-23')])
    expect(schedule.currentDoses).toEqual([due('2026-09-26')])
  })

  it('à 8 h et 20 h (graine 7273) : la journée dont les prises sont supprimées revient entière', () => {
    const twice = period({
      firstDueOn: '2026-04-10',
      frequency: { value: 3, unit: 'day' },
      times: ['08:00', '20:00'],
    })
    let book = done(done(carnet(twice), '2026-04-08'), '2026-04-08')
    const prises = book.doses.map(({ id }) => id)
    book = record(book, '2026-04-12', {
      kind: 'postponed',
      due: due('2026-04-11', '08:00'),
      to: '2026-04-14',
    })
    book = done(book, '2026-04-14')
    book = prises.reduce(withoutDose, book)

    expect(scheduleOf(book, '2026-04-14').unloggedDoses).toEqual([
      due('2026-04-10', '08:00'),
      due('2026-04-10', '20:00'),
    ])
  })
})

describe('contre-exemples de la campagne longue', () => {
  it('en mois, une dose ne s’avance pas au jour d’où un mois retombe sur elle (graine 2071)', () => {
    const book = carnet(monthly({ startsOn: '2026-03-31', firstDueOn: '2026-04-30' }))

    expect(scheduleOf(book, '2026-03-31').moveBounds(due('2026-04-30'))?.earliest).toBe(
      '2026-04-01',
    )
  })

  it('une reprise garde sa première prise même après un réglage changé puis arrêté le même jour (graine 335)', () => {
    const today = '2026-03-28'
    const first = done(carnet(period({ firstDueOn: today })), today)
    const book: Carnet = {
      ...first,
      periods: [
        ...first.periods,
        period({
          id: 'p2',
          firstDueOn: today,
          stoppedOn: today,
          createdAt: '2026-08-02T10:00:00Z',
        }),
        period({ id: 'p3', firstDueOn: today, createdAt: '2026-08-03T11:00:00Z' }),
      ],
    }

    expect(scheduleOf(book, today).currentDoses).toEqual([due(today, null, 'p3')])
  })

  it('corriger une prise ne touche pas un déplacement qui ne la suit pas directement (graine 19516)', () => {
    const everyTwoDays = period({
      firstDueOn: '2026-04-08',
      frequency: { value: 2, unit: 'day' },
      times: ['20:00'],
    })
    let book = record(carnet(everyTwoDays), '2026-04-07', {
      kind: 'given',
      due: due('2026-04-08', '20:00'),
      givenOn: '2026-04-07',
    })
    const prise = lastDose(book)
    book = record(book, '2026-04-11', {
      kind: 'postponed',
      due: due('2026-04-13', '20:00'),
      to: '2026-04-12',
    })

    expect(scheduleOf(book, '2026-04-11').redate(prise.id, '2026-04-07').postponement).toBeNull()
    const after = scheduleOf(redate(book, '2026-04-11', prise.id, '2026-04-07'), '2026-04-11')
    expect(after.unloggedDoses).toEqual([due('2026-04-09', '20:00')])
    expect(after.currentDoses).toEqual([due('2026-04-11', '20:00')])
  })

  it('corriger une prise ne rattache pas un déplacement suivi d’une autre ligne (graine 906391)', () => {
    const sixWeeks = period({ firstDueOn: '2026-03-28', frequency: { value: 6, unit: 'week' } })
    const today = '2026-03-30'
    let book = record(carnet(sixWeeks), today, {
      kind: 'given',
      due: due('2026-03-28'),
      givenOn: '2026-03-25',
    })
    const first = lastDose(book)
    book = record(book, today, { kind: 'postponed', due: due('2026-05-06'), to: '2026-04-04' })
    book = record(book, today, { kind: 'given', due: due('2026-04-04'), givenOn: today })
    const arrival = lastDose(book)
    book = redate(book, today, arrival.id, '2026-03-28')
    book = record(book, today, { kind: 'given', due: due('2026-05-09'), givenOn: today })
    book = withoutDose(redate(book, today, arrival.id, '2026-03-26'), arrival.id)
    book = redate(book, today, first.id, today)

    const schedule = scheduleOf(book, today)
    const lines = new Set(
      schedule.doses.filter(({ status }) => status !== 'shift').map(({ dueOn }) => dueOn),
    )
    expect(schedule.upcoming(6).filter(({ dueOn }) => lines.has(dueOn))).toEqual([])
  })

  it('ramenée à un jour que la suite n’atteint plus avant la date de fin, la dose y reste à donner (graine 21753)', () => {
    const sixWeeks = period({
      firstDueOn: '2026-03-06',
      endsOn: '2026-04-12',
      frequency: { value: 6, unit: 'week' },
      times: ['20:00'],
    })
    const move = (book: Carnet, today: string, from: string, to: string) =>
      record(book, today, { kind: 'postponed', due: due(from, '20:00'), to })
    let book = move(carnet(sixWeeks), '2026-03-06', '2026-03-06', '2026-03-16')
    book = done(book, '2026-03-06')
    const prise = lastDose(book)
    book = redate(book, '2026-03-06', prise.id, '2026-03-01')
    book = move(book, '2026-03-08', '2026-04-12', '2026-04-01')
    book = move(book, '2026-03-10', '2026-04-01', '2026-03-29')
    book = record(withoutDose(book, prise.id), '2026-03-14', {
      kind: 'given',
      due: due('2026-03-16', '20:00'),
      givenOn: '2026-03-14',
    })
    book = move(book, '2026-03-14', '2026-03-29', '2026-04-12')

    expect(scheduleOf(book, '2026-03-14').upcoming(2)).toEqual([due('2026-04-12', '20:00')])
  })
})

describe('une seule ligne de déplacement par journée d’origine (Q21, N16, graine 502482)', () => {
  const times = ['06:00', '12:00', '18:00', '23:00']
  const morning = done(carnet(period({ firstDueOn: '2026-04-02' })), '2026-04-02')
  const prise = lastDose(morning)
  const changed: Carnet = {
    ...morning,
    periods: [
      ...morning.periods,
      period({ id: 'p2', firstDueOn: '2026-04-02', times, createdAt: '2026-08-02T08:00:00.000Z' }),
    ],
  }
  const day = (dueOn: string) => times.map((time) => due(dueOn, time, 'p2'))
  const move = (book: Carnet, today: string, from: Due, to: string) =>
    record(book, today, { kind: 'postponed', due: from, to })
  const toThe7th = move(changed, '2026-04-02', due('2026-04-02', '12:00', 'p2'), '2026-04-07')
  const returned = withoutDose(toThe7th, prise.id)

  it('la laisser à sa date ne change rien', () => {
    expect(
      scheduleOf(returned, '2026-04-02').move(due('2026-04-02', '06:00', 'p2'), '2026-04-02'),
    ).toEqual({ report: { action: 'none' }, shift: { action: 'none' } })
  })

  it('la prise du matin supprimée, redéplacer la journée réécrit sa ligne au lieu d’en créer une', () => {
    const line = lastDose(toThe7th)

    expect(
      scheduleOf(returned, '2026-04-02').move(due('2026-04-02', '06:00', 'p2'), '2026-04-05')
        .report,
    ).toEqual({
      action: 'rewrite',
      doseId: line.id,
      dose: expect.objectContaining({
        dueOn: '2026-04-02',
        dueTime: '06:00',
        nextDueDate: '2026-04-05',
      }),
    })
  })

  it('déplacer ensuite la dose suivante laisse les doses non renseignées d’avant', () => {
    const toThe5th = move(returned, '2026-04-02', due('2026-04-02', '06:00', 'p2'), '2026-04-05')
    expect(toThe5th.doses.filter(({ status }) => status === 'postponed')).toHaveLength(1)
    const on6 = scheduleOf(toThe5th, '2026-04-06')
    expect(on6.unloggedDoses).toEqual(day('2026-04-05'))
    expect(on6.currentDoses).toEqual(day('2026-04-06'))

    expect(() => on6.move(due('2026-04-07', '06:00', 'p2'), '2026-04-06')).toThrow(
      /échéance précédente/,
    )
  })

  describe('deux lignes déjà en base pour la même journée (synchro)', () => {
    const secondShift = stored({
      ...due('2026-04-02', '06:00', 'p2'),
      givenOn: null,
      status: 'shift',
      nextDueDate: '2026-04-05',
    })
    const second = stored({
      ...due('2026-04-02', '06:00', 'p2'),
      givenOn: null,
      status: 'postponed',
      nextDueDate: '2026-04-05',
    })
    const doubled = { ...returned, doses: [...returned.doses, secondShift, second] }

    it('la plus récente est en vigueur, l’autre est sans effet', () => {
      const schedule = scheduleOf(doubled, '2026-04-06')
      const firstShift = toThe7th.doses.find(({ status }) => status === 'shift')

      expect(schedule.staleDoseIds).toEqual([lastDose(toThe7th).id, firstShift?.id])
      expect(schedule.unloggedDoses).toEqual(day('2026-04-05'))
      expect(schedule.currentDoses).toEqual(day('2026-04-06'))
    })

    it('la journée d’arrivée de la ligne sans effet, devenue dose du moment, se déplace comme une autre', () => {
      const on7 = scheduleOf(doubled, '2026-04-07')
      expect(on7.currentDoses).toEqual(day('2026-04-07'))

      const moved = on7.move(due('2026-04-07', '06:00', 'p2'), '2026-04-09')
      expect(moved.report).toEqual({
        action: 'create',
        dose: expect.objectContaining({
          dueOn: '2026-04-07',
          dueTime: '06:00',
          nextDueDate: '2026-04-09',
        }),
      })
      const after = move(doubled, '2026-04-07', due('2026-04-07', '06:00', 'p2'), '2026-04-09')
      expect(scheduleOf(after, '2026-04-07').unloggedDoses).toEqual([
        ...day('2026-04-05'),
        ...day('2026-04-06'),
      ])
    })
  })
})

describe('un déplacement dont la dose d’arrivée est notée fait partie de l’historique (TR-24, Q25)', () => {
  const moved = record(done(done(carnet(weekly()), '2026-09-01'), '2026-09-08'), '2026-09-09', {
    kind: 'postponed',
    due: due('2026-09-15'),
    to: '2026-09-20',
  })
  const line = lastDose(moved)

  it('tant que la dose d’arrivée est sans prise, la ligne se supprime et se redate', () => {
    const schedule = scheduleOf(moved, '2026-09-09')

    expect(schedule.lockedMoveIds).toEqual([])
    expect(schedule.removeMove(line.id)).toEqual({
      report: { action: 'delete', doseId: line.id },
      shift: { action: 'none' },
    })
    expect(schedule.move(due('2026-09-20'), '2026-09-18').report.action).toBe('rewrite')
  })

  it.each(['given', 'missed'] as const)(
    'dose d’arrivée %s : la ligne ne se supprime plus',
    (kind) => {
      const gesture =
        kind === 'given'
          ? { kind, due: due('2026-09-20'), givenOn: '2026-09-20' }
          : { kind, due: due('2026-09-20') }
      const schedule = scheduleOf(record(moved, '2026-09-20', gesture), '2026-09-20')

      expect(schedule.lockedMoveIds).toEqual([line.id])
      expect(() => schedule.removeMove(line.id)).toThrow(/dose d’arrivée est déjà notée/)
    },
  )

  it('à plusieurs heures, une heure d’arrivée notée suffit ; l’heure restante se déplace par une nouvelle ligne', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
    let book = record(luna, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '08:00'),
      to: '2026-09-30',
    })
    const dayLine = lastDose(book)
    book = done(book, '2026-09-30')
    const schedule = scheduleOf(book, '2026-09-30')

    expect(schedule.lockedMoveIds).toEqual([dayLine.id])
    expect(() => schedule.removeMove(dayLine.id)).toThrow(/déjà notée/)
    expect(schedule.move(due('2026-09-30', '20:00'), '2026-10-02').report.action).toBe('create')
  })

  it('une heure revenue sur la journée d’origine ne redate pas une ligne verrouillée', () => {
    const luna = carnet(period({ firstDueOn: '2026-09-28', times: ['08:00', '20:00'] }))
    let book = done(luna, '2026-09-28')
    const at8 = lastDose(book)
    book = record(book, '2026-09-28', {
      kind: 'postponed',
      due: due('2026-09-28', '20:00'),
      to: '2026-09-30',
    })
    book = withoutDose(done(book, '2026-09-30'), at8.id)
    const schedule = scheduleOf(book, '2026-09-30')

    expect(() => schedule.move(due('2026-09-28', '08:00'), '2026-10-01')).toThrow(/déjà notée/)
    expect(schedule.moveRefusal(due('2026-09-28', '08:00'))).toBe('arrival-logged')
  })

  it.each(['2026-09-21', '2026-09-20'])(
    'corriger la prise d’avant au %s ne retire pas la ligne verrouillée (N18)',
    (givenOn) => {
      const logged = done(moved, '2026-09-20')
      const on8 = logged.doses.find(({ dueOn }) => dueOn === '2026-09-08')
      const before = scheduleOf(logged, '2026-09-21')

      expect(before.redate(on8?.id ?? '', givenOn).postponement).toBeNull()

      const after = scheduleOf(redate(logged, '2026-09-21', on8?.id ?? '', givenOn), '2026-09-21')
      expect(after.staleDoseIds).toEqual([])
      expect(after.lockedMoveIds).toEqual([line.id])
      expect(after.doses.map(({ id }) => id)).toContain(line.id)
      expect(() => after.removeMove(line.id)).toThrow(/déjà notée/)
      expect(after.currentDoses).toEqual([due('2026-09-27')])
      expect(after.unloggedDoses).toEqual([])
    },
  )

  it('dépassée par une prise déjà en base (synchro), la ligne verrouillée reste en vigueur', () => {
    const logged = done(moved, '2026-09-20')
    const overtaken = {
      ...logged,
      doses: logged.doses.map((dose) =>
        dose.dueOn === '2026-09-08'
          ? { ...dose, givenOn: '2026-09-21', nextDueDate: '2026-09-28' }
          : dose,
      ),
    }
    const schedule = scheduleOf(overtaken, '2026-09-21')

    expect(schedule.staleDoseIds).toEqual([])
    expect(schedule.lockedMoveIds).toEqual([line.id])
    expect(() => schedule.removeMove(line.id)).toThrow(/déjà notée/)
    expect(schedule.currentDoses).toEqual([due('2026-09-27')])
  })

  it('une ligne sans effet se supprime par ce geste', () => {
    const stale = storedMove(moved, '2026-09-22', '2026-09-22')
    const schedule = scheduleOf(stale, '2026-09-09')
    const [staleId] = schedule.staleDoseIds

    expect(staleId).toBe(lastDose(stale).id)
    expect(schedule.removeMove(staleId ?? '')).toEqual({
      report: { action: 'delete', doseId: staleId },
      shift: { action: 'none' },
    })
  })

  it('une ligne inconnue ou une prise ne se supprime pas par ce geste', () => {
    const schedule = scheduleOf(moved, '2026-09-09')

    expect(() => schedule.removeMove('inconnue')).toThrow(/Aucun déplacement/)
    expect(() => schedule.removeMove(moved.doses[0]?.id ?? '')).toThrow(/Aucun déplacement/)
  })
})

describe('refus de déplacement : une dose plus lointaine déjà reportée, ou déjà notée (TR-9, Q26)', () => {
  it('dose plus lointaine déjà déplacée : « later-line »', () => {
    const book = record(carnet(weekly({ firstDueOn: '2026-04-04' })), '2026-04-11', {
      kind: 'postponed',
      due: due('2026-04-18'),
      to: '2026-04-17',
    })

    expect(scheduleOf(book, '2026-04-12').moveRefusal(due('2026-04-11'))).toBe('later-line')
  })

  it('dose plus lointaine déjà notée : « later-dose »', () => {
    const book = record(carnet(weekly()), '2026-09-02', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-09-02',
    })

    expect(scheduleOf(book, '2026-09-02').moveRefusal(due('2026-09-01'))).toBe('later-dose')
  })
})

describe('cas hors spec, pris au plus prudent', () => {
  it('après un report, la nouvelle période propose la date du report', () => {
    const book = record(done(carnet(weekly()), '2026-09-01'), '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })

    expect(
      scheduleOf(book, '2026-09-09').newPeriod({ value: 15, unit: 'day' }, []).firstDueOn,
    ).toBe('2026-09-12')
  })

  it('un traitement sans période n’a ni échéance ni dose à renseigner', () => {
    const schedule = scheduleOf({ periods: [], doses: [] }, '2026-09-28')

    expect(schedule.currentDoses).toEqual([])
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentPeriodId).toBeNull()
  })
})

describe('heure d’été', () => {
  beforeAll(() => {
    vi.stubEnv('TZ', 'Europe/Paris')
  })

  afterAll(() => {
    vi.unstubAllEnvs()
  })

  it('le changement d’heure ne saute ni ne double aucun jour', () => {
    const schedule = scheduleOf(carnet(period({ firstDueOn: '2026-03-28' })), '2026-03-28')

    expect(dueDays(schedule.upcoming(4))).toEqual(days('2026-03-28', '2026-03-31'))
    expect(
      dueDays(scheduleOf(carnet(period({ firstDueOn: '2026-10-24' })), '2026-10-24').upcoming(3)),
    ).toEqual(days('2026-10-24', '2026-10-26'))
  })
})

describe('entrées', () => {
  it('ne modifie jamais les périodes ni les prises reçues', () => {
    const book = doneEachDay(
      carnet(period({ firstDueOn: '2026-09-20', times: ['20:00', '08:00'] })),
      '2026-09-20',
      '2026-09-22',
    )
    const reversed = [...book.doses].reverse()
    const periods = Object.freeze(
      book.periods.map((p) => Object.freeze({ ...p, times: Object.freeze([...p.times]) })),
    )
    const doses = Object.freeze(reversed.map((dose) => Object.freeze({ ...dose })))

    const schedule = treatmentSchedule({ periods, doses, today: '2026-09-28' })
    schedule.upcoming(3)
    schedule.dueForDate('2026-09-21', '08:00')
    schedule.newPeriod({ value: 2, unit: 'day' }, [])
    schedule.doseFor({ kind: 'given', due: due('2026-09-23', '08:00'), givenOn: '2026-09-23' })

    expect(doses).toEqual(reversed)
    expect(periods[0]?.times).toEqual(['20:00', '08:00'])
  })
})

describe('entrées invalides : une erreur claire, jamais de boucle', () => {
  const daily = period({ firstDueOn: '2026-09-01' })

  function scheduleWith(
    periodOverrides: Partial<TreatmentPeriodInput>,
    doses: TreatmentDoseInput[] = [],
  ) {
    return () =>
      treatmentSchedule({ periods: [period(periodOverrides)], doses, today: '2026-09-28' })
  }

  it.each([
    ['nulle en jours', { value: 0, unit: 'day' }],
    ['nulle en semaines', { value: 0, unit: 'week' }],
    ['absente', { value: null, unit: 'day' }],
    ['minuscule', { value: 1e-9, unit: 'day' }],
    ['négative', { value: -1, unit: 'day' }],
    ['non numérique', { value: Number.NaN, unit: 'day' }],
    ['décimale', { value: 1.5, unit: 'day' }],
    ['au-delà de 365', { value: 366, unit: 'day' }],
    ['immense', { value: 1e9, unit: 'day' }],
    ['d’unité inconnue', { value: 1, unit: 'year' }],
  ])('fréquence %s', (_, frequency) => {
    expect(scheduleWith({ frequency: frequency as unknown as Frequency })).toThrow(
      /Calendrier de traitement invalide : période p1, fréquence/,
    )
  })

  it.each([
    'abc',
    '',
    '2026-13-45',
    '2026-02-30',
    '0099-01-01',
    '2026-9-1',
    '1899-12-31',
    '2200-01-01',
  ])('date illisible « %s »', (day) => {
    expect(scheduleWith({ firstDueOn: day })).toThrow(/Calendrier de traitement invalide/)
    expect(scheduleWith({ endsOn: day })).toThrow(/Calendrier de traitement invalide/)
    expect(scheduleWith({ stoppedOn: day })).toThrow(/Calendrier de traitement invalide/)
    expect(scheduleWith({ startsOn: day })).toThrow(/Calendrier de traitement invalide/)
    expect(() => treatmentSchedule({ periods: [daily], doses: [], today: day })).toThrow(
      /Calendrier de traitement invalide : today/,
    )
  })

  it.each([
    ['mal écrite', ['8:00']],
    ['hors de la journée', ['24:00']],
    ['en double', ['08:00', '08:00']],
    ['absentes', null],
  ])('heures %s', (_, times) => {
    expect(scheduleWith({ times: times as unknown as string[] })).toThrow(
      /Calendrier de traitement invalide : période p1, heures/,
    )
  })

  const valid = stored({
    periodId: 'p1',
    dueOn: '2026-09-01',
    dueTime: null,
    givenOn: '2026-09-01',
    status: 'given',
    nextDueDate: '2026-09-02',
  })

  it.each([
    ['échéance illisible', { dueOn: '2026-02-30' }],
    ['date réelle illisible', { givenOn: 'hier' }],
    ['prochaine échéance illisible', { nextDueDate: '' }],
    ['heure illisible', { dueTime: '8h' }],
    ['état inconnu', { status: 'skipped' }],
    ['prochaine échéance en 9999', { nextDueDate: '9999-12-31' }],
    ['date réelle en 9999', { givenOn: '9999-12-30' }],
    ['échéance en 2200', { dueOn: '2200-01-01' }],
  ])('prise avec %s', (_, overrides) => {
    expect(scheduleWith({}, [{ ...valid, ...overrides } as TreatmentDoseInput])).toThrow(
      new RegExp(`Calendrier de traitement invalide : prise ${valid.id}`),
    )
  })

  it('un déplacement forgé vers 1900 est refusé avant tout calcul', () => {
    const everyHour = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const forged = {
      ...valid,
      dueTime: '00:00',
      givenOn: null,
      status: 'postponed',
      nextDueDate: '1900-01-01',
    }

    expect(scheduleWith({ times: everyHour }, [forged as TreatmentDoseInput])).toThrow(
      /Calendrier de traitement trop long/,
    )
  })

  it('un calendrier démesuré (première prise en 1900, toutes les heures) est refusé', () => {
    const everyHour = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)

    expect(scheduleWith({ firstDueOn: '1900-01-01', times: everyHour })).toThrow(
      /Calendrier de traitement trop long/,
    )
  })

  it('un calendrier trop long se reconnaît à son type, sans lire le message', () => {
    const everyHour = Array.from({ length: 24 }, (_, hour) => `${String(hour).padStart(2, '0')}:00`)
    const tooLong = scheduleWith({ firstDueOn: '1900-01-01', times: everyHour })

    expect(tooLong).toThrow(RangeError)
    expect(tooLong).toThrow(ScheduleTooLongError)
  })

  it('une donnée illisible n’est pas un calendrier trop long', () => {
    let error: unknown
    try {
      scheduleWith({ firstDueOn: '2026-02-30' })()
    } catch (caught) {
      error = caught
    }

    expect(error).toBeInstanceOf(RangeError)
    expect(error).not.toBeInstanceOf(ScheduleTooLongError)
  })
})

describe('appels invalides', () => {
  const schedule = scheduleOf(done(carnet(weekly()), '2026-09-01'), '2026-09-10')

  it.each([-1, 1.5, Number.NaN, 1e9])('upcoming(%s) est refusé', (limit) => {
    expect(() => schedule.upcoming(limit)).toThrow(/upcoming/)
  })

  it('une prise ne se note pas à une date future ni illisible', () => {
    expect(() => schedule.dueForDate('2026-09-11')).toThrow(/date future/)
    expect(() => schedule.dueForDate('2026-13-01')).toThrow(/Calendrier de traitement invalide/)
    expect(() => schedule.dueForDate('2026-09-08', '8:00')).toThrow(/heure/)
    expect(() =>
      schedule.doseFor({ kind: 'given', due: due('2026-09-08'), givenOn: '2026-09-11' }),
    ).toThrow(/date future/)
    expect(() => schedule.redate(schedule.doses[0]?.id ?? '', '2026-09-11')).toThrow(/date future/)
    expect(() => schedule.move(due('2026-09-08'), '2026-02-30')).toThrow(
      /Calendrier de traitement invalide/,
    )
    expect(() => schedule.move(due('2026-09-08'), '2200-01-01')).toThrow(
      /Calendrier de traitement invalide/,
    )
  })

  it('une prise ne vise qu’une échéance du calendrier', () => {
    expect(() =>
      schedule.doseFor({ kind: 'given', due: due('2026-09-09'), givenOn: '2026-09-09' }),
    ).toThrow(/Échéance inconnue/)
    expect(() => schedule.doseFor({ kind: 'missed', due: due('2030-01-01') })).toThrow(
      /Échéance inconnue/,
    )
  })

  it('une nouvelle fréquence invalide est refusée', () => {
    expect(() => schedule.newPeriod({ value: 0, unit: 'day' }, [])).toThrow(/fréquence/)
  })
})

describe('changer la date d’une prise notée pour une dose non renseignée (TR-24 bis, Q8)', () => {
  function lateNote(
    start: TreatmentPeriodInput,
    today: string,
    unlogged: string,
    givenOn: string,
  ): Carnet {
    const book = done(carnet(start), start.firstDueOn)
    return record(book, today, { kind: 'given', due: due(unlogged), givenOn })
  }

  it('Milo, hebdomadaire : la dose du 8 notée le 9 laisse la dose du moment au 15', () => {
    const book = lateNote(weekly(), '2026-09-20', '2026-09-08', '2026-09-09')

    expect(lastDose(book)).toMatchObject({ dueOn: '2026-09-08', nextDueDate: '2026-09-15' })
    const schedule = scheduleOf(book, '2026-09-20')
    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
    expect(schedule.nextDue).toEqual(due('2026-09-22'))
  })

  it.each(['2026-09-08', '2026-09-09', '2026-09-10', '2026-09-16'])(
    'redatée au %s, elle ne touche pas la suite',
    (givenOn) => {
      const book = lateNote(weekly(), '2026-09-20', '2026-09-08', '2026-09-09')

      const moved = redate(book, '2026-09-20', lastDose(book).id, givenOn)

      expect(lastDose(moved)).toMatchObject({ givenOn, nextDueDate: '2026-09-15' })
      const schedule = scheduleOf(moved, '2026-09-20')
      expect(schedule.unloggedDoses).toEqual([])
      expect(schedule.currentDoses).toEqual([due('2026-09-15')])
      expect(schedule.nextDue).toEqual(due('2026-09-22'))
    },
  )

  it.each([
    {
      name: 'toutes les 2 semaines',
      start: period({ firstDueOn: '2026-08-01', frequency: { value: 2, unit: 'week' } }),
      today: '2026-10-01',
      unlogged: '2026-08-15',
      givenOn: '2026-08-16',
      redatedTo: '2026-08-17',
    },
    {
      name: 'tous les mois',
      start: monthly({ firstDueOn: '2026-06-10' }),
      today: '2026-09-20',
      unlogged: '2026-07-10',
      givenOn: '2026-07-12',
      redatedTo: '2026-07-13',
    },
    {
      name: 'tous les 3 jours',
      start: period({ firstDueOn: '2026-09-01', frequency: { value: 3, unit: 'day' } }),
      today: '2026-09-20',
      unlogged: '2026-09-07',
      givenOn: '2026-09-08',
      redatedTo: '2026-09-09',
    },
    {
      name: 'tous les jours',
      start: period({ firstDueOn: '2026-09-01' }),
      today: '2026-09-20',
      unlogged: '2026-09-07',
      givenOn: '2026-09-08',
      redatedTo: '2026-09-09',
    },
  ])(
    '$name : ni la ligne ni le calendrier ne changent',
    ({ start, today, unlogged, givenOn, redatedTo }) => {
      const book = lateNote(start, today, unlogged, givenOn)
      const before = scheduleOf(book, today)

      const moved = redate(book, today, lastDose(book).id, redatedTo)

      expect(lastDose(moved).nextDueDate).toBe(lastDose(book).nextDueDate)
      const after = scheduleOf(moved, today)
      expect(after.unloggedDoses).toEqual(before.unloggedDoses)
      expect(after.currentDoses).toEqual(before.currentDoses)
      expect(after.upcoming(6)).toEqual(before.upcoming(6))
    },
  )
})

describe('changer la date d’une prise sans changer de date (TR-24 bis)', () => {
  it('tous les 12 mois à 8 h et 20 h : la prise de 8 h supprimée, celle de 20 h redatée au même jour garde sa suite', () => {
    const yearly = period({
      firstDueOn: '2027-01-30',
      frequency: { value: 12, unit: 'month' },
      times: ['08:00', '20:00'],
    })
    let book = done(carnet(yearly), '2027-02-03', '2027-02-02')
    const at8 = lastDose(book)
    book = done(book, '2027-02-03', '2027-02-02')
    expect(lastDose(book)).toMatchObject({ dueTime: '20:00', nextDueDate: '2028-02-02' })
    book = withoutDose(book, at8.id)
    const before = scheduleOf(book, '2027-02-03')

    expect(before.redate(lastDose(book).id, '2027-02-02')).toEqual({
      dose: expect.objectContaining({ givenOn: '2027-02-02', nextDueDate: '2028-02-02' }),
      shift: { action: 'none' },
      postponement: null,
    })
    const after = scheduleOf(
      redate(book, '2027-02-03', lastDose(book).id, '2027-02-02'),
      '2027-02-03',
    )
    expect(after.currentDoses).toEqual(before.currentDoses)
    expect(after.nextDue).toEqual(before.nextDue)
  })
})

describe('changer la date d’une prise d’une période close (TR-24 bis, TR-28)', () => {
  function closedWeekly(): Carnet {
    let book = done(carnet(weekly()), '2026-09-01')
    book = done(book, '2026-09-10')
    const dates = scheduleOf(book, '2026-09-24').newPeriod({ value: 1, unit: 'day' }, [])
    const daily = period({ id: 'p2', ...dates, createdAt: '2026-09-24T09:00:00.000Z' })
    return { ...book, periods: [...book.periods, daily] }
  }

  it('la dose du 8 donnée le 10 a fixé la suite au 17, seule dose à renseigner de l’ancienne période', () => {
    const book = closedWeekly()

    expect(lastDose(book)).toMatchObject({ dueOn: '2026-09-08', nextDueDate: '2026-09-17' })
    expect(scheduleOf(book, '2026-09-24').unloggedDoses).toEqual([due('2026-09-17')])
  })

  it('redatée à la même date, rien ne change', () => {
    const book = closedWeekly()
    const schedule = scheduleOf(book, '2026-09-24')

    expect(schedule.redate(lastDose(book).id, '2026-09-10')).toEqual({
      dose: expect.objectContaining({ givenOn: '2026-09-10', nextDueDate: '2026-09-17' }),
      shift: { action: 'none' },
      postponement: null,
    })
    const moved = redate(book, '2026-09-24', lastDose(book).id, '2026-09-10')
    expect(scheduleOf(moved, '2026-09-24').unloggedDoses).toEqual([due('2026-09-17')])
  })

  it('redatée au 11, la suite de sa période repart du 11, comme si la période était encore ouverte', () => {
    const book = closedWeekly()

    const moved = redate(book, '2026-09-24', lastDose(book).id, '2026-09-11')

    expect(lastDose(moved)).toMatchObject({ givenOn: '2026-09-11', nextDueDate: '2026-09-18' })
    const schedule = scheduleOf(moved, '2026-09-24')
    expect(schedule.unloggedDoses).toEqual([due('2026-09-18')])
    expect(schedule.currentDoses).toEqual([due('2026-09-24', null, 'p2')])
  })

  it('traitement arrêté depuis : redatée au 11, la suite d’avant l’arrêt repart du 11', () => {
    let book = done(carnet(weekly()), '2026-09-01')
    book = done(book, '2026-09-10')
    const on8 = lastDose(book)
    book = { ...book, periods: [weekly({ stoppedOn: '2026-09-20' })] }
    expect(scheduleOf(book, '2026-09-24').unloggedDoses).toEqual([due('2026-09-17')])

    const moved = redate(book, '2026-09-24', on8.id, '2026-09-11')

    expect(lastDose(moved)).toMatchObject({ givenOn: '2026-09-11', nextDueDate: '2026-09-18' })
    expect(scheduleOf(moved, '2026-09-24').unloggedDoses).toEqual([due('2026-09-18')])
  })
})

describe('en mois, le jour de référence ne dérive pas (TR-7)', () => {
  it('tous les 3 mois depuis le 31 août : la dose du 30 nov. donnée à l’heure garde le 31 mai', () => {
    const quarterly = period({ firstDueOn: '2026-08-31', frequency: { value: 3, unit: 'month' } })
    const book = done(done(carnet(quarterly), '2026-08-31'), '2026-11-30')

    expect(dueDays(scheduleOf(book, '2026-11-30').upcoming(3))).toEqual([
      '2027-02-28',
      '2027-05-31',
      '2027-08-31',
    ])
  })

  it('la dose du 30 nov. oubliée garde aussi le 31 mai', () => {
    const quarterly = period({ firstDueOn: '2026-08-31', frequency: { value: 3, unit: 'month' } })
    const book = record(done(carnet(quarterly), '2026-08-31'), '2026-11-30', {
      kind: 'missed',
      due: due('2026-11-30'),
    })

    expect(dueDays(scheduleOf(book, '2026-11-30').upcoming(2))).toEqual([
      '2027-02-28',
      '2027-05-31',
    ])
  })
})

describe('changer le rythme le jour d’une dose encore sans prise garde la dose du jour (TR-28, Q36)', () => {
  it('quotidien : la dose du 6 notée le 7 au matin, passage à tous les 2 jours le 7 → la dose du 7 reste', () => {
    let book = doneEachDay(carnet(period({ firstDueOn: '2026-10-01' })), '2026-10-01', '2026-10-05')
    book = record(book, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-06'),
      givenOn: '2026-10-07',
    })
    const twoDays = { value: 2, unit: 'day' } as const

    const dates = scheduleOf(book, '2026-10-07').newPeriod(twoDays, [])

    expect(dates).toEqual({
      startsOn: '2026-10-07',
      firstDueOn: '2026-10-07',
      referenceOn: '2026-10-07',
    })
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({ id: 'p2', ...dates, frequency: twoDays, createdAt: '2026-10-07T10:00:00Z' }),
      ],
    }
    const schedule = scheduleOf(changed, '2026-10-07')
    expect(schedule.currentDoses).toEqual([due('2026-10-07', null, 'p2')])
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.nextDue).toEqual(due('2026-10-09', null, 'p2'))
  })

  it('mensuel du 1er : passé à tous les 2 mois le jour de la dose du 1er oct., la dose du jour reste', () => {
    const book = done(carnet(monthly()), '2026-09-01')

    expect(scheduleOf(book, '2026-10-01').newPeriod({ value: 2, unit: 'month' }, [])).toEqual({
      startsOn: '2026-10-01',
      firstDueOn: '2026-10-01',
      referenceOn: '2026-10-01',
    })
  })

  it('la dose du jour déjà notée : la suite part de la dernière prise plus la nouvelle fréquence', () => {
    const book = done(done(carnet(monthly()), '2026-09-01'), '2026-10-01')

    expect(scheduleOf(book, '2026-10-01').newPeriod({ value: 2, unit: 'month' }, [])).toEqual({
      startsOn: '2026-10-01',
      firstDueOn: '2026-12-01',
      referenceOn: '2026-12-01',
    })
  })

  it('une dose en retard n’est pas une dose du jour : la suite part de la dernière prise', () => {
    const book = done(carnet(weekly()), '2026-09-01')

    expect(scheduleOf(book, '2026-09-10').newPeriod({ value: 15, unit: 'day' }, [])).toEqual({
      startsOn: '2026-09-10',
      firstDueOn: '2026-09-16',
      referenceOn: '2026-09-16',
    })
  })
})

describe('sans changer la fréquence ni les heures, la prochaine dose reste celle prévue (TR-7, Q37)', () => {
  const everyMonth = { value: 1, unit: 'month' } as const

  it.each([
    { firstDueOn: '2027-01-31', february: '2027-02-28', today: '2027-03-01', next: '2027-03-31' },
    { firstDueOn: '2027-01-30', february: '2027-02-28', today: '2027-03-01', next: '2027-03-30' },
    { firstDueOn: '2028-01-31', february: '2028-02-29', today: '2028-03-01', next: '2028-03-31' },
  ])(
    'mensuel du $firstDueOn, posologie changée le $today : prochaine dose le $next',
    ({ firstDueOn, february, today, next }) => {
      const book = done(done(carnet(monthly({ firstDueOn })), firstDueOn), february)

      expect(scheduleOf(book, today).newPeriod(everyMonth, [])).toEqual({
        startsOn: today,
        firstDueOn: next,
        referenceOn: firstDueOn,
      })
    },
  )

  it('un report en vigueur est gardé', () => {
    let book = done(carnet(weekly()), '2026-09-01')
    book = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-11',
    })

    expect(scheduleOf(book, '2026-09-05').newPeriod({ value: 1, unit: 'week' }, [])).toEqual({
      startsOn: '2026-09-05',
      firstDueOn: '2026-09-11',
      referenceOn: '2026-09-11',
    })
  })

  it('une dose en retard : la nouvelle période commence aujourd’hui', () => {
    const book = done(carnet(weekly()), '2026-09-01')

    expect(scheduleOf(book, '2026-09-10').newPeriod({ value: 1, unit: 'week' }, [])).toEqual({
      startsOn: '2026-09-10',
      firstDueOn: '2026-09-10',
      referenceOn: '2026-09-10',
    })
  })

  describe('tous les 2 jours à 8 h et 20 h : une journée entamée garde l’ancien calcul', () => {
    const twoDays = { value: 2, unit: 'day' } as const
    const times = ['08:00', '20:00']
    const start = carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times }))
    const firstDay = done(done(start, '2026-10-01'), '2026-10-01')

    it('8 h du 3 donnée, 20 h non, posologie changée le 4 : prochaine dose le 5', () => {
      const book = done(firstDay, '2026-10-03')
      expect(scheduleOf(book, '2026-10-04').currentDoses).toEqual([due('2026-10-03', '20:00')])

      expect(scheduleOf(book, '2026-10-04').newPeriod(twoDays, times)).toEqual({
        startsOn: '2026-10-04',
        firstDueOn: '2026-10-05',
        referenceOn: '2026-10-05',
      })
    })

    describe('8 h du 3 donnée en avance le 2, posologie changée le 2 (#656)', () => {
      const book = done(firstDay, '2026-10-02')
      const opened = (rhythm: Pick<TreatmentPeriodInput, 'firstDueOn' | 'times'>): Carnet => ({
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            startsOn: '2026-10-02',
            referenceOn: '2026-10-01',
            frequency: twoDays,
            createdAt: '2026-10-02T09:00:00.000Z',
            ...rhythm,
          }),
        ],
      })

      it('la nouvelle période commence par la journée du 3', () => {
        expect(scheduleOf(book, '2026-10-02').currentDoses).toEqual([due('2026-10-03', '20:00')])

        expect(scheduleOf(book, '2026-10-02').newPeriod(twoDays, times)).toEqual({
          startsOn: '2026-10-02',
          firstDueOn: '2026-10-03',
          referenceOn: '2026-10-01',
        })
      })

      it('la prise de 8 h compte : prochaine dose le 3 à 20 h, puis le 5', () => {
        const changed = opened({ firstDueOn: '2026-10-03', times })

        const onSecond = scheduleOf(changed, '2026-10-02')
        expect(onSecond.upcoming(2)).toEqual([
          due('2026-10-03', '20:00', 'p2'),
          due('2026-10-05', '08:00', 'p2'),
        ])
        expect(onSecond.unloggedDoses).toEqual([])
        const onFifth = scheduleOf(done(changed, '2026-10-03'), '2026-10-04')
        expect(onFifth.currentDoses).toEqual([due('2026-10-05', '08:00', 'p2')])
        expect(onFifth.unloggedDoses).toEqual([])
      })

      it('les heures changent et la prochaine dose est choisie le 3 : la prise de 8 h compte, reste 21 h (G24)', () => {
        const changed = opened({ firstDueOn: '2026-10-03', times: ['09:00', '21:00'] })

        expect(scheduleOf(changed, '2026-10-02').upcoming(2)).toEqual([
          due('2026-10-03', '21:00', 'p2'),
          due('2026-10-05', '09:00', 'p2'),
        ])
      })
    })

    it('20 h du 3 donnée en avance le 2, posologie changée le 2 : la prise couvre le 20 h, le 8 h reste (G22)', () => {
      const book = record(firstDay, '2026-10-02', {
        kind: 'given',
        due: due('2026-10-03', '20:00'),
        givenOn: '2026-10-02',
      })
      const dates = scheduleOf(book, '2026-10-02').newPeriod(twoDays, times)
      expect(dates.firstDueOn).toBe('2026-10-03')
      const changed = withPeriod(book, { ...dates, frequency: twoDays, times })

      expect(scheduleOf(changed, '2026-10-02').upcoming(2)).toEqual([
        due('2026-10-03', '08:00', 'p2'),
        due('2026-10-05', '08:00', 'p2'),
      ])
      const morning = record(changed, '2026-10-03', {
        kind: 'given',
        due: due('2026-10-03', '08:00', 'p2'),
        givenOn: '2026-10-03',
      })
      expect(lastDose(morning).nextDueDate).toBe('2026-10-05')
    })

    it('aucune heure du 3 notée, posologie changée le 2 : prochaine dose le 3', () => {
      expect(scheduleOf(firstDay, '2026-10-02').newPeriod(twoDays, times)).toEqual({
        startsOn: '2026-10-02',
        firstDueOn: '2026-10-03',
        referenceOn: '2026-10-01',
      })
    })
  })

  it('les heures changent : la dernière prise plus la fréquence, comme avant', () => {
    const book = done(
      done(carnet(monthly({ firstDueOn: '2027-01-31' })), '2027-01-31'),
      '2027-02-28',
    )

    expect(scheduleOf(book, '2027-03-01').newPeriod(everyMonth, ['08:00'])).toEqual({
      startsOn: '2027-03-01',
      firstDueOn: '2027-03-28',
      referenceOn: '2027-03-28',
    })
  })
})

describe('au même rythme, une prise notée en avance couvre son heure dans la nouvelle période (G22)', () => {
  const times = ['08:00', '20:00']

  it('quotidien, 8 h du 2 et 8 h du 3 notées le 2, posologie changée le 2 : le 3 à 8 h n’est pas redemandé', () => {
    const daily = { value: 1, unit: 'day' } as const
    let book = done(
      done(carnet(period({ firstDueOn: '2026-10-01', frequency: daily, times })), '2026-10-01'),
      '2026-10-01',
    )
    book = done(book, '2026-10-02')
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-03', '08:00'),
      givenOn: '2026-10-02',
    })
    const dates = scheduleOf(book, '2026-10-02').newPeriod(daily, times)
    expect(dates).toEqual({
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-02',
      referenceOn: '2026-10-02',
    })
    const changed = withPeriod(book, { ...dates, frequency: daily, times })

    expect(scheduleOf(changed, '2026-10-02').upcoming(3)).toEqual([
      due('2026-10-02', '20:00', 'p2'),
      due('2026-10-03', '20:00', 'p2'),
      due('2026-10-04', '08:00', 'p2'),
    ])
  })

  it('tous les 3 jours, dose du 4 reportée au 6 avec décalage, 8 h du 6 notée le 5 : la nouvelle période commence le 6', () => {
    const threeDays = { value: 3, unit: 'day' } as const
    let book = done(
      done(carnet(period({ firstDueOn: '2026-10-01', frequency: threeDays, times })), '2026-10-01'),
      '2026-10-01',
    )
    book = record(book, '2026-10-02', {
      kind: 'postponed',
      due: due('2026-10-04', '08:00'),
      to: '2026-10-06',
    })
    book = record(book, '2026-10-05', {
      kind: 'given',
      due: due('2026-10-06', '08:00'),
      givenOn: '2026-10-05',
    })
    const dates = scheduleOf(book, '2026-10-05').newPeriod(threeDays, times)
    expect(dates).toEqual({
      startsOn: '2026-10-05',
      firstDueOn: '2026-10-06',
      referenceOn: '2026-10-06',
    })
    const changed = withPeriod(book, { ...dates, frequency: threeDays, times })

    expect(scheduleOf(changed, '2026-10-05').upcoming(2)).toEqual([
      due('2026-10-06', '20:00', 'p2'),
      due('2026-10-09', '08:00', 'p2'),
    ])
  })

  it('tous les 3 jours, dose du 4 reportée seule au 6, 8 h du 6 et du 7 notées le 5 : les 20 h du 6 et du 7 restent, puis le 10 (G23, #692)', () => {
    const threeDays = { value: 3, unit: 'day' } as const
    let book = done(
      done(carnet(period({ firstDueOn: '2026-10-01', frequency: threeDays, times })), '2026-10-01'),
      '2026-10-01',
    )
    const { report, shift } = scheduleOf(book, '2026-10-02').move(
      due('2026-10-04', '08:00'),
      '2026-10-06',
      false,
    )
    book = applied(applied(book, shift), report)
    for (const day of ['2026-10-06', '2026-10-07']) {
      book = record(book, '2026-10-05', {
        kind: 'given',
        due: due(day, '08:00'),
        givenOn: '2026-10-05',
      })
    }

    const dates = scheduleOf(book, '2026-10-05').newPeriod(threeDays, times)
    expect(dates).toEqual({
      startsOn: '2026-10-05',
      firstDueOn: '2026-10-06',
      referenceOn: '2026-10-07',
    })
    const changed = withPeriod(book, { ...dates, frequency: threeDays, times })

    expect(scheduleOf(changed, '2026-10-05').upcoming(3)).toEqual([
      due('2026-10-06', '20:00', 'p2'),
      due('2026-10-07', '20:00', 'p2'),
      due('2026-10-10', '08:00', 'p2'),
    ])
  })
})

describe('un report seul ne déplace que sa dose, même après un changement de posologie (G23, #692)', () => {
  const twoDays = { value: 2, unit: 'day' } as const
  const firstGiven = done(
    carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays })),
    '2026-10-01',
  )
  const movedAlone = (book: Carnet, today: string, from: Due, to: string): Carnet => {
    const { report, shift } = scheduleOf(book, today).move(from, to, false)
    return applied(applied(book, shift), report)
  }
  const reportedAlone = movedAlone(firstGiven, '2026-10-02', due('2026-10-03'), '2026-10-04')
  const changedOn = (book: Carnet, today: string, times: string[] = []): Carnet => {
    const dates = scheduleOf(book, today).newPeriod(twoDays, times)
    return withPeriod(book, { ...dates, frequency: twoDays, times })
  }

  it.each(['2026-10-02', '2026-10-03', '2026-10-04'])(
    'tous les 2 jours (1, 3, 5, 7), dose du 3 reportée seule au 4, posologie changée le %s : 4, 5, 7',
    (today) => {
      expect(dueDays(scheduleOf(reportedAlone, today).upcoming(3))).toEqual([
        '2026-10-04',
        '2026-10-05',
        '2026-10-07',
      ])

      const changed = scheduleOf(changedOn(reportedAlone, today), today)

      expect(changed.upcoming(3)).toEqual([
        due('2026-10-04', null, 'p2'),
        due('2026-10-05', null, 'p2'),
        due('2026-10-07', null, 'p2'),
      ])
      expect(changed.unloggedDoses).toEqual([])
    },
  )

  it('la posologie changée deux fois avant le 4 : toujours 4, 5, 7', () => {
    const once = changedOn(reportedAlone, '2026-10-02')
    const twice = scheduleOf(once, '2026-10-03').newPeriod(twoDays, [])
    const book = {
      ...once,
      periods: [
        ...once.periods,
        period({
          id: 'p3',
          createdAt: '2026-10-03T09:00:00.000Z',
          ...twice,
          frequency: twoDays,
        }),
      ],
    }

    expect(scheduleOf(book, '2026-10-03').upcoming(3)).toEqual([
      due('2026-10-04', null, 'p3'),
      due('2026-10-05', null, 'p3'),
      due('2026-10-07', null, 'p3'),
    ])
  })

  it('dose du 5 avancée seule au 4, dose du 3 donnée, posologie changée le 3 : 4, 7, 9', () => {
    const given = done(firstGiven, '2026-10-03')
    const advanced = movedAlone(given, '2026-10-03', due('2026-10-05'), '2026-10-04')

    expect(
      dueDays(scheduleOf(changedOn(advanced, '2026-10-03'), '2026-10-03').upcoming(3)),
    ).toEqual(['2026-10-04', '2026-10-07', '2026-10-09'])
  })

  it('à 8 h et 20 h, dose du 3 reportée seule au 4, 8 h du 4 donnée en avance le 2, posologie changée le 2 : 20 h du 4, puis le 5', () => {
    const times = ['08:00', '20:00']
    let book = carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times }))
    book = done(done(book, '2026-10-01'), '2026-10-01')
    book = movedAlone(book, '2026-10-02', due('2026-10-03', '08:00'), '2026-10-04')
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-04', '08:00'),
      givenOn: '2026-10-02',
    })

    const changed = scheduleOf(changedOn(book, '2026-10-02', times), '2026-10-02')

    expect(changed.upcoming(3)).toEqual([
      due('2026-10-04', '20:00', 'p2'),
      due('2026-10-05', '08:00', 'p2'),
      due('2026-10-05', '20:00', 'p2'),
    ])
    expect(changed.unloggedDoses).toEqual([])
  })

  it.each(['2026-10-03', '2026-10-04'])(
    'à 8 h et 20 h, 8 h du 3 donnée, 20 h du 3 reportée seule au 4, posologie changée le %s : 20 h du 4, puis le 5 (G25, #720)',
    (today) => {
      const times = ['08:00', '20:00']
      let book = carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times }))
      book = done(done(book, '2026-10-01'), '2026-10-01')
      book = done(book, '2026-10-03')
      book = movedAlone(book, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04')

      const changedBook = changedOn(book, today, times)
      const changed = scheduleOf(changedBook, today)
      const purged = {
        ...changedBook,
        doses: changedBook.doses.filter(({ id }) => !changed.staleDoseIds.includes(id)),
      }

      expect(changed.upcoming(3)).toEqual([
        due('2026-10-04', '20:00', 'p2'),
        due('2026-10-05', '08:00', 'p2'),
        due('2026-10-05', '20:00', 'p2'),
      ])
      expect(changed.unloggedDoses).toEqual([])
      expect(scheduleOf(purged, today).upcoming(3)).toEqual(changed.upcoming(3))
    },
  )
})

describe('une heure reportée seule ne déplace que cette heure (G25, #720)', () => {
  const twoDays = { value: 2, unit: 'day' } as const
  const times = ['08:00', '20:00']
  const movedOn = (book: Carnet, today: string, from: Due, to: string, shifts: boolean) => {
    const { report, shift } = scheduleOf(book, today).move(from, to, shifts)
    return applied(applied(book, shift), report)
  }
  const morningOf3 = done(
    done(
      done(carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times })), '2026-10-01'),
      '2026-10-01',
    ),
    '2026-10-03',
  )

  it('tous les 2 jours à 8 h et 20 h, 8 h du 3 donnée, 20 h du 3 reportée seule au 4 : le 4, seule 20 h, puis le 5', () => {
    const book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', false)

    expect(scheduleOf(book, '2026-10-03').upcoming(3)).toEqual([
      due('2026-10-04', '20:00'),
      due('2026-10-05', '08:00'),
      due('2026-10-05', '20:00'),
    ])
    const onThe4th = scheduleOf(book, '2026-10-04')
    expect(onThe4th.currentDoses).toEqual([due('2026-10-04', '20:00')])
    expect(onThe4th.unloggedDoses).toEqual([])
    expect(scheduleOf(book, '2026-10-05').unloggedDoses).toEqual([due('2026-10-04', '20:00')])
  })

  it.each([
    ['2026-10-03', [due('2026-10-04', '08:00', 'p2'), due('2026-10-04', '20:00', 'p2')], []],
    ['2026-10-04', [due('2026-10-04', '20:00', 'p2')], [due('2026-10-03', '08:00')]],
  ])(
    'posologie changée le %s, puis la prise de 8 h du 3 supprimée : la dose de 8 h n’est pas perdue',
    (changedOn, onThe4th, unlogged) => {
      const book = movedOn(
        morningOf3,
        '2026-10-03',
        due('2026-10-03', '20:00'),
        '2026-10-04',
        false,
      )
      const dates = scheduleOf(book, changedOn).newPeriod(twoDays, times)
      const changed: Carnet = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            createdAt: '2026-10-02T09:00:00.000Z',
            ...dates,
            frequency: twoDays,
            times,
          }),
        ],
      }
      const morning = changed.doses.find(
        ({ dueOn, status }) => dueOn === '2026-10-03' && status === 'given',
      )!
      const schedule = scheduleOf(withoutDose(changed, morning.id), '2026-10-04')

      expect(schedule.currentDoses).toEqual(onThe4th)
      expect(schedule.unloggedDoses).toEqual(unlogged)
    },
  )

  it.each(['2026-10-03', '2026-10-04'])(
    'heures passées à 9 h et 21 h le %s : le 4, seule 21 h remplace la dose reportée, puis le 5 à 9 h et 21 h',
    (today) => {
      const later = ['09:00', '21:00']
      const book = movedOn(
        morningOf3,
        '2026-10-03',
        due('2026-10-03', '20:00'),
        '2026-10-04',
        false,
      )
      const dates = scheduleOf(book, today).newPeriod(twoDays, later)
      const changed: Carnet = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            createdAt: '2026-10-02T09:00:00.000Z',
            ...dates,
            frequency: twoDays,
            times: later,
          }),
        ],
      }
      const schedule = scheduleOf(changed, today)
      const purged = {
        ...changed,
        doses: changed.doses.filter(({ id }) => !schedule.staleDoseIds.includes(id)),
      }

      expect(schedule.upcoming(3)).toEqual([
        due('2026-10-04', '21:00', 'p2'),
        due('2026-10-05', '09:00', 'p2'),
        due('2026-10-05', '21:00', 'p2'),
      ])
      expect(schedule.unloggedDoses).toEqual([])
      expect(scheduleOf(purged, '2026-10-04').currentDoses).toEqual([
        due('2026-10-04', '21:00', 'p2'),
      ])
    },
  )

  it('posologie changée le 3, le 4 déplacé au 6 avec décalage puis ramené : le 6 n’a que 20 h (#735), le 4 revient à 20 h seule (graine 230001526)', () => {
    const book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', false)
    const dates = scheduleOf(book, '2026-10-03').newPeriod(twoDays, times)
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          createdAt: '2026-10-02T09:00:00.000Z',
          ...dates,
          frequency: twoDays,
          times,
        }),
      ],
    }
    const away = movedOn(
      changed,
      '2026-10-03',
      due('2026-10-04', '20:00', 'p2'),
      '2026-10-06',
      true,
    )

    expect(scheduleOf(away, '2026-10-03').upcoming(2)).toEqual([
      due('2026-10-06', '20:00', 'p2'),
      due('2026-10-08', '08:00', 'p2'),
    ])
    const back = movedOn(away, '2026-10-03', due('2026-10-06', '20:00', 'p2'), '2026-10-04', true)
    expect(scheduleOf(back, '2026-10-03').upcoming(2)).toEqual([
      due('2026-10-04', '20:00', 'p2'),
      due('2026-10-05', '08:00', 'p2'),
    ])
  })

  it.each([
    ['2026-10-04', '2026-10-04', ['09:00', '21:00']],
    ['2026-10-04', '2026-10-04', ['06:00', '12:00', '18:00', '23:00']],
    ['2026-10-04', '2026-10-04', ['08:00', '14:00', '20:00']],
    ['2026-10-03', '2026-10-03', ['09:00', '21:00']],
    ['2026-10-03', '2026-10-04', ['09:00', '21:00']],
  ])(
    'dose reportée donnée le %s, heures changées le %s (%j) : plus rien le 3 ni le 4, puis le 5 (graine 250002924)',
    (givenOn, today, later) => {
      let book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', false)
      book = record(book, givenOn, { kind: 'given', due: due('2026-10-04', '20:00'), givenOn })
      const dates = scheduleOf(book, today).newPeriod(twoDays, later)
      const changed: Carnet = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            createdAt: '2026-10-02T09:00:00.000Z',
            ...dates,
            frequency: twoDays,
            times: later,
          }),
        ],
      }
      const schedule = scheduleOf(changed, today)

      expect(dates.firstDueOn).toBe('2026-10-05')
      expect(schedule.upcoming(later.length + 1)).toEqual([
        ...later.map((time) => due('2026-10-05', time, 'p2')),
        due('2026-10-07', later[0]!, 'p2'),
      ])
      expect(schedule.unloggedDoses).toEqual([])
    },
  )

  it('report seul arrivé sur un jour de la grille, posologie changée : ce jour garde ses heures (graine 270000269)', () => {
    const three = ['08:00', '14:00', '20:00']
    const every4 = { value: 4, unit: 'day' } as const
    const given = (dueOn: string, dueTime: string) =>
      stored({
        periodId: 'p1',
        dueOn,
        dueTime,
        givenOn: dueOn,
        status: 'given',
        nextDueDate: dueOn,
      })
    const book: Carnet = {
      periods: [period({ firstDueOn: '2026-10-01', frequency: every4, times: three })],
      doses: [
        ...three.map((time) => given('2026-10-01', time)),
        given('2026-10-05', '08:00'),
        given('2026-10-05', '14:00'),
        stored({
          periodId: 'p1',
          dueOn: '2026-10-05',
          dueTime: '20:00',
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-10-09',
        }),
        given('2026-10-09', '08:00'),
        given('2026-10-09', '20:00'),
      ],
    }
    expect(scheduleOf(book, '2026-10-07').currentDoses).toEqual([due('2026-10-09', '14:00')])

    const dates = scheduleOf(book, '2026-10-07').newPeriod(every4, three)
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          createdAt: '2026-10-02T09:00:00.000Z',
          ...dates,
          frequency: every4,
          times: three,
        }),
      ],
    }

    expect(scheduleOf(changed, '2026-10-07').currentDoses).toEqual([
      due('2026-10-09', '14:00', 'p2'),
    ])
  })

  it('dose reportée donnée le 4, fréquence passée à tous les 3 jours le 4 : rien de redemandé le 4 (#711)', () => {
    let book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', false)
    book = done(book, '2026-10-04')
    const every3 = { value: 3, unit: 'day' } as const
    const dates = scheduleOf(book, '2026-10-04').newPeriod(every3, times)
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          createdAt: '2026-10-02T09:00:00.000Z',
          ...dates,
          frequency: every3,
          times,
        }),
      ],
    }
    const schedule = scheduleOf(changed, '2026-10-04')

    expect(schedule.currentDoses.some(({ dueOn }) => dueOn === '2026-10-04')).toBe(false)
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('reports seuls en chaîne : une heure qui n’était pas à donner au jour d’origine ne part pas (graine 270001148)', () => {
    const three = ['08:00', '14:00', '20:00']
    let book = carnet(
      period({ firstDueOn: '2026-10-01', frequency: { value: 1, unit: 'week' }, times: three }),
    )
    book = record(book, '2026-10-01', {
      kind: 'given',
      due: due('2026-10-01', '20:00'),
      givenOn: '2026-10-01',
    })
    book = movedOn(book, '2026-10-01', due('2026-10-01', '08:00'), '2026-10-03', false)
    expect(scheduleOf(book, '2026-10-01').upcoming(2)).toEqual([
      due('2026-10-03', '08:00'),
      due('2026-10-03', '14:00'),
    ])
    book = done(book, '2026-10-03')
    book = movedOn(book, '2026-10-03', due('2026-10-03', '14:00'), '2026-10-05', false)

    expect(scheduleOf(book, '2026-10-03').upcoming(2)).toEqual([
      due('2026-10-05', '14:00'),
      due('2026-10-08', '08:00'),
    ])
  })

  it('reports seuls en chaîne, posologie changée avant eux : le dernier jour d’arrivée garde sa seule heure (graine 280000892)', () => {
    const three = ['08:00', '14:00', '20:00']
    const weekly = { value: 1, unit: 'week' } as const
    const line = (dueOn: string, dueTime: string, status: 'given' | 'postponed', next: string) =>
      stored({
        periodId: 'p1',
        dueOn,
        dueTime,
        givenOn: status === 'given' ? dueOn : null,
        status,
        nextDueDate: next,
      })
    const book: Carnet = {
      periods: [period({ firstDueOn: '2026-10-01', frequency: weekly, times: three })],
      doses: [
        line('2026-10-01', '14:00', 'given', '2026-10-01'),
        line('2026-10-01', '20:00', 'given', '2026-10-01'),
        line('2026-10-01', '08:00', 'postponed', '2026-10-03'),
        line('2026-10-03', '08:00', 'postponed', '2026-10-05'),
      ],
    }
    const expected = [due('2026-10-05', '08:00'), due('2026-10-08', '08:00')]
    expect(scheduleOf(book, '2026-10-01').upcoming(2)).toEqual(expected)

    const dates = scheduleOf(book, '2026-10-01').newPeriod(weekly, three)
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p2',
          createdAt: '2026-10-02T09:00:00.000Z',
          ...dates,
          frequency: weekly,
          times: three,
        }),
      ],
    }

    const schedule = scheduleOf(changed, '2026-10-01')
    const purged = {
      ...changed,
      doses: changed.doses.filter(({ id }) => !schedule.staleDoseIds.includes(id)),
    }

    expect(schedule.upcoming(2)).toEqual(
      expected.map(({ dueOn, dueTime }) => due(dueOn, dueTime, 'p2')),
    )
    expect(scheduleOf(purged, '2026-10-01').upcoming(2)).toEqual(schedule.upcoming(2))
  })

  it.each([
    [
      ['08:00', '20:00'],
      '20:00',
      [due('2026-10-03', '20:00', 'p2'), due('2026-10-06', '08:00', 'p2')],
    ],
    [
      ['08:00', '14:00', '20:00'],
      '14:00',
      [
        due('2026-10-03', '14:00', 'p2'),
        due('2026-10-03', '20:00', 'p2'),
        due('2026-10-06', '08:00', 'p2'),
      ],
    ],
  ])(
    'heure reportée seule pas encore donnée, fréquence passée à tous les 3 jours le 3 (%j) : comme avant, le 3 puis le 6',
    (hours, moved, expected) => {
      const every2 = { value: 2, unit: 'day' } as const
      const every3 = { value: 3, unit: 'day' } as const
      let book = carnet(period({ firstDueOn: '2026-10-01', frequency: every2, times: hours }))
      for (const _ of hours) book = done(book, '2026-10-01')
      book = done(book, '2026-10-03')
      book = movedOn(book, '2026-10-03', due('2026-10-03', moved), '2026-10-04', false)
      const dates = scheduleOf(book, '2026-10-03').newPeriod(every3, hours)
      const changed: Carnet = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            createdAt: '2026-10-02T09:00:00.000Z',
            ...dates,
            frequency: every3,
            times: hours,
          }),
        ],
      }

      expect(scheduleOf(changed, '2026-10-03').upcoming(expected.length)).toEqual(expected)
    },
  )

  it.each([
    [['08:00', '20:00'], '20:00', { value: 3, unit: 'day' }, '2026-10-07'],
    [['08:00', '20:00'], '20:00', { value: 1, unit: 'day' }, '2026-10-05'],
    [['08:00', '20:00'], '20:00', { value: 1, unit: 'week' }, '2026-10-11'],
    [['08:00', '14:00', '20:00'], '14:00', { value: 3, unit: 'day' }, '2026-10-07'],
  ] as const)(
    'heures %j, %s reportée seule au 4, fréquence changée le 4 (%j) : le 4, seulement l’heure reportée, puis le %s (décision du 2026-10-10)',
    (hours, moved, frequency, then) => {
      const every2 = { value: 2, unit: 'day' } as const
      let book = carnet(period({ firstDueOn: '2026-10-01', frequency: every2, times: [...hours] }))
      for (const _ of hours) book = done(book, '2026-10-01')
      book = done(book, '2026-10-03')
      book = movedOn(book, '2026-10-03', due('2026-10-03', moved), '2026-10-04', false)
      const travelled = hours.filter((time) => time >= moved)
      const dates = scheduleOf(book, '2026-10-04').newPeriod(frequency, [...hours])
      const changed: Carnet = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p2',
            createdAt: '2026-10-02T09:00:00.000Z',
            ...dates,
            frequency,
            times: [...hours],
          }),
        ],
      }
      const schedule = scheduleOf(changed, '2026-10-04')

      expect(schedule.currentDoses).toEqual(travelled.map((time) => due('2026-10-04', time, 'p2')))
      expect(schedule.upcoming(travelled.length + 1).at(-1)).toEqual(due(then, hours[0], 'p2'))
    },
  )

  describe('plusieurs changements le jour d’arrivée : seule l’heure reportée reste (décision du 2026-10-10)', () => {
    type Setting = { frequency: { value: number; unit: 'day' | 'week' | 'month' }; times: string[] }
    const every2 = { value: 2, unit: 'day' } as const
    const every3 = { value: 3, unit: 'day' } as const
    const daily = { value: 1, unit: 'day' } as const
    const changedOn4 = (settings: Setting[]): Carnet => {
      let book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', false)
      settings.forEach(({ frequency, times: hours }, index) => {
        const dates = scheduleOf(book, '2026-10-04').newPeriod(frequency, hours)
        const id = `p${index + 2}`
        const createdAt = `2026-10-04T0${index}:00:00.000Z`
        book = {
          ...book,
          periods: [...book.periods, period({ id, createdAt, ...dates, frequency, times: hours })],
        }
      })
      return book
    }

    it('posologie changée le 4, 20 h du 4 oubliée, puis tous les 3 jours : rien le 4, puis le 7 (graine 310002240)', () => {
      let book = changedOn4([{ frequency: every2, times }])
      book = record(book, '2026-10-04', { kind: 'missed', due: due('2026-10-04', '20:00', 'p2') })
      const dates = scheduleOf(book, '2026-10-04').newPeriod(every3, times)
      book = {
        ...book,
        periods: [
          ...book.periods,
          period({
            id: 'p3',
            createdAt: '2026-10-04T05:00:00.000Z',
            ...dates,
            frequency: every3,
            times,
          }),
        ],
      }

      expect(dates.firstDueOn).toBe('2026-10-07')
      expect(scheduleOf(book, '2026-10-04').currentDoses).toEqual([
        due('2026-10-07', '08:00', 'p3'),
      ])
    })

    it.each([
      [
        'tous les 3 jours, puis tous les jours',
        [
          { frequency: every3, times },
          { frequency: daily, times },
        ],
        '20:00',
      ],
      [
        'tous les 3 jours, puis tous les 2 jours',
        [
          { frequency: every3, times },
          { frequency: every2, times },
        ],
        '20:00',
      ],
      [
        'posologie seule, puis tous les 3 jours',
        [
          { frequency: every2, times },
          { frequency: every3, times },
        ],
        '20:00',
      ],
      [
        'tous les 3 jours, puis 9 h et 21 h',
        [
          { frequency: every3, times },
          { frequency: every3, times: ['09:00', '21:00'] },
        ],
        '21:00',
      ],
      [
        'tous les 3 jours, tous les jours, puis tous les 2 jours',
        [
          { frequency: every3, times },
          { frequency: daily, times },
          { frequency: every2, times },
        ],
        '20:00',
      ],
    ] as const)('%s : le 4, une seule dose', (_, settings, time) => {
      const book = changedOn4(
        settings.map((setting) => ({ ...setting, times: [...setting.times] })),
      )
      const last = book.periods.at(-1)!.id

      expect(scheduleOf(book, '2026-10-04').currentDoses).toEqual([due('2026-10-04', time, last)])
    })
  })

  it('rien de noté le 3, la journée reportée seule au 4 garde ses deux heures', () => {
    const firstDay = done(
      done(carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times })), '2026-10-01'),
      '2026-10-01',
    )
    const book = movedOn(firstDay, '2026-10-02', due('2026-10-03', '08:00'), '2026-10-04', false)

    expect(scheduleOf(book, '2026-10-02').upcoming(3)).toEqual([
      due('2026-10-04', '08:00'),
      due('2026-10-04', '20:00'),
      due('2026-10-05', '08:00'),
    ])
  })

  it('tous les 3 jours à 8 h, 14 h et 20 h, 8 h du 4 donnée, 14 h reportée seule au 5 : 14 h et 20 h du 5, puis le 7', () => {
    const three = ['08:00', '14:00', '20:00']
    let book = carnet(
      period({ firstDueOn: '2026-10-01', frequency: { value: 3, unit: 'day' }, times: three }),
    )
    for (let index = 0; index < 3; index += 1) book = done(book, '2026-10-01')
    book = done(book, '2026-10-04')
    book = movedOn(book, '2026-10-04', due('2026-10-04', '14:00'), '2026-10-05', false)

    expect(scheduleOf(book, '2026-10-04').upcoming(3)).toEqual([
      due('2026-10-05', '14:00'),
      due('2026-10-05', '20:00'),
      due('2026-10-07', '08:00'),
    ])
  })
  describe('avec décalage, le jour d’arrivée ne reçoit que les heures parties (#735)', () => {
    const shiftedTo4 = movedOn(
      morningOf3,
      '2026-10-03',
      due('2026-10-03', '20:00'),
      '2026-10-04',
      true,
    )
    const changedOn = (
      book: Carnet,
      today: string,
      frequency: Frequency,
      hours: string[],
      id = 'p2',
    ): Carnet => {
      const dates = scheduleOf(book, today).newPeriod(frequency, hours)
      const createdAt = `${today}T0${book.periods.length}:00:00.000Z`
      return {
        ...book,
        periods: [...book.periods, period({ id, createdAt, ...dates, frequency, times: hours })],
      }
    }
    const purgedOf = (book: Carnet, today: string): Carnet => {
      const stale = scheduleOf(book, today).staleDoseIds
      return { ...book, doses: book.doses.filter(({ id }) => !stale.includes(id)) }
    }

    it('8 h du 3 donnée, 20 h du 3 reportée au 4 avec décalage : le 4, seule 20 h, puis le 6 à 8 h et 20 h', () => {
      expect(scheduleOf(shiftedTo4, '2026-10-03').upcoming(4)).toEqual([
        due('2026-10-04', '20:00'),
        due('2026-10-06', '08:00'),
        due('2026-10-06', '20:00'),
        due('2026-10-08', '08:00'),
      ])
      const onThe4th = scheduleOf(shiftedTo4, '2026-10-04')
      expect(onThe4th.currentDoses).toEqual([due('2026-10-04', '20:00')])
      expect(onThe4th.unloggedDoses).toEqual([])
      expect(scheduleOf(shiftedTo4, '2026-10-06').unloggedDoses).toEqual([
        due('2026-10-04', '20:00'),
      ])
    })

    it('décalage supprimé ensuite : le 4 garde 20 h seule, la suite revient au 5', () => {
      const shift = shiftedTo4.doses.find(({ status }) => status === 'shift')!

      expect(scheduleOf(withoutDose(shiftedTo4, shift.id), '2026-10-03').upcoming(3)).toEqual([
        due('2026-10-04', '20:00'),
        due('2026-10-05', '08:00'),
        due('2026-10-05', '20:00'),
      ])
    })

    it('rien de noté le 3, la journée reportée au 4 avec décalage garde ses deux heures, puis le 6', () => {
      const firstDay = done(
        done(carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times })), '2026-10-01'),
        '2026-10-01',
      )
      const book = movedOn(firstDay, '2026-10-02', due('2026-10-03', '08:00'), '2026-10-04', true)

      expect(scheduleOf(book, '2026-10-02').upcoming(3)).toEqual([
        due('2026-10-04', '08:00'),
        due('2026-10-04', '20:00'),
        due('2026-10-06', '08:00'),
      ])
    })

    it('reportée au 5, jour de la grille, avec décalage : le 5, seule 20 h, puis le 7 à 8 h et 20 h', () => {
      const book = movedOn(morningOf3, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-05', true)

      expect(scheduleOf(book, '2026-10-03').upcoming(3)).toEqual([
        due('2026-10-05', '20:00'),
        due('2026-10-07', '08:00'),
        due('2026-10-07', '20:00'),
      ])
    })

    it('tous les jours, 20 h du 3 reportée au 4 avec décalage : le 4, seule 20 h, puis le 5 à 8 h et 20 h', () => {
      let book = carnet(period({ firstDueOn: '2026-10-03', times }))
      book = done(book, '2026-10-03')
      book = movedOn(book, '2026-10-03', due('2026-10-03', '20:00'), '2026-10-04', true)

      expect(scheduleOf(book, '2026-10-03').upcoming(3)).toEqual([
        due('2026-10-04', '20:00'),
        due('2026-10-05', '08:00'),
        due('2026-10-05', '20:00'),
      ])
    })

    it('le 4 reporté à son tour au 5 avec décalage : seule 20 h part, puis le 7', () => {
      const book = movedOn(shiftedTo4, '2026-10-03', due('2026-10-04', '20:00'), '2026-10-05', true)

      expect(scheduleOf(book, '2026-10-03').upcoming(3)).toEqual([
        due('2026-10-05', '20:00'),
        due('2026-10-07', '08:00'),
        due('2026-10-07', '20:00'),
      ])
    })

    it('prise de 8 h du 3 supprimée : 8 h revient le 3, le 4 garde 20 h seule', () => {
      const morning = shiftedTo4.doses.find(
        ({ dueOn, status }) => dueOn === '2026-10-03' && status === 'given',
      )!
      const schedule = scheduleOf(withoutDose(shiftedTo4, morning.id), '2026-10-03')

      expect(schedule.currentDoses).toEqual([due('2026-10-03', '08:00')])
      expect(schedule.upcoming(3)).toEqual([
        due('2026-10-03', '08:00'),
        due('2026-10-04', '20:00'),
        due('2026-10-06', '08:00'),
      ])
    })

    it.each(['2026-10-03', '2026-10-04'])(
      'posologie changée le %s : le 4, seule 20 h, puis le 6',
      (today) => {
        const book = changedOn(shiftedTo4, today, twoDays, times)
        const schedule = scheduleOf(book, today)

        expect(schedule.upcoming(3)).toEqual([
          due('2026-10-04', '20:00', 'p2'),
          due('2026-10-06', '08:00', 'p2'),
          due('2026-10-06', '20:00', 'p2'),
        ])
        expect(schedule.unloggedDoses).toEqual([])
        expect(scheduleOf(purgedOf(book, today), today).upcoming(3)).toEqual(schedule.upcoming(3))
      },
    )

    it.each(['2026-10-03', '2026-10-04'])(
      'heures passées à 9 h et 21 h le %s : le 4, seule 21 h, puis le 6 à 9 h et 21 h',
      (today) => {
        const later = ['09:00', '21:00']
        const book = changedOn(shiftedTo4, today, twoDays, later)
        const schedule = scheduleOf(book, today)

        expect(schedule.upcoming(3)).toEqual([
          due('2026-10-04', '21:00', 'p2'),
          due('2026-10-06', '09:00', 'p2'),
          due('2026-10-06', '21:00', 'p2'),
        ])
        expect(schedule.unloggedDoses).toEqual([])
        expect(scheduleOf(purgedOf(book, today), today).upcoming(3)).toEqual(schedule.upcoming(3))
      },
    )

    it.each([
      [twoDays, times, '2026-10-06'],
      [twoDays, ['09:00', '21:00'], '2026-10-06'],
      [{ value: 3, unit: 'day' } as const, times, '2026-10-07'],
      [{ value: 1, unit: 'week' } as const, ['06:00', '12:00', '18:00', '23:00'], '2026-10-11'],
    ] as const)(
      'dose reportée donnée le 4, puis %j à %j le 4 : plus rien le 4, puis le %s (graine 340001775)',
      (frequency, hours, then) => {
        const given = record(shiftedTo4, '2026-10-04', {
          kind: 'given',
          due: due('2026-10-04', '20:00'),
          givenOn: '2026-10-04',
        })
        const dates = scheduleOf(given, '2026-10-04').newPeriod(frequency, [...hours])
        const book = changedOn(given, '2026-10-04', frequency, [...hours])
        const schedule = scheduleOf(book, '2026-10-04')

        expect(dates.firstDueOn).toBe(then)
        expect(schedule.upcoming(hours.length)).toEqual(hours.map((time) => due(then, time, 'p2')))
        expect(schedule.unloggedDoses).toEqual([])
      },
    )

    it.each([
      [{ value: 3, unit: 'day' } as const, '2026-10-07'],
      [{ value: 1, unit: 'day' } as const, '2026-10-05'],
      [{ value: 1, unit: 'week' } as const, '2026-10-11'],
    ])(
      'fréquence %j le 4, dose reportée pas encore donnée : 20 h le 4, puis le %s',
      (frequency, then) => {
        const book = changedOn(shiftedTo4, '2026-10-04', frequency, times)
        const schedule = scheduleOf(book, '2026-10-04')

        expect(schedule.currentDoses).toEqual([due('2026-10-04', '20:00', 'p2')])
        expect(schedule.upcoming(2)).toEqual([
          due('2026-10-04', '20:00', 'p2'),
          due(then, '08:00', 'p2'),
        ])
      },
    )

    it('tous les 3 jours, tous les jours, puis tous les 2 jours le 4 : le 4, seule 20 h', () => {
      let book = changedOn(shiftedTo4, '2026-10-04', { value: 3, unit: 'day' }, times, 'p2')
      book = changedOn(book, '2026-10-04', { value: 1, unit: 'day' }, times, 'p3')
      book = changedOn(book, '2026-10-04', twoDays, times, 'p4')

      expect(scheduleOf(book, '2026-10-04').currentDoses).toEqual([
        due('2026-10-04', '20:00', 'p4'),
      ])
    })
  })
})

describe('journée entière reportée seule, puis un réglage changé : la grille de base continue (#737)', () => {
  const twoDays = { value: 2, unit: 'day' } as const
  const times = ['08:00', '20:00']
  const later = ['09:00', '21:00']
  const reportedAlone = (
    first: TreatmentPeriodInput,
    from: string,
    to: string,
    today = from,
  ): Carnet => {
    let book = carnet(first)
    for (const _ of first.times.length > 0 ? first.times : [null])
      book = done(book, first.firstDueOn)
    const { report, shift } = scheduleOf(book, today).move(
      due(from, first.times[0] ?? null),
      to,
      false,
    )
    return applied(applied(book, shift), report)
  }
  const changedOn = (
    book: Carnet,
    today: string,
    frequency: Frequency,
    hours: string[],
  ): Carnet => {
    const dates = scheduleOf(book, today).newPeriod(frequency, hours)
    return withPeriod(book, { ...dates, frequency, times: hours })
  }
  const givenOn4 = (book: Carnet, ...hours: string[]): Carnet =>
    hours.reduce(
      (current, time) =>
        record(current, '2026-10-04', {
          kind: 'given',
          due: due('2026-10-04', time),
          givenOn: '2026-10-04',
        }),
      book,
    )
  const slots = (dues: readonly Due[]) => dues.map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`)
  const third = reportedAlone(
    period({ firstDueOn: '2026-10-01', frequency: twoDays, times }),
    '2026-10-03',
    '2026-10-04',
  )

  it.each(['2026-10-03', '2026-10-04'])(
    'tous les 2 jours à 8 h et 20 h, rien de noté le 3, la journée reportée seule au 4, heures passées à 9 h et 21 h le %s : 4, 5, 7',
    (today) => {
      expect(slots(scheduleOf(third, today).upcoming(5))).toEqual([
        '2026-10-04 08:00',
        '2026-10-04 20:00',
        '2026-10-05 08:00',
        '2026-10-05 20:00',
        '2026-10-07 08:00',
      ])

      const changed = scheduleOf(changedOn(third, today, twoDays, later), today)

      expect(slots(changed.upcoming(5))).toEqual([
        '2026-10-04 09:00',
        '2026-10-04 21:00',
        '2026-10-05 09:00',
        '2026-10-05 21:00',
        '2026-10-07 09:00',
      ])
      expect(changed.unloggedDoses).toEqual([])
    },
  )

  it.each([
    ['2026-10-03', ['09:00']],
    ['2026-10-04', ['09:00']],
    ['2026-10-03', ['08:00', '14:00', '20:00']],
    ['2026-10-04', ['08:00', '14:00', '20:00']],
  ])(
    'heures changées le %s pour %j : le 4 dans les nouvelles heures, puis le 5 et le 7',
    (today, hours) => {
      const changed = scheduleOf(changedOn(third, today, twoDays, hours), today)

      expect(dueDays(changed.upcoming(hours.length * 3))).toEqual(
        ['2026-10-04', '2026-10-05', '2026-10-07'].flatMap((day) => hours.map(() => day)),
      )
    },
  )

  it.each([
    [
      ['09:00', '21:00'],
      ['2026-10-04 21:00', '2026-10-05 09:00', '2026-10-05 21:00'],
    ],
    [
      ['08:00', '14:00', '20:00'],
      ['2026-10-04 14:00', '2026-10-04 20:00', '2026-10-05 08:00'],
    ],
    [['09:00'], ['2026-10-05 09:00', '2026-10-07 09:00', '2026-10-09 09:00']],
  ])(
    '8 h du 4 donnée, heures passées le 4 à %j : les heures restantes du 4 (Q24), puis le 5',
    (hours, upcoming) => {
      const changed = scheduleOf(
        changedOn(givenOn4(third, '08:00'), '2026-10-04', twoDays, hours),
        '2026-10-04',
      )

      expect(slots(changed.upcoming(3))).toEqual(upcoming)
    },
  )

  it.each([
    [
      ['09:00', '21:00'],
      ['2026-10-05 09:00', '2026-10-05 21:00', '2026-10-07 09:00'],
    ],
    [['09:00'], ['2026-10-05 09:00', '2026-10-07 09:00', '2026-10-09 09:00']],
    [
      ['08:00', '14:00', '20:00'],
      ['2026-10-04 20:00', '2026-10-05 08:00', '2026-10-05 14:00'],
    ],
  ])(
    'les deux doses du 4 données, heures passées le 4 à %j : la grille reprend le 5',
    (hours, upcoming) => {
      const changed = scheduleOf(
        changedOn(givenOn4(third, '08:00', '20:00'), '2026-10-04', twoDays, hours),
        '2026-10-04',
      )

      expect(slots(changed.upcoming(3))).toEqual(upcoming)
    },
  )

  it.each(['2026-10-03', '2026-10-04'])(
    'une seule heure par jour, dose du 3 reportée seule au 4, heure passée à 9 h le %s : 4, 5, 7',
    (today) => {
      const book = reportedAlone(
        period({ firstDueOn: '2026-10-01', frequency: twoDays, times: ['08:00'] }),
        '2026-10-03',
        '2026-10-04',
      )

      expect(
        slots(scheduleOf(changedOn(book, today, twoDays, ['09:00']), today).upcoming(3)),
      ).toEqual(['2026-10-04 09:00', '2026-10-05 09:00', '2026-10-07 09:00'])
    },
  )

  it.each(['2026-10-08', '2026-10-10'])(
    'hebdomadaire (1, 8, 15), journée du 8 reportée seule au 10, heures changées le %s : 10, 15, 22',
    (today) => {
      const book = reportedAlone(
        weekly({ firstDueOn: '2026-10-01', times }),
        '2026-10-08',
        '2026-10-10',
      )

      expect(
        dueDays(
          scheduleOf(changedOn(book, today, { value: 1, unit: 'week' }, later), today).upcoming(6),
        ),
      ).toEqual([
        '2026-10-10',
        '2026-10-10',
        '2026-10-15',
        '2026-10-15',
        '2026-10-22',
        '2026-10-22',
      ])
    },
  )

  it.each(['2026-11-01', '2026-11-03'])(
    'mensuel du 1er, journée du 1er nov. reportée seule au 3, heures changées le %s : 3 nov., 1er déc., 1er janv.',
    (today) => {
      const book = reportedAlone(
        monthly({ firstDueOn: '2026-10-01', times }),
        '2026-11-01',
        '2026-11-03',
      )

      expect(
        dueDays(
          scheduleOf(changedOn(book, today, { value: 1, unit: 'month' }, later), today).upcoming(6),
        ),
      ).toEqual([
        '2026-11-03',
        '2026-11-03',
        '2026-12-01',
        '2026-12-01',
        '2027-01-01',
        '2027-01-01',
      ])
    },
  )

  it.each([
    ['2026-10-03', { value: 3, unit: 'day' }, ['2026-10-04', '2026-10-07', '2026-10-10']],
    ['2026-10-04', { value: 3, unit: 'day' }, ['2026-10-04', '2026-10-07', '2026-10-10']],
    ['2026-10-04', { value: 1, unit: 'day' }, ['2026-10-04', '2026-10-05', '2026-10-06']],
    ['2026-10-04', { value: 1, unit: 'week' }, ['2026-10-04', '2026-10-11', '2026-10-18']],
  ] as const)(
    'fréquence changée le %s (%j) : le 4 garde la journée reportée, puis le nouveau rythme part du 4',
    (today, frequency, upcoming) => {
      const changed = scheduleOf(changedOn(third, today, frequency, later), today)

      expect(dueDays(changed.upcoming(6))).toEqual(upcoming.flatMap((day) => [day, day]))
    },
  )

  it.each([
    ['reportée seule au 5', '2026-10-04', '2026-10-05', '2026-10-06'],
    ['avancée seule au 3', '2026-10-02', '2026-10-03', '2026-10-04'],
  ])(
    'tous les 3 jours (1, 4, 7) à 8 h et 20 h, journée du 4 %s, 8 h donnée ce jour-là, posologie changée le lendemain : prochaine dose le 7',
    (_, movedOn, to, today) => {
      const every3 = { value: 3, unit: 'day' } as const
      const first = period({ firstDueOn: '2026-10-01', frequency: every3, times })
      const book = record(reportedAlone(first, '2026-10-04', to, movedOn), to, {
        kind: 'given',
        due: due(to, '08:00'),
        givenOn: to,
      })
      const changed = scheduleOf(changedOn(book, today, every3, times), today)

      expect(dueDays(changed.upcoming(3))).toEqual(['2026-10-07', '2026-10-07', '2026-10-10'])
      expect(changed.unloggedDoses).toEqual([due(to, '20:00')])
    },
  )
})

describe('changer la posologie ne change jamais le calendrier (G23, #692)', () => {
  it('hebdomadaire, dose du 17 avancée au 12 avec décalage, prise du 12 notée le 6 puis supprimée, dose du 20 avancée seule au 18 : aucune dose le 13', () => {
    const weekly1 = { value: 1, unit: 'week' } as const
    let book = carnet(weekly({ startsOn: '2026-04-02', firstDueOn: '2026-04-17' }))
    const advanced = scheduleOf(book, '2026-04-06').move(due('2026-04-17'), '2026-04-12', true)
    book = applied(applied(book, advanced.shift), advanced.report)
    book = record(book, '2026-04-06', {
      kind: 'given',
      due: due('2026-04-12'),
      givenOn: '2026-04-06',
      shiftsFollowing: true,
    })
    book = withoutDose(book, lastDose(book).id)
    const alone = scheduleOf(book, '2026-04-06').move(due('2026-04-20'), '2026-04-18', false)
    book = applied(applied(book, alone.shift), alone.report)
    expect(dueDays(scheduleOf(book, '2026-04-06').upcoming(3))).toEqual([
      '2026-04-12',
      '2026-04-18',
      '2026-04-27',
    ])

    const dates = scheduleOf(book, '2026-04-06').newPeriod(weekly1, [])
    const changed = withPeriod(book, { ...dates, frequency: weekly1, times: [] })

    expect(dueDays(scheduleOf(changed, '2026-04-06').upcoming(3))).toEqual([
      '2026-04-12',
      '2026-04-20',
      '2026-04-27',
    ])
  })

  it('une prise d’une période plus ancienne, à un autre rythme, ne couvre pas une heure restée à donner (G22)', () => {
    const every3 = { value: 3, unit: 'day' } as const
    const times = ['08:00', '14:00', '20:00']
    let book: Carnet = {
      periods: [
        weekly({ firstDueOn: '2026-10-01' }),
        period({
          id: 'p2',
          startsOn: '2026-10-06',
          firstDueOn: '2026-10-08',
          referenceOn: '2026-10-08',
          frequency: every3,
          times,
          createdAt: '2026-10-06T09:00:00.000Z',
        }),
      ],
      doses: [
        stored({
          periodId: 'p1',
          dueOn: '2026-10-08',
          dueTime: null,
          givenOn: '2026-10-06',
          status: 'given',
          nextDueDate: '2026-10-15',
        }),
      ],
    }
    for (const time of ['08:00', '20:00']) {
      book = record(book, '2026-10-06', {
        kind: 'given',
        due: due('2026-10-08', time, 'p2'),
        givenOn: '2026-10-06',
        shiftsFollowing: false,
      })
    }
    const before = scheduleOf(book, '2026-10-06').upcoming(2)
    expect(before[0]).toEqual(due('2026-10-08', '14:00', 'p2'))

    const dates = scheduleOf(book, '2026-10-06').newPeriod(every3, times)
    const changed: Carnet = {
      ...book,
      periods: [
        ...book.periods,
        period({
          id: 'p3',
          createdAt: '2026-10-06T10:00:00.000Z',
          ...dates,
          frequency: every3,
          times,
        }),
      ],
    }

    expect(scheduleOf(changed, '2026-10-06').upcoming(2)).toEqual([
      due('2026-10-08', '14:00', 'p3'),
      due('2026-10-11', '08:00', 'p3'),
    ])
  })

  const afterChange = (base: Carnet, today: string, from: Due, to: string, shifts: boolean) => {
    const { report, shift } = scheduleOf(base, today).move(from, to, shifts)
    const book = applied(applied(base, shift), report)
    const { frequency, times } = book.periods[0]!
    const dates = scheduleOf(book, today).newPeriod(frequency, [...times])
    return {
      before: dueDays(scheduleOf(book, today).upcoming(4)),
      after: dueDays(
        scheduleOf(withPeriod(book, { ...dates, frequency, times }), today).upcoming(4),
      ),
    }
  }
  const weeklyGiven = done(carnet(weekly({ firstDueOn: '2026-10-01' })), '2026-10-01')
  const everyTwoDays = done(
    carnet(period({ firstDueOn: '2026-10-01', frequency: { value: 2, unit: 'day' } })),
    '2026-10-03',
    '2026-10-03',
  )
  const the31st = done(carnet(monthly({ firstDueOn: '2027-01-31' })), '2027-01-31')

  it.each([
    [
      'hebdomadaire, dose du 8 avancée au 6 avec décalage',
      weeklyGiven,
      '2026-10-02',
      '2026-10-08',
      '2026-10-06',
      true,
    ],
    [
      'tous les 2 jours, dose du 5 avancée au 4 avec décalage',
      everyTwoDays,
      '2026-10-03',
      '2026-10-05',
      '2026-10-04',
      true,
    ],
    [
      'mensuel du 31, dose du 28 févr. avancée au 25 avec décalage',
      the31st,
      '2027-02-02',
      '2027-02-28',
      '2027-02-25',
      true,
    ],
    [
      'mensuel du 31, dose du 28 févr. avancée seule au 25',
      the31st,
      '2027-02-02',
      '2027-02-28',
      '2027-02-25',
      false,
    ],
    [
      'mensuel du 31, dose du 28 févr. reportée seule au 2 mars',
      the31st,
      '2027-02-02',
      '2027-02-28',
      '2027-03-02',
      false,
    ],
  ])('%s, posologie changée : même calendrier', (_, base, today, from, to, shifts) => {
    const { before, after } = afterChange(base, today, due(from), to, shifts)

    expect(after).toEqual(before)
  })

  const changedOn = (book: Carnet, today: string) => {
    const { frequency, times } = book.periods[0]!
    const dates = scheduleOf(book, today).newPeriod(frequency, [...times])
    return dueDays(scheduleOf(withPeriod(book, { ...dates, frequency, times }), today).upcoming(3))
  }
  const movedAlone = (book: Carnet, today: string, from: string, to: string) => {
    const { report, shift } = scheduleOf(book, today).move(due(from), to, false)
    return applied(applied(book, shift), report)
  }

  it('hebdomadaire à venir le 1er oct., dose du 1er avancée seule au 29 sept., dose du 8 reportée seule au 10 : la grille reste, le report lointain part (G5)', () => {
    let book = carnet(weekly({ startsOn: '2026-09-26', firstDueOn: '2026-10-01' }))
    book = movedAlone(book, '2026-09-26', '2026-10-01', '2026-09-29')
    book = movedAlone(book, '2026-09-26', '2026-10-08', '2026-10-10')

    expect(changedOn(book, '2026-09-26')).toEqual(['2026-09-29', '2026-10-08', '2026-10-15'])
  })

  it('hebdomadaire, dose du 8 avancée seule au 6, dose du 15 reportée seule au 17 : 6, 15, 22 (G5)', () => {
    let book = weeklyGiven
    book = movedAlone(book, '2026-10-02', '2026-10-08', '2026-10-06')
    book = movedAlone(book, '2026-10-02', '2026-10-15', '2026-10-17')

    expect(changedOn(book, '2026-10-02')).toEqual(['2026-10-06', '2026-10-15', '2026-10-22'])
  })

  it('hebdomadaire à 8 h et 20 h, 8 h du 1er donnée, 20 h du 1er déplacée au 3 avec décalage, posologie changée le 1er : le 3 à 20 h seule (#735), puis le 10', () => {
    const times = ['08:00', '20:00']
    let book = carnet(weekly({ firstDueOn: '2026-10-01', times }))
    book = done(book, '2026-10-01')
    const { report, shift } = scheduleOf(book, '2026-10-01').move(
      due('2026-10-01', '20:00'),
      '2026-10-03',
      true,
    )
    book = applied(applied(book, shift), report)
    const dates = scheduleOf(book, '2026-10-01').newPeriod({ value: 1, unit: 'week' }, times)
    const changed = withPeriod(book, { ...dates, frequency: { value: 1, unit: 'week' }, times })

    expect(scheduleOf(changed, '2026-10-01').upcoming(3)).toEqual([
      due('2026-10-03', '20:00', 'p2'),
      due('2026-10-10', '08:00', 'p2'),
      due('2026-10-10', '20:00', 'p2'),
    ])
  })

  it('période écrite avant G23 (jour de référence avant la première échéance) : relue comme avant', () => {
    const twoDays = { value: 2, unit: 'day' } as const
    let book = done(carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays })), '2026-10-01')
    book = withPeriod(book, {
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-04',
      referenceOn: '2026-10-01',
      frequency: twoDays,
      times: [],
    })
    for (const day of ['2026-10-04', '2026-10-06', '2026-10-08']) {
      book = record(book, day, { kind: 'given', due: due(day, null, 'p2'), givenOn: day })
    }

    const schedule = scheduleOf(book, '2026-10-09')
    expect(schedule.unloggedDoses).toEqual([])
    expect(dueDays(schedule.upcoming(1))).toEqual(['2026-10-10'])
  })
})

describe('heures ou fréquence changées : une dose déjà donnée compte, le nouveau réglage part de la suivante (G24, #711)', () => {
  const twoDays = { value: 2, unit: 'day' } as const
  const threeDays = { value: 3, unit: 'day' } as const
  const times = ['08:00', '20:00']
  const start = carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times }))
  const firstDay = done(done(start, '2026-10-01'), '2026-10-01')
  const morningAhead = done(firstDay, '2026-10-02')
  const changedOn = (book: Carnet, frequency: Frequency, newTimes: string[]) => {
    const dates = scheduleOf(book, '2026-10-02').newPeriod(frequency, newTimes)
    return {
      dates,
      schedule: scheduleOf(
        withPeriod(book, { ...dates, frequency, times: newTimes }),
        '2026-10-02',
      ),
    }
  }

  it('8 h du 3 donnée le 2, heures passées à 9 h et 21 h : il ne reste que 21 h le 3, puis le 5', () => {
    const { dates, schedule } = changedOn(morningAhead, twoDays, ['09:00', '21:00'])

    expect(dates).toEqual({
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-03',
      referenceOn: '2026-10-01',
    })
    expect(schedule.upcoming(3)).toEqual([
      due('2026-10-03', '21:00', 'p2'),
      due('2026-10-05', '09:00', 'p2'),
      due('2026-10-05', '21:00', 'p2'),
    ])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('8 h du 3 donnée le 2, tous les 3 jours : 20 h du 3, puis le 6', () => {
    const { schedule } = changedOn(morningAhead, threeDays, times)

    expect(schedule.upcoming(3)).toEqual([
      due('2026-10-03', '20:00', 'p2'),
      due('2026-10-06', '08:00', 'p2'),
      due('2026-10-06', '20:00', 'p2'),
    ])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('20 h du 3 donnée le 2, tous les 3 jours : chaque prise couvre son heure, 8 h du 3 reste', () => {
    const eveningAhead = record(firstDay, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-03', '20:00'),
      givenOn: '2026-10-02',
    })

    expect(changedOn(eveningAhead, threeDays, times).schedule.upcoming(2)).toEqual([
      due('2026-10-03', '08:00', 'p2'),
      due('2026-10-06', '08:00', 'p2'),
    ])
  })

  it('8 h du 3 donnée le 2, heures passées à 9 h seule : rien ne reste le 3, prochaine dose le 5', () => {
    const { dates, schedule } = changedOn(morningAhead, twoDays, ['09:00'])

    expect(dates.firstDueOn).toBe('2026-10-05')

    expect(schedule.upcoming(2)).toEqual([
      due('2026-10-05', '09:00', 'p2'),
      due('2026-10-07', '09:00', 'p2'),
    ])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('8 h du 3 donnée le 2, tous les jours à 8 h : le 3 est couvert, prochaine dose le 4', () => {
    const daily = { value: 1, unit: 'day' } as const
    const { dates, schedule } = changedOn(morningAhead, daily, ['08:00'])

    expect(dates.firstDueOn).toBe('2026-10-04')
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-10-04', '2026-10-05'])
  })

  it('Doses du 1er à 8 h et 20 h données le 30 sept., la dernière avec décalage, tous les jours à 20 h le 30 : la suite est repartie du 30, le 1er reste à donner (Q8)', () => {
    let book = carnet(monthly({ firstDueOn: '2026-09-01', times }))
    book = done(done(book, '2026-09-01'), '2026-09-01')
    for (const time of ['08:00', '20:00']) {
      book = record(book, '2026-09-30', {
        kind: 'given',
        due: due('2026-10-01', time),
        givenOn: '2026-09-30',
        shiftsFollowing: time === '20:00',
      })
    }
    const daily = { value: 1, unit: 'day' } as const
    const dates = scheduleOf(book, '2026-09-30').newPeriod(daily, ['20:00'])
    const changed = withPeriod(book, { ...dates, frequency: daily, times: ['20:00'] })

    expect(dates.firstDueOn).toBe('2026-10-01')
    expect(dueDays(scheduleOf(changed, '2026-09-30').upcoming(1))).toEqual(['2026-10-01'])
  })

  it('tous les 3 jours à 9 h, dose du 4 donnée le 2 avec décalage, tous les 2 jours le 3 : prochaine dose le 4 (Q8)', () => {
    const at9 = ['09:00']
    let book = carnet(period({ firstDueOn: '2026-10-01', frequency: threeDays, times: at9 }))
    book = done(book, '2026-10-01')
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-04', '09:00'),
      givenOn: '2026-10-02',
      shiftsFollowing: true,
    })
    const dates = scheduleOf(book, '2026-10-03').newPeriod(twoDays, at9)
    const changed = withPeriod(book, { ...dates, frequency: twoDays, times: at9 })

    expect(scheduleOf(changed, '2026-10-03').upcoming(2)).toEqual([
      due('2026-10-04', '09:00', 'p2'),
      due('2026-10-06', '09:00', 'p2'),
    ])
  })

  it('hebdomadaire à 8 h, dose du 8 donnée le 5 avec décalage, tous les 3 jours le 6 : prochaine dose le 8 (Q8)', () => {
    const at8 = ['08:00']
    let book = carnet(weekly({ firstDueOn: '2026-10-01', times: at8 }))
    book = done(book, '2026-10-01')
    book = record(book, '2026-10-05', {
      kind: 'given',
      due: due('2026-10-08', '08:00'),
      givenOn: '2026-10-05',
      shiftsFollowing: true,
    })
    const dates = scheduleOf(book, '2026-10-06').newPeriod(threeDays, at8)
    const changed = withPeriod(book, { ...dates, frequency: threeDays, times: at8 })

    expect(scheduleOf(changed, '2026-10-06').upcoming(2)).toEqual([
      due('2026-10-08', '08:00', 'p2'),
      due('2026-10-11', '08:00', 'p2'),
    ])
  })

  it('tous les 2 jours à 8 h, dose du 5 donnée le 4 avec décalage, le 5 tous les 3 jours à 8 h et 20 h : reste 20 h le 5 (Q24)', () => {
    let book = carnet(period({ firstDueOn: '2026-10-01', frequency: twoDays, times: ['08:00'] }))
    book = done(done(book, '2026-10-01'), '2026-10-03')
    book = record(book, '2026-10-04', {
      kind: 'given',
      due: due('2026-10-05', '08:00'),
      givenOn: '2026-10-04',
      shiftsFollowing: true,
    })
    const dates = scheduleOf(book, '2026-10-05').newPeriod(threeDays, times)
    const changed = withPeriod(book, { ...dates, frequency: threeDays, times })

    expect(scheduleOf(changed, '2026-10-05').upcoming(2)).toEqual([
      due('2026-10-05', '20:00', 'p2'),
      due('2026-10-08', '08:00', 'p2'),
    ])
  })

  describe('tous les 3 jours à 8 h et 20 h, 8 h et 20 h du 4 données le 2, le 20 h avec décalage (Q8)', () => {
    let book = carnet(period({ firstDueOn: '2026-10-01', frequency: threeDays, times }))
    book = done(done(book, '2026-10-01'), '2026-10-01')
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-04', '08:00'),
      givenOn: '2026-10-02',
      shiftsFollowing: false,
    })
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-04', '20:00'),
      givenOn: '2026-10-02',
      shiftsFollowing: true,
    })
    const changedOn = (newTimes: string[]) => {
      const dates = scheduleOf(book, '2026-10-03').newPeriod(twoDays, newTimes)
      const changed = withPeriod(book, { ...dates, frequency: twoDays, times: newTimes })
      return scheduleOf(changed, '2026-10-03').upcoming(2)
    }

    it('tous les 2 jours le 3 : la journée a décalé la suite, le 4 entier reste à donner', () => {
      expect(changedOn(times)).toEqual([
        due('2026-10-04', '08:00', 'p2'),
        due('2026-10-04', '20:00', 'p2'),
      ])
    })

    it('tous les 2 jours à 8 h le 3 : prochaine dose le 4', () => {
      expect(dueDays(changedOn(['08:00']))).toEqual(['2026-10-04', '2026-10-06'])
    })
  })

  it('hebdomadaire à 8 h, 14 h et 20 h, 8 h du 8 donnée le 2, puis la suite décalée au 3 : tous les 3 jours, la journée reprise entière', () => {
    const three = ['08:00', '14:00', '20:00']
    let book = carnet(weekly({ firstDueOn: '2026-10-01', times: three }))
    book = done(done(book, '2026-10-01'), '2026-10-01')
    book = record(book, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-08', '08:00'),
      givenOn: '2026-10-02',
      shiftsFollowing: false,
    })
    book = record(book, '2026-10-03', {
      kind: 'given',
      due: due('2026-10-01', '20:00'),
      givenOn: '2026-10-03',
      shiftsFollowing: true,
    })
    const dates = scheduleOf(book, '2026-10-03').newPeriod(threeDays, three)
    const changed = withPeriod(book, { ...dates, frequency: threeDays, times: three })

    expect(scheduleOf(changed, '2026-10-03').upcoming(3)).toEqual(
      three.map((time) => due(dates.firstDueOn, time, 'p2')),
    )
  })

  it('toutes les 2 semaines sans heure, dose du 13 donnée le 12 avec décalage, le 13 tous les jours : dose le 13 (Q8)', () => {
    const twoWeeks = { value: 2, unit: 'week' } as const
    let book = done(carnet(period({ firstDueOn: '2026-09-29', frequency: twoWeeks })), '2026-09-29')
    book = record(book, '2026-10-12', {
      kind: 'given',
      due: due('2026-10-13'),
      givenOn: '2026-10-12',
      shiftsFollowing: true,
    })
    const daily = { value: 1, unit: 'day' } as const
    const dates = scheduleOf(book, '2026-10-13').newPeriod(daily, [])
    const changed = withPeriod(book, { ...dates, frequency: daily, times: [] })

    expect(dueDays(scheduleOf(changed, '2026-10-13').upcoming(2))).toEqual([
      '2026-10-13',
      '2026-10-14',
    ])
  })

  it('quotidien à 8 h et 20 h, 20 h du 2 donnée la première, tous les 2 jours le 2 : la prise couvre le 20 h, le 8 h du 2 reste', () => {
    const daily = carnet(
      period({ firstDueOn: '2026-10-01', frequency: { value: 1, unit: 'day' }, times }),
    )
    const evening = record(daily, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-02', '20:00'),
      givenOn: '2026-10-02',
    })
    const dates = scheduleOf(evening, '2026-10-02').newPeriod(twoDays, times)

    expect(
      scheduleOf(
        withPeriod(evening, { ...dates, frequency: twoDays, times }),
        '2026-10-02',
      ).upcoming(2),
    ).toEqual([due('2026-10-02', '08:00', 'p2'), due('2026-10-04', '08:00', 'p2')])
  })

  it('rien de noté le 3, tous les 3 jours : la dernière prise plus la nouvelle fréquence, comme avant (TR-7)', () => {
    expect(scheduleOf(firstDay, '2026-10-02').newPeriod(threeDays, times)).toEqual({
      startsOn: '2026-10-02',
      firstDueOn: '2026-10-04',
      referenceOn: '2026-10-04',
    })
  })
})

describe('un déplacement qui arrive après la fermeture de sa période est sans effet (G5, Q25, #482)', () => {
  const noted = done(carnet(weekly({ firstDueOn: '2026-09-18' })), '2026-09-25')
  const next = period({
    id: 'p2',
    startsOn: '2026-09-28',
    firstDueOn: '2026-10-10',
    referenceOn: '2026-10-10',
    frequency: { value: 10, unit: 'day' },
    createdAt: '2026-09-28T08:00:00.000Z',
  })
  const changed = (book: Carnet): Carnet => ({ ...book, periods: [...book.periods, next] })
  const calendar = (book: Carnet, today: string) => {
    const schedule = scheduleOf(book, today)
    return {
      phase: schedule.phase,
      current: schedule.currentDoses,
      unlogged: schedule.unloggedDoses,
      upcoming: schedule.upcoming(5),
    }
  }

  it('reportée au 15 déc. puis fréquence changée le 28 sept. : la ligne quitte l’historique', () => {
    const book = changed(storedMove(noted, '2026-10-02', '2026-12-15'))
    const line = lastDose(book)
    const schedule = scheduleOf(book, '2026-09-28')

    expect(schedule.staleDoseIds).toEqual([line.id])
    expect(schedule.doses.map(({ id }) => id)).not.toContain(line.id)
    expect(calendar(book, '2026-09-28')).toEqual(calendar(withoutDose(book, line.id), '2026-09-28'))
  })

  it('une arrivée le jour même du début de la période suivante est sans effet', () => {
    const book = changed(storedMove(noted, '2026-10-02', '2026-09-28'))

    expect(scheduleOf(book, '2026-09-28').staleDoseIds).toEqual([lastDose(book).id])
  })

  it('arrêté le 28 sept. : un report au 15 oct. de la dose du 2 oct. est sans effet', () => {
    const stopped = {
      ...noted,
      periods: noted.periods.map((stoppedPeriod) => ({
        ...stoppedPeriod,
        stoppedOn: '2026-09-28',
      })),
    }
    const book = storedMove(stopped, '2026-10-02', '2026-10-15')
    const line = lastDose(book)

    expect(scheduleOf(book, '2026-10-20').staleDoseIds).toEqual([line.id])
    expect(calendar(book, '2026-10-20')).toEqual(calendar(withoutDose(book, line.id), '2026-10-20'))
  })

  it('la dose d’arrivée notée, la ligne reste dans l’historique', () => {
    const moved = changed(storedMove(noted, '2026-10-02', '2026-12-15'))
    const line = lastDose(moved)
    const arrival = stored({
      periodId: 'p1',
      dueOn: '2026-12-15',
      dueTime: null,
      givenOn: '2026-12-15',
      status: 'given',
      nextDueDate: '2026-12-22',
    })
    const schedule = scheduleOf({ ...moved, doses: [...moved.doses, arrival] }, '2026-12-16')

    expect(schedule.staleDoseIds).toEqual([])
    expect(schedule.lockedMoveIds).toEqual([line.id])
    expect(schedule.doses.map(({ id }) => id)).toContain(line.id)
  })

  it('une dose d’avant la fermeture reportée après elle garde sa ligne : son échéance reste retirée', () => {
    const book = changed(storedMove(noted, '2026-09-18', '2026-10-01'))
    const schedule = scheduleOf(book, '2026-09-28')

    expect(schedule.staleDoseIds).toEqual([])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('un nouveau réglage le 30 sept. repart de la prise du 25, pas du report sans effet', () => {
    const book = changed(storedMove(noted, '2026-10-02', '2026-12-15'))

    expect(scheduleOf(book, '2026-09-30').newPeriod({ value: 1, unit: 'week' }, [])).toEqual({
      startsOn: '2026-09-30',
      firstDueOn: '2026-10-02',
      referenceOn: '2026-10-02',
    })
  })

  it('reprise le 30 sept. après l’arrêt du 28 : la suite repart de la prise du 25', () => {
    const moved = storedMove(noted, '2026-10-02', '2026-10-15')
    const book = {
      ...moved,
      periods: moved.periods.map((stoppedPeriod) => ({
        ...stoppedPeriod,
        stoppedOn: '2026-09-28',
      })),
    }

    expect(scheduleOf(book, '2026-09-30').newPeriod({ value: 1, unit: 'week' }, [])).toEqual({
      startsOn: '2026-09-30',
      firstDueOn: '2026-10-02',
      referenceOn: '2026-10-02',
    })
  })

  it('une arrivée avant la fermeture garde sa ligne', () => {
    const book = changed(storedMove(noted, '2026-10-02', '2026-09-27'))

    expect(scheduleOf(book, '2026-09-28').staleDoseIds).toEqual([])
  })
})
