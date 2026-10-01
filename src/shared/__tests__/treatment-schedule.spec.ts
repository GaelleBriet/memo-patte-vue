// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { treatmentSchedule } from '../domain/treatment-schedule'

import {
  carnet,
  days,
  done,
  doneEachDay,
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
      expect(scheduleOf(miloOn8, '2026-09-10').newPeriodFirstDue(fifteenDays)).toBe('2026-09-23')
    })

    it('jamais avant aujourd’hui : Milo, dernière prise le 8 sept., passé à 15 jours le 29', () => {
      expect(scheduleOf(miloOn8, '2026-09-29').newPeriodFirstDue(fifteenDays)).toBe('2026-09-29')
    })

    it('sans aucune prise, aujourd’hui', () => {
      expect(scheduleOf(carnet(weekly()), '2026-09-29').newPeriodFirstDue(fifteenDays)).toBe(
        '2026-09-29',
      )
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

  it('tous les 2 jours à 8 h et 20 h : le lendemain, la dernière heure est en retard', () => {
    const schedule = scheduleOf(
      carnet(
        period({
          firstDueOn: '2026-09-28',
          frequency: { value: 2, unit: 'day' },
          times: ['08:00', '20:00'],
        }),
      ),
      '2026-09-29',
    )

    expect(schedule.currentDoses).toEqual([due('2026-09-28', '20:00')])
    expect(schedule.phase).toBe('overdue')
    expect(schedule.unloggedDoses).toEqual([due('2026-09-28', '08:00')])
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
      periodId: 'p1',
      dueOn: '2026-09-28',
      dueTime: '20:00',
      givenOn: '2026-09-28',
      status: 'given',
      nextDueDate: '2026-09-29',
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

  it('la prise déplacée recalcule la prochaine dose qu’elle fixe', () => {
    expect(
      scheduleOf(book, '2026-10-02').doseFor({
        kind: 'redated',
        doseId: septemberDose.id,
        givenOn: '2026-08-28',
      }),
    ).toEqual({
      periodId: 'p1',
      dueOn: '2026-09-05',
      dueTime: null,
      givenOn: '2026-08-28',
      status: 'given',
      nextDueDate: '2026-09-28',
    })
  })

  it('un report placé après elle est gardé, sans dose à renseigner de plus', () => {
    const moved = redate(book, '2026-10-02', septemberDose.id, '2026-08-28')
    const schedule = scheduleOf(moved, '2026-10-02')

    expect(schedule.currentDoses).toEqual([due('2026-10-10')])
    expect(schedule.phase).toBe('upcoming')
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('un report qui ne tombe plus après la prise déplacée est dépassé : la suite repart de la prise', () => {
    const moved = redate(book, '2026-10-20', septemberDose.id, '2026-10-12')
    const schedule = scheduleOf(moved, '2026-10-20')

    expect(lastDose(moved).status).toBe('postponed')
    expect(schedule.currentDoses).toEqual([due('2026-11-12')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('une prise qui ne fixait pas la suite (dose non renseignée notée tard) la laisse en place', () => {
    let panacur = doneEachDay(
      carnet(period({ firstDueOn: '2026-10-05' })),
      '2026-10-05',
      '2026-10-05',
    )
    panacur = record(panacur, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-06'),
      givenOn: '2026-10-07',
    })

    expect(
      scheduleOf(panacur, '2026-10-08').doseFor({
        kind: 'redated',
        doseId: lastDose(panacur).id,
        givenOn: '2026-10-08',
      }).nextDueDate,
    ).toBe('2026-10-07')
  })

  it('refuse une prise inconnue ou qui n’est pas donnée', () => {
    const schedule = scheduleOf(book, '2026-10-02')

    expect(() =>
      schedule.doseFor({ kind: 'redated', doseId: 'inconnue', givenOn: '2026-10-01' }),
    ).toThrow('Aucune prise donnée à redater : inconnue')
    expect(() =>
      schedule.doseFor({ kind: 'redated', doseId: lastDose(book).id, givenOn: '2026-10-01' }),
    ).toThrow('Aucune prise donnée à redater')
  })
})

describe('supprimer un report (TR-24)', () => {
  it('la suite repart de la ligne précédente, l’échéance d’origine redevient la dose du moment', () => {
    const book = doneEachDay(carnet(period()), '2026-09-01', '2026-09-04')
    const postponed = record(book, '2026-09-05', {
      kind: 'postponed',
      due: due('2026-09-05'),
      to: '2026-09-07',
    })

    const schedule = scheduleOf(withoutDose(postponed, lastDose(postponed).id), '2026-09-05')

    expect(schedule.currentDoses).toEqual([due('2026-09-05')])
    expect(schedule.unloggedDoses).toEqual([])
  })

  it('ou une dose non renseignée si une échéance plus récente est tombée', () => {
    const book = done(carnet(weekly()), '2026-09-01')
    const postponed = record(book, '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })

    const schedule = scheduleOf(withoutDose(postponed, lastDose(postponed).id), '2026-09-16')

    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
    expect(schedule.unloggedDoses).toEqual([due('2026-09-08')])
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
        ),
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

describe('cas hors spec, pris au plus prudent', () => {
  it('une prochaine dose avancée avant son échéance devient l’échéance', () => {
    const book = done(done(carnet(weekly()), '2026-09-01'), '2026-09-08')
    const advanced = record(book, '2026-09-13', {
      kind: 'postponed',
      due: due('2026-09-15'),
      to: '2026-09-14',
    })

    const schedule = scheduleOf(advanced, '2026-09-13')
    expect(schedule.currentDoses).toEqual([due('2026-09-14')])
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-09-14', '2026-09-21'])
  })

  it('après un report, la nouvelle période propose la date du report', () => {
    const book = record(done(carnet(weekly()), '2026-09-01'), '2026-09-08', {
      kind: 'postponed',
      due: due('2026-09-08'),
      to: '2026-09-12',
    })

    expect(scheduleOf(book, '2026-09-09').newPeriodFirstDue({ value: 15, unit: 'day' })).toBe(
      '2026-09-12',
    )
  })

  it('un traitement sans période n’a ni échéance ni dose à renseigner', () => {
    const schedule = scheduleOf({ periods: [], doses: [] }, '2026-09-28')

    expect(schedule.currentDoses).toEqual([])
    expect(schedule.unloggedDoses).toEqual([])
    expect(schedule.currentPeriodId).toBeNull()
  })
})

describe('heure d’été', () => {
  let previousTz: string | undefined

  beforeAll(() => {
    previousTz = process.env.TZ
    process.env.TZ = 'Europe/Paris'
  })

  afterAll(() => {
    process.env.TZ = previousTz
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
    schedule.newPeriodFirstDue({ value: 2, unit: 'day' })
    schedule.doseFor({ kind: 'given', due: due('2026-09-23', '08:00'), givenOn: '2026-09-23' })

    expect(doses).toEqual(reversed)
    expect(periods[0]?.times).toEqual(['20:00', '08:00'])
  })
})
