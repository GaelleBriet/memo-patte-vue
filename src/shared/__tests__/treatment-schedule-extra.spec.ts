// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  carnet,
  done,
  due,
  dueDays,
  lastDose,
  period,
  record,
  redate,
  scheduleOf,
  weekly,
  withoutDose,
} from './treatment-schedule-fixtures'

const pixel = carnet(weekly({ firstDueOn: '2026-10-16' }))

describe('prise en plus : une dose donnée un intervalle ou plus en avance (#503)', () => {
  it('dose du 16 donnée le 9 : prise en plus le 9, la dose du 16 reste à donner', () => {
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const schedule = scheduleOf(book, '2026-10-09')

    expect(book.doses).toEqual([
      expect.objectContaining({
        dueOn: '2026-10-09',
        dueTime: null,
        givenOn: '2026-10-09',
        status: 'extra',
        nextDueDate: '2026-10-16',
      }),
    ])
    expect(schedule.currentDoses).toEqual([due('2026-10-16')])
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-10-16', '2026-10-23'])
  })

  it.each(['2026-10-07', '2026-10-02'])(
    'hebdomadaire du vendredi, dose du 16 donnée le %s : la prochaine reste le 16, puis 23, 30',
    (givenOn) => {
      const book = record(pixel, givenOn, { kind: 'given', due: due('2026-10-16'), givenOn })

      expect(lastDose(book)).toEqual(
        expect.objectContaining({ dueOn: givenOn, status: 'extra', nextDueDate: '2026-10-16' }),
      )
      expect(dueDays(scheduleOf(book, givenOn).upcoming(3))).toEqual([
        '2026-10-16',
        '2026-10-23',
        '2026-10-30',
      ])
    },
  )

  it('prise en plus le 9, puis dose du 16 notée le 16 : prochaine le 23, puis le 30', () => {
    const extra = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const book = done(extra, '2026-10-16')

    expect(book.doses.map(({ status, dueOn }) => [status, dueOn])).toEqual([
      ['extra', '2026-10-09'],
      ['given', '2026-10-16'],
    ])
    expect(dueDays(scheduleOf(book, '2026-10-16').upcoming(2))).toEqual([
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it('tous les 3 jours, dose du 8 donnée le 5 : prochaine le 8', () => {
    const every3 = carnet(
      period({ firstDueOn: '2026-10-08', frequency: { value: 3, unit: 'day' } }),
    )
    const book = record(every3, '2026-10-05', {
      kind: 'given',
      due: due('2026-10-08'),
      givenOn: '2026-10-05',
    })

    expect(lastDose(book).status).toBe('extra')
    expect(scheduleOf(book, '2026-10-05').currentDoses).toEqual([due('2026-10-08')])
  })

  it('à moins d’un intervalle, la prise couvre la dose prévue et décale la suite', () => {
    const book = record(pixel, '2026-10-13', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-13',
    })

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-16', status: 'given', nextDueDate: '2026-10-20' }),
    )
  })

  it('quotidien, second « C’est fait » le même jour : prise en plus, la dose de demain reste à donner', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-02' }))
    const book = done(done(daily, '2026-10-02'), '2026-10-02')

    expect(lastDose(book)).toEqual(
      expect.objectContaining({
        dueOn: '2026-10-02',
        givenOn: '2026-10-02',
        status: 'extra',
        nextDueDate: '2026-10-03',
      }),
    )
    expect(scheduleOf(book, '2026-10-02').currentDoses).toEqual([due('2026-10-03')])
    expect(scheduleOf(book, '2026-10-03').currentDoses).toEqual([due('2026-10-03')])
  })

  it('quotidien à une heure : la prise en plus garde l’heure du traitement', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-02', times: ['20:00'] }))
    const book = done(done(daily, '2026-10-02'), '2026-10-02')

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-02', dueTime: '20:00', status: 'extra' }),
    )
    expect(scheduleOf(book, '2026-10-03').currentDoses).toEqual([due('2026-10-03', '20:00')])
  })

  it('à plusieurs heures, une heure donnée en avance couvre son échéance (G10)', () => {
    const twice = carnet(period({ firstDueOn: '2026-10-02', times: ['08:00', '20:00'] }))
    const book = done(done(done(twice, '2026-10-02'), '2026-10-02'), '2026-10-02')

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-03', dueTime: '08:00', status: 'given' }),
    )
    expect(book.doses.some(({ status }) => status === 'extra')).toBe(false)
  })

  it('un troisième « C’est fait » le même jour vise la même prise en plus', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-02' }))
    const book = done(done(daily, '2026-10-02'), '2026-10-02')
    const [current] = scheduleOf(book, '2026-10-02').currentDoses

    expect(
      scheduleOf(book, '2026-10-02').doseFor({
        kind: 'given',
        due: current!,
        givenOn: '2026-10-02',
      }).dose,
    ).toEqual(expect.objectContaining({ dueOn: '2026-10-02', status: 'extra' }))
  })

  it('n’écrit aucune ligne de décalage et ne compte pas comme la dose prévue', () => {
    const schedule = scheduleOf(pixel, '2026-10-09')

    expect(
      schedule.doseFor({ kind: 'given', due: due('2026-10-16'), givenOn: '2026-10-09' }),
    ).toEqual({ dose: expect.objectContaining({ status: 'extra' }), shift: null })
  })

  it('ne change jamais le calendrier, même avec une dose en retard hors de son rythme', () => {
    const every2 = carnet(
      period({ firstDueOn: '2026-03-05', frequency: { value: 2, unit: 'day' } }),
    )
    const book = record(every2, '2026-03-06', {
      kind: 'given',
      due: due('2026-03-05'),
      givenOn: '2026-02-28',
    })
    const before = scheduleOf(every2, '2026-03-06')
    const after = scheduleOf(book, '2026-03-06')

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-02-28', status: 'extra' }),
    )
    expect(after.currentDoses).toEqual(before.currentDoses)
    expect(after.unloggedDoses).toEqual(before.unloggedDoses)
    expect(after.upcoming(5)).toEqual(before.upcoming(5))
  })

  it('une dose en retard notée le jour même n’est jamais une prise en plus', () => {
    const book = done(carnet(weekly({ firstDueOn: '2026-10-02' })), '2026-10-12')

    expect(lastDose(book).status).toBe('given')
  })

  it('notée avant le début de la période, la dose prévue reste', () => {
    const book = record(pixel, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-09-25',
    })

    expect(lastDose(book).status).toBe('extra')
    expect(scheduleOf(book, '2026-10-02').currentDoses).toEqual([due('2026-10-16')])
  })

  it('notée avant une dose non renseignée, celle-ci reste à renseigner', () => {
    const late = carnet(weekly({ firstDueOn: '2026-09-01' }))
    const book = record(late, '2026-09-20', {
      kind: 'given',
      due: due('2026-09-15'),
      givenOn: '2026-09-02',
    })
    const schedule = scheduleOf(book, '2026-09-20')

    expect(lastDose(book).status).toBe('extra')
    expect(dueDays(schedule.unloggedDoses)).toEqual(['2026-09-01', '2026-09-08'])
    expect(schedule.currentDoses).toEqual([due('2026-09-15')])
  })

  it('supprimée, la prise en plus rend le calendrier d’avant', () => {
    const book = record(pixel, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-02',
    })
    const before = scheduleOf(pixel, '2026-10-02')
    const after = scheduleOf(withoutDose(book, lastDose(book).id), '2026-10-02')

    expect(after.currentDoses).toEqual(before.currentDoses)
    expect(after.upcoming(3)).toEqual(before.upcoming(3))
  })

  it('ne compte pas comme une prise de la période (TR-28) : la période se corrige, et l’historique la garde', () => {
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const schedule = scheduleOf(book, '2026-10-09')

    expect(schedule.currentPeriodHasDose).toBe(false)
    expect(schedule.nextDoseChange).toBe('correction')
    expect(schedule.doses).toEqual([expect.objectContaining({ status: 'extra' })])
  })

  it('un report après une prise en plus reste gardé quand la prise d’avant change de date', () => {
    let book = done(carnet(weekly({ firstDueOn: '2026-10-02' })), '2026-10-04')
    const october2 = lastDose(book)
    book = done(book, '2026-10-04')
    expect(lastDose(book).status).toBe('extra')
    book = record(book, '2026-10-04', {
      kind: 'postponed',
      due: due('2026-10-11'),
      to: '2026-10-13',
    })

    const redated = redate(book, '2026-10-04', october2.id, '2026-10-03')

    expect(dueDays(scheduleOf(redated, '2026-10-04').upcoming(3))).toEqual([
      '2026-10-13',
      '2026-10-20',
      '2026-10-27',
    ])
  })

  it('une nouvelle période part de la dernière prise prévue, pas de la prise en plus', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-02' }))
    const book = record(done(daily, '2026-10-02'), '2026-10-04', {
      kind: 'given',
      due: due('2026-10-05'),
      givenOn: '2026-10-04',
    })

    expect(lastDose(book).status).toBe('extra')
    expect(scheduleOf(book, '2026-10-04').newPeriod({ value: 2, unit: 'day' }, []).firstDueOn).toBe(
      '2026-10-04',
    )
  })
})

describe('« Changer la date » d’une prise en plus : elle vise l’échéance d’une prise notée à cette date', () => {
  it('ramenée après son échéance, elle devient la prise de la dose du moment (3b)', () => {
    const start = done(carnet(weekly({ firstDueOn: '2026-09-01' })), '2026-09-01')
    const book = record(start, '2026-09-10', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-09-01',
    })
    const extra = lastDose(book)
    expect(extra).toEqual(expect.objectContaining({ dueOn: '2026-09-01', status: 'extra' }))

    const { dose, shift, postponement } = scheduleOf(book, '2026-09-10').redate(
      extra.id,
      '2026-09-10',
    )

    expect(dose).toEqual(
      expect.objectContaining({
        dueOn: '2026-09-08',
        givenOn: '2026-09-10',
        status: 'given',
        nextDueDate: '2026-09-17',
      }),
    )
    expect(shift).toEqual({
      action: 'create',
      dose: expect.objectContaining({ dueOn: '2026-09-08', nextDueDate: '2026-09-10' }),
    })
    expect(postponement).toBeNull()
  })

  it('déplacée un autre jour encore un intervalle en avance, elle reste une prise en plus', () => {
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const extra = lastDose(book)
    const moved = redate(book, '2026-10-09', extra.id, '2026-10-02')

    expect(lastDose(moved)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-02', givenOn: '2026-10-02', status: 'extra' }),
    )
    expect(scheduleOf(moved, '2026-10-09').currentDoses).toEqual([due('2026-10-16')])
  })

  it('sur un traitement arrêté, elle reste une prise en plus à la nouvelle date', () => {
    const stopped = carnet(weekly({ firstDueOn: '2026-10-16', stoppedOn: '2026-10-12' }))
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const extra = lastDose(book)
    const later = { ...book, periods: stopped.periods }

    expect(scheduleOf(later, '2026-10-20').redate(extra.id, '2026-10-08').dose).toEqual(
      expect.objectContaining({ dueOn: '2026-10-08', givenOn: '2026-10-08', status: 'extra' }),
    )
  })

  it('refuse un jour qui a déjà une prise en plus, et le dit dans ses limites', () => {
    let book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-08',
    })
    book = record(book, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const extra = lastDose(book)
    const schedule = scheduleOf(book, '2026-10-09')

    expect(schedule.redateLimits(extra.id)).toEqual({
      lastExtraDay: null,
      takenDays: ['2026-10-08'],
    })
    expect(() => schedule.redate(extra.id, '2026-10-08')).toThrow('prise en plus')
  })

  it('à la même date, rien ne change', () => {
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const extra = lastDose(book)

    expect(scheduleOf(book, '2026-10-09').redate(extra.id, '2026-10-09')).toEqual({
      dose: expect.objectContaining({
        dueOn: '2026-10-09',
        status: 'extra',
        nextDueDate: '2026-10-16',
      }),
      shift: { action: 'none' },
      postponement: null,
    })
  })
})

describe('« Changer la date » d’une prise donnée : jamais un intervalle ou plus avant son échéance', () => {
  it('donne le dernier jour qui en ferait une prise en plus, et refuse ces jours', () => {
    const book = done(carnet(weekly({ firstDueOn: '2026-10-16' })), '2026-10-16')
    const given = lastDose(book)
    const schedule = scheduleOf(book, '2026-10-20')

    expect(schedule.redateLimits(given.id)).toEqual({ lastExtraDay: '2026-10-09', takenDays: [] })
    expect(() => schedule.redate(given.id, '2026-10-09')).toThrow('prise en plus')
    expect(schedule.redate(given.id, '2026-10-10').dose.givenOn).toBe('2026-10-10')
  })
})
