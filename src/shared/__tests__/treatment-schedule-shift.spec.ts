// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { TreatmentDoseInput } from '../domain/treatment-schedule'

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

  it('la dose d’origine notée de nouveau, la prochaine dose écrite suit le décalage resté seul', () => {
    const alone = withoutDose(pixel, lastDose(pixel).id)
    const due16 = due('2026-10-16')
    const schedule = scheduleOf(alone, '2026-10-20')

    expect(schedule.doseFor({ kind: 'given', due: due16, givenOn: '2026-10-16' })).toEqual({
      dose: expect.objectContaining({ nextDueDate: '2026-10-26' }),
      shift: null,
    })
    expect(schedule.doseFor({ kind: 'missed', due: due16 }).dose.nextDueDate).toBe('2026-10-26')
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

  it('le décalage du report battu reste : une ligne autonome', () => {
    const line = (status: 'given' | 'postponed' | 'shift') =>
      stored({
        periodId: 'p1',
        dueOn: '2026-09-08',
        dueTime: null,
        givenOn: status === 'given' ? '2026-09-08' : null,
        status,
        nextDueDate: status === 'given' ? '2026-09-15' : '2026-09-10',
      })
    const shift = line('shift')
    const report = line('postponed')
    const prise = line('given')
    const schedule = scheduleOf(
      { ...carnet(weekly()), doses: [shift, report, prise] },
      '2026-09-09',
    )

    expect(schedule.staleDoseIds).toEqual([report.id])
    expect(schedule.doses.map(({ id }) => id)).toEqual([shift.id, prise.id])
    expect(dueDays(schedule.upcoming(2))).toEqual(['2026-09-17', '2026-09-24'])
  })
})

describe('un décalage ne retombe jamais sur le jour d’un report', () => {
  it('« C’est fait » en retard dont le rythme tomberait sur l’arrivée d’un report n’écrit aucun décalage', () => {
    let book = record(carnet(weekly({ firstDueOn: '2026-10-01' })), '2026-10-03', {
      kind: 'postponed',
      due: due('2026-10-08'),
      to: '2026-10-12',
    })
    book = done(book, '2026-10-05')

    expect(shiftsOf(book).map(({ dueOn }) => dueOn)).toEqual(['2026-10-08'])
    expect(dueDays(scheduleOf(book, '2026-10-05').upcoming(2))).toEqual([
      '2026-10-12',
      '2026-10-19',
    ])
  })
})

describe('« C’est fait » en un tap après un retard, face à la date de fin (Q4, #506)', () => {
  const pixel = carnet(
    period({
      firstDueOn: '2026-10-05',
      endsOn: '2026-11-02',
      frequency: { value: 4, unit: 'week' },
    }),
  )

  it.each(['2026-10-10', '2026-10-19'])(
    'donnée le %s, au moins une demi-fréquence avant : pas de décalage, la dose du 2 nov. reste',
    (today) => {
      const book = done(pixel, today)
      const schedule = scheduleOf(book, today)

      expect(shiftsOf(book)).toEqual([])
      expect(lastDose(book).nextDueDate).toBe('2026-11-02')
      expect(schedule.finished).toBe(false)
      expect(dueDays(schedule.upcoming(3))).toEqual(['2026-11-02'])
    },
  )

  it.each(['2026-10-20', '2026-10-25', '2026-11-01'])(
    'donnée le %s, à moins d’une demi-fréquence : le décalage est écrit, le traitement est terminé',
    (today) => {
      const book = done(pixel, today)

      expect(shiftsOf(book)).toEqual([
        expect.objectContaining({ dueOn: '2026-10-05', nextDueDate: today }),
      ])
      expect(scheduleOf(book, today).finished).toBe(true)
    },
  )

  it('case cochée : le décalage est écrit, même loin de la dose suivante (V28 bis)', () => {
    const book = record(pixel, '2026-10-10', {
      kind: 'given',
      due: due('2026-10-05'),
      givenOn: '2026-10-10',
      shiftsFollowing: true,
    })

    expect(shiftsOf(book)).toHaveLength(1)
    expect(scheduleOf(book, '2026-10-10').finished).toBe(true)
  })

  it('mensuel du 5, fin le 5 nov. : donnée le 20 oct., le 5 nov. reste ; le 21, terminé', () => {
    const luna = carnet(monthly({ firstDueOn: '2026-10-05', endsOn: '2026-11-05' }))

    expect(shiftsOf(done(luna, '2026-10-20'))).toEqual([])
    expect(scheduleOf(done(luna, '2026-10-21'), '2026-10-21').finished).toBe(true)
  })

  describe('plusieurs doses avant la date de fin : la règle porte sur la dose suivante', () => {
    const vendredi = carnet(weekly({ firstDueOn: '2026-10-16', endsOn: '2026-10-30' }))
    const lundi19 = scheduleOf(vendredi, '2026-10-19').doseFor({
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-19',
    })
    const mercredi21 = scheduleOf(vendredi, '2026-10-21').doseFor({
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-21',
    })

    it('donnée le lundi 19 : pas de décalage, le 23 et le 30 restent', () => {
      expect(lundi19).toEqual({
        dose: expect.objectContaining({ nextDueDate: '2026-10-23' }),
        shift: null,
      })
      expect(dueDays(scheduleOf(done(vendredi, '2026-10-19'), '2026-10-19').upcoming(3))).toEqual([
        '2026-10-23',
        '2026-10-30',
      ])
    })

    it('donnée le mercredi 21 : décalage au 28, la dose du 30 est annoncée perdue', () => {
      expect(mercredi21).toMatchObject({
        dose: { nextDueDate: '2026-10-28' },
        shift: { nextDueDate: '2026-10-21' },
        lostToEnd: ['2026-10-30'],
      })
    })

    it('la dernière dose seule, perdue, est aussi annoncée', () => {
      const noted = scheduleOf(pixel, '2026-10-25').doseFor({
        kind: 'given',
        due: due('2026-10-05'),
        givenOn: '2026-10-25',
      })

      expect(noted.lostToEnd).toEqual(['2026-11-02'])
    })
  })

  it('un décalage qui ne fait perdre aucune dose est écrit comme d’habitude', () => {
    const book = done(
      carnet(weekly({ firstDueOn: '2026-10-16', endsOn: '2026-10-31' })),
      '2026-10-17',
    )
    expect(shiftsOf(book)).toHaveLength(1)
    expect(dueDays(scheduleOf(book, '2026-10-17').upcoming(3))).toEqual([
      '2026-10-24',
      '2026-10-31',
    ])
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

describe('un décalage resté seul sur le jour d’arrivée d’une dose avancée garde son échéance (#523)', () => {
  const leftOver = (dueOn: string, anchoredOn: string) =>
    stored({
      periodId: 'p1',
      dueOn,
      dueTime: null,
      givenOn: null,
      status: 'shift',
      nextDueDate: anchoredOn,
    })

  it('graine 1663 : la dose avancée donnée la veille, la prochaine dose écrite est celle du calendrier', () => {
    const today = '2026-03-09'
    let book = done(carnet(weekly({ firstDueOn: '2026-03-06' })), today, '2026-03-06')
    book = { ...book, doses: [leftOver('2026-03-10', '2026-03-08'), ...book.doses] }
    book = record(book, today, { kind: 'postponed', due: due('2026-03-15'), to: '2026-03-10' })
    book = record(book, today, { kind: 'given', due: due('2026-03-10'), givenOn: today })

    expect(lastDose(book).nextDueDate).toBe('2026-03-16')
    expect(shiftsOf(book)).toEqual([
      expect.objectContaining({ dueOn: '2026-03-10', nextDueDate: '2026-03-08' }),
      expect.objectContaining({ dueOn: '2026-03-15', nextDueDate: '2026-03-09' }),
    ])
    expect(dueDays(scheduleOf(book, today).upcoming(2))).toEqual(['2026-03-16', '2026-03-23'])
  })

  it('graine 14529 : « Supprimer ce report » ne fait disparaître aucune dose', () => {
    let book = done(carnet(weekly({ firstDueOn: '2026-03-12' })), '2026-03-15')
    book = { ...book, doses: [leftOver('2026-03-20', '2026-03-19'), ...book.doses] }
    expect(dueDays(scheduleOf(book, '2026-03-18').upcoming(1))).toEqual(['2026-03-26'])

    book = record(book, '2026-03-18', {
      kind: 'postponed',
      due: due('2026-03-26'),
      to: '2026-03-20',
    })
    const report = lastDose(book)
    expect(dueDays(scheduleOf(book, '2026-03-18').upcoming(2))).toEqual([
      '2026-03-20',
      '2026-03-27',
    ])

    const removed = withoutDose(book, report.id)
    expect(dueDays(scheduleOf(removed, '2026-03-18').upcoming(2))).toEqual([
      '2026-03-26',
      '2026-03-27',
    ])
  })

  it('graine 3180 : la dose avancée de nouveau ne reste pas à donner à son jour d’arrivée', () => {
    const today = '2026-03-14'
    let book = done(carnet(weekly({ firstDueOn: '2026-03-10' })), today, '2026-03-10')
    book = { ...book, doses: [leftOver('2026-03-15', '2026-03-14'), ...book.doses] }
    book = record(book, today, { kind: 'postponed', due: due('2026-03-21'), to: '2026-03-17' })
    book = record(book, today, { kind: 'postponed', due: due('2026-03-17'), to: '2026-03-15' })

    expect(dueDays(scheduleOf(book, today).upcoming(2))).toEqual(['2026-03-15', '2026-03-22'])
  })

  // Comme le repository : l'inverse d'une écriture est daté de l'annulation.
  function undone(before: Carnet, after: Carnet): Carnet {
    const at = '2026-12-31T00:00:00.000Z'
    const changed = (line: TreatmentDoseInput) =>
      JSON.stringify(after.doses.find(({ id }) => id === line.id)) !== JSON.stringify(line)
    return {
      ...before,
      doses: before.doses.map((line) => (changed(line) ? { ...line, updatedAt: at } : line)),
    }
  }

  it('« Annuler » une prise de la dose avancée rend le calendrier d’avant', () => {
    const today = '2026-03-22'
    let book = done(carnet(weekly({ firstDueOn: '2026-03-12' })), '2026-03-15')
    book = { ...book, doses: [leftOver('2026-03-20', '2026-03-19'), ...book.doses] }
    book = record(book, '2026-03-18', {
      kind: 'postponed',
      due: due('2026-03-26'),
      to: '2026-03-20',
    })
    const before = scheduleOf(book, today)

    const noted = record(book, today, {
      kind: 'given',
      due: due('2026-03-20'),
      givenOn: '2026-03-21',
    })
    expect(lastDose(noted).nextDueDate).toBe('2026-03-28')
    expect(dueDays(scheduleOf(noted, today).upcoming(1))).toEqual(['2026-03-28'])

    const after = scheduleOf(undone(book, noted), today)
    expect(after.currentDoses).toEqual(before.currentDoses)
    expect(dueDays(after.upcoming(3))).toEqual(dueDays(before.upcoming(3)))
  })

  it('M1 : un appareil à l’heure en retard note la dose avancée, la prochaine dose écrite suit le calendrier', () => {
    const today = '2026-10-12'
    let book = done(carnet(weekly({ firstDueOn: '2026-10-09' })), today, '2026-10-09')
    book = record(book, today, { kind: 'postponed', due: due('2026-10-16'), to: '2026-10-13' })

    const late = '2025-12-31T00:00:00.000Z'
    const { dose, shift } = scheduleOf(book, today).doseFor({
      kind: 'given',
      due: due('2026-10-13'),
      givenOn: '2026-10-12',
    })
    expect(shift).toMatchObject({ dueOn: '2026-10-16', nextDueDate: '2026-10-12' })
    const fromB: Carnet = {
      ...book,
      doses: [
        ...book.doses.map((line) =>
          line.status === 'shift' ? { ...line, ...shift, updatedAt: late } : line,
        ),
        { id: 'b-1', ...dose, createdAt: late, updatedAt: late },
      ],
    }

    expect(dose.nextDueDate).toBe('2026-10-19')
    expect(dueDays(scheduleOf(fromB, today).upcoming(1))).toEqual(['2026-10-19'])
  })
})
