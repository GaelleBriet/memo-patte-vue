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

  it('dose du 16 donnée le 2 : la suite repart de la prise en plus, prochaine le 9', () => {
    const book = record(pixel, '2026-10-02', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-02',
    })

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-02', status: 'extra', nextDueDate: '2026-10-09' }),
    )
    expect(dueDays(scheduleOf(book, '2026-10-02').upcoming(3))).toEqual([
      '2026-10-09',
      '2026-10-16',
      '2026-10-23',
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

  it('une dose en retard notée le jour même n’est jamais une prise en plus', () => {
    const book = done(carnet(weekly({ firstDueOn: '2026-10-02' })), '2026-10-12')

    expect(lastDose(book).status).toBe('given')
  })

  it('une prise datée avant la dernière ligne de la période couvre la dose prévue, sans refixer la suite', () => {
    const book = record(done(carnet(weekly()), '2026-09-01'), '2026-09-02', {
      kind: 'given',
      due: due('2026-09-08'),
      givenOn: '2026-08-25',
    })

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-09-08', status: 'given', nextDueDate: '2026-09-15' }),
    )
  })

  it('une dose non renseignée plus loin que la date choisie : pas de prise en plus', () => {
    const late = carnet(weekly({ firstDueOn: '2026-09-01' }))
    const schedule = scheduleOf(late, '2026-09-20')
    const target = schedule.unloggedDoses[0]!

    expect(target).toEqual(due('2026-09-01'))
    expect(
      scheduleOf(late, '2026-09-20').doseFor({
        kind: 'given',
        due: due('2026-09-15'),
        givenOn: '2026-09-02',
      }).dose.status,
    ).toBe('given')
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

  it('compte comme une prise de la période (TR-28) et suit l’historique', () => {
    const book = record(pixel, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-09',
    })
    const schedule = scheduleOf(book, '2026-10-09')

    expect(schedule.currentPeriodHasDose).toBe(true)
    expect(schedule.nextDoseChange).toBe('move')
    expect(schedule.doses).toEqual([expect.objectContaining({ status: 'extra' })])
  })

  it('hors du rythme, la suite repart de la prise en plus : dose du 16 donnée le 7, prochaine le 14', () => {
    const book = record(pixel, '2026-10-07', {
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-07',
    })

    expect(lastDose(book)).toEqual(
      expect.objectContaining({ dueOn: '2026-10-07', status: 'extra', nextDueDate: '2026-10-14' }),
    )
  })

  it('une nouvelle période repart de la prise en plus', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-02' }))
    const book = done(done(daily, '2026-10-02'), '2026-10-02')

    expect(scheduleOf(book, '2026-10-02').newPeriod({ value: 2, unit: 'day' }, []).firstDueOn).toBe(
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
    expect(scheduleOf(moved, '2026-10-09').currentDoses).toEqual([due('2026-10-09')])
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
