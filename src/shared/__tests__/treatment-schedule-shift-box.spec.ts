// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  carnet,
  done,
  due,
  dueDays,
  lastDose,
  period,
  record,
  redate,
  scheduleOf,
  stored,
  weekly,
  type Carnet,
} from './treatment-schedule-fixtures'

// Pixel, vermifuge tous les vendredis : 16, 23, 30 oct.
const pixel = carnet(weekly({ firstDueOn: '2026-10-16' }))

function shiftsOf(book: Carnet) {
  return book.doses.filter(({ status }) => status === 'shift')
}

function moved(book: Carnet, today: string, from: string, to: string, shiftsFollowing: boolean) {
  const { report, shift } = scheduleOf(book, today).move(due(from), to, shiftsFollowing)
  return applied(applied(book, shift), report)
}

describe('« Fait à une autre date » : la case (Q3, N1, N3, G10)', () => {
  it('est proposée pour la dose du moment donnée un autre jour que son échéance', () => {
    const schedule = scheduleOf(pixel, '2026-10-19')

    expect(schedule.offersShift(due('2026-10-16'), '2026-10-19')).toBe(true)
    expect(schedule.offersShift(due('2026-10-16'), '2026-10-16')).toBe(false)
  })

  it('jamais pour une dose non renseignée rattrapée (N1)', () => {
    const schedule = scheduleOf(pixel, '2026-10-24')

    expect(schedule.unloggedDoses).toEqual([due('2026-10-16')])
    expect(schedule.offersShift(due('2026-10-16'), '2026-10-17')).toBe(false)
  })

  it('jamais pour une prise d’un traitement de tous les jours (N3)', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-16' }))
    const schedule = scheduleOf(daily, '2026-10-16')

    expect(schedule.offersShift(due('2026-10-16'), '2026-10-15')).toBe(false)
  })

  it('à plusieurs heures, seulement quand la prise complète la journée (G10)', () => {
    const metacam = carnet(
      period({
        firstDueOn: '2026-10-16',
        frequency: { value: 3, unit: 'day' },
        times: ['08:00', '20:00'],
      }),
    )
    const schedule = scheduleOf(metacam, '2026-10-17')
    expect(schedule.offersShift(due('2026-10-16', '08:00'), '2026-10-17')).toBe(false)

    const morning = record(metacam, '2026-10-17', {
      kind: 'given',
      due: due('2026-10-16', '08:00'),
      givenOn: '2026-10-17',
    })
    expect(
      scheduleOf(morning, '2026-10-17').offersShift(due('2026-10-16', '20:00'), '2026-10-17'),
    ).toBe(true)
  })

  it('avec une date de fin, même loin de la dose suivante : la personne choisit (Q4, V28 bis)', () => {
    const ended = carnet(weekly({ firstDueOn: '2026-10-16', endsOn: '2026-10-30' }))

    expect(scheduleOf(ended, '2026-10-19').offersShift(due('2026-10-16'), '2026-10-19')).toBe(true)
  })

  it('pour la prochaine dose donnée en avance, moins d’un intervalle avant', () => {
    const schedule = scheduleOf(pixel, '2026-10-14')

    expect(schedule.offersShift(due('2026-10-16'), '2026-10-14')).toBe(true)
  })

  it('décochée, la prise est écrite seule : les suivantes gardent leur jour', () => {
    const noted = scheduleOf(pixel, '2026-10-19').doseFor({
      kind: 'given',
      due: due('2026-10-16'),
      givenOn: '2026-10-19',
      shiftsFollowing: false,
    })

    expect(noted.shift).toBeNull()
    expect(noted.dose.nextDueDate).toBe('2026-10-23')
    const book = { ...pixel, doses: [stored(noted.dose)] }
    expect(dueDays(scheduleOf(book, '2026-10-19').upcoming(2))).toEqual([
      '2026-10-23',
      '2026-10-30',
    ])
  })
})

describe('« Prochaine dose », case décochée : un report seul (Q2)', () => {
  it('va au plus jusqu’à la veille de la dose suivante (Q2 a)', () => {
    const schedule = scheduleOf(pixel, '2026-10-15')

    expect(schedule.moveBounds(due('2026-10-16'), false)).toEqual({
      earliest: '2026-10-16',
      latest: '2026-10-22',
    })
    expect(schedule.moveBounds(due('2026-10-16'))).toEqual({
      earliest: '2026-10-16',
      latest: null,
    })
    expect(() => schedule.move(due('2026-10-16'), '2026-10-23', false)).toThrow(RangeError)
  })

  it('la date de fin reste la borne quand elle tombe avant', () => {
    const ending = carnet(weekly({ firstDueOn: '2026-10-16', endsOn: '2026-10-20' }))

    expect(scheduleOf(ending, '2026-10-15').moveBounds(due('2026-10-16'), false)).toEqual({
      earliest: '2026-10-16',
      latest: '2026-10-20',
    })
  })

  it('écrit le report sans décalage : les suivantes gardent leur jour', () => {
    const book = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-19', false)

    expect(book.doses.map(({ status }) => status)).toEqual(['postponed'])
    expect(dueDays(scheduleOf(book, '2026-10-15').upcoming(3))).toEqual([
      '2026-10-19',
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it('redéplacée décochée, le report est réécrit et son décalage supprimé', () => {
    const shifted = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-19', true)
    expect(shiftsOf(shifted)).toHaveLength(1)

    const book = moved(shifted, '2026-10-15', '2026-10-19', '2026-10-20', false)

    expect(shiftsOf(book)).toEqual([])
    expect(dueDays(scheduleOf(book, '2026-10-15').upcoming(2))).toEqual([
      '2026-10-20',
      '2026-10-23',
    ])
  })

  it('refusée, comme cochée, quand une dose plus loin est notée (Q2 b, G7)', () => {
    const book: Carnet = {
      ...pixel,
      doses: [
        stored({
          periodId: 'p1',
          dueOn: '2026-10-23',
          dueTime: null,
          givenOn: '2026-10-23',
          status: 'given',
          nextDueDate: '2026-10-30',
        }),
      ],
    }

    expect(scheduleOf(book, '2026-10-20').moveRefusal(due('2026-10-16'), false)).toBe('later-dose')
  })

  it('tous les jours, aucune date ne reste à une dose seule', () => {
    const daily = carnet(period({ firstDueOn: '2026-10-16' }))

    expect(scheduleOf(daily, '2026-10-16').moveRefusal(due('2026-10-16'), false)).toBe(
      'no-date-alone',
    )
  })

  it('une dose déplacée seule puis donnée un autre jour ne décale rien (Q2 c)', () => {
    const book = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-19', false)
    const schedule = scheduleOf(book, '2026-10-20')

    expect(schedule.offersShift(due('2026-10-19'), '2026-10-20')).toBe(false)
    expect(
      schedule.doseFor({ kind: 'given', due: due('2026-10-19'), givenOn: '2026-10-20' }).shift,
    ).toBeNull()
  })
})

describe('« Changer la date » d’une prise, case décochée (N2)', () => {
  const late = done(pixel, '2026-10-19')

  it('la case est proposée pour une prise qui a décalé la suite', () => {
    expect(scheduleOf(late, '2026-10-21').redateOffersShift(lastDose(late).id, '2026-10-20')).toBe(
      true,
    )
    expect(scheduleOf(late, '2026-10-21').redateOffersShift(lastDose(late).id, '2026-10-16')).toBe(
      false,
    )
  })

  it('décochée, la prise est réécrite et le décalage de son échéance supprimé', () => {
    const { shift } = scheduleOf(late, '2026-10-21').redate(lastDose(late).id, '2026-10-20', false)

    expect(shift).toEqual({ action: 'delete', doseId: shiftsOf(late)[0]!.id })
    const book = redate(late, '2026-10-21', lastDose(late).id, '2026-10-20', false)
    expect(shiftsOf(book)).toEqual([])
    expect(dueDays(scheduleOf(book, '2026-10-21').upcoming(1))).toEqual(['2026-10-23'])
  })
})

describe('« Supprimer ce décalage » (N7, N8)', () => {
  const report = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-19', true)
  const shiftId = () => shiftsOf(report)[0]!.id

  it('supprime la ligne seule : le report reste, la suite revient au vendredi', () => {
    const schedule = scheduleOf(report, '2026-10-15')

    expect(schedule.shiftRemovalRefusal(shiftId())).toBeNull()
    const change = schedule.removeShift(shiftId())
    expect(change).toEqual({ action: 'delete', doseId: shiftId() })
    expect(dueDays(scheduleOf(applied(report, change), '2026-10-15').upcoming(3))).toEqual([
      '2026-10-19',
      '2026-10-23',
      '2026-10-30',
    ])
  })

  it('la prise de la dose déplacée elle-même ne la bloque pas', () => {
    const given = record(report, '2026-10-19', {
      kind: 'given',
      due: due('2026-10-19'),
      givenOn: '2026-10-19',
    })

    expect(scheduleOf(given, '2026-10-20').shiftRemovalRefusal(shiftId())).toBeNull()
  })

  it('refusée quand une dose plus loin est déjà notée', () => {
    const later = record(report, '2026-10-26', {
      kind: 'given',
      due: due('2026-10-26'),
      givenOn: '2026-10-26',
    })
    const schedule = scheduleOf(later, '2026-10-27')

    expect(schedule.shiftRemovalRefusal(shiftId())).toBe('later-dose')
    expect(() => schedule.removeShift(shiftId())).toThrow(RangeError)
  })

  it('refusée quand son report a dépassé la dose suivante (décision du 2026-10-05)', () => {
    const far = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-24', true)
    const schedule = scheduleOf(far, '2026-10-15')
    const id = shiftsOf(far)[0]!.id

    expect(schedule.shiftRemovalRefusal(id)).toBe('move-past-next')
    expect(schedule.strandedMoveOn(id)).toBeNull()
    expect(() => schedule.removeShift(id)).toThrow(RangeError)
  })

  it.each(['2026-10-22', '2026-10-23', '2026-10-24'])(
    'refusée quand un report seul qui suit ne tomberait plus sur le rythme rétabli : 26 avancée au %s (graine 2157)',
    (to) => {
      const alone = moved(report, '2026-10-15', '2026-10-26', to, false)
      const schedule = scheduleOf(alone, '2026-10-15')
      const id = shiftsOf(alone)[0]!.id

      expect(schedule.shiftRemovalRefusal(id)).toBe('move-off-rhythm')
      expect(schedule.strandedMoveOn(id)).toBe(to)
      expect(() => schedule.removeShift(id)).toThrow(RangeError)
    },
  )

  it('un report seul d’avant le décalage ne la bloque pas', () => {
    const before = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-17', false)
    const shifted = moved(before, '2026-10-15', '2026-10-23', '2026-10-26', true)
    const id = shiftsOf(shifted)[0]!.id

    expect(scheduleOf(shifted, '2026-10-15').shiftRemovalRefusal(id)).toBeNull()
  })
})

describe('« Supprimer ce report » grisé : la dose reviendrait trop près de la suivante (2026-10-05)', () => {
  // Hebdomadaire du jeudi : la dose du 26 nov. avancée au 20, la suite au 27.
  const thursday = done(carnet(weekly({ firstDueOn: '2026-11-19' })), '2026-11-19')

  it('avancée avec décalage : refusé, avec la dose et la suivante', () => {
    const book = moved(thursday, '2026-11-19', '2026-11-26', '2026-11-20', true)
    const id = book.doses.find(({ status }) => status === 'postponed')!.id
    const schedule = scheduleOf(book, '2026-11-19')

    expect(schedule.moveRemovalRefusal(id)).toEqual({ dueOn: '2026-11-26', nextOn: '2026-11-27' })
    expect(() => schedule.removeMove(id)).toThrow(RangeError)
  })

  it('avancée seule : permis, la suite n’a pas bougé', () => {
    const book = moved(thursday, '2026-11-19', '2026-11-26', '2026-11-20', false)
    const id = book.doses.find(({ status }) => status === 'postponed')!.id

    expect(scheduleOf(book, '2026-11-19').moveRemovalRefusal(id)).toBeNull()
  })

  it('reportée avec décalage : permis, la dose revient loin de la suivante', () => {
    const book = moved(pixel, '2026-10-15', '2026-10-16', '2026-10-19', true)
    const id = book.doses.find(({ status }) => status === 'postponed')!.id

    expect(scheduleOf(book, '2026-10-15').moveRemovalRefusal(id)).toBeNull()
  })
})

describe('I2 : une correction refusée dans les deux états de la case fait suivre le report', () => {
  // Vendredis ; le 16 donnée le lundi 19 avec décalage (26, 2 nov.), le 26 reporté seul au 30.
  const prise16 = stored({
    periodId: 'p1',
    dueOn: '2026-10-16',
    dueTime: null,
    givenOn: '2026-10-19',
    status: 'given',
    nextDueDate: '2026-10-26',
  })
  const book: Carnet = {
    ...carnet(weekly({ firstDueOn: '2026-10-09' })),
    doses: [
      stored({
        periodId: 'p1',
        dueOn: '2026-10-09',
        dueTime: null,
        givenOn: '2026-10-09',
        status: 'given',
        nextDueDate: '2026-10-16',
      }),
      prise16,
      stored({
        periodId: 'p1',
        dueOn: '2026-10-16',
        dueTime: null,
        givenOn: null,
        status: 'shift',
        nextDueDate: '2026-10-19',
      }),
      stored({
        periodId: 'p1',
        dueOn: '2026-10-26',
        dueTime: null,
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-10-30',
      }),
    ],
  }
  const today = '2026-10-27'

  it.each([true, false])(
    'accepté, case %s : le report garde le 30, qui retombe sur une dose du rythme',
    (box) => {
      const schedule = scheduleOf(book, today)

      expect(schedule.redateRefusal(prise16.id, '2026-10-16', box)).toBeNull()
      expect(schedule.redate(prise16.id, '2026-10-16', box).postponement).toMatchObject({
        kept: false,
        followedOn: '2026-10-30',
      })
      const after = redate(book, today, prise16.id, '2026-10-16', box)
      const next = scheduleOf(after, today)
      expect(next.unloggedDoses).toEqual([])
      expect(next.currentDoses).toEqual([due('2026-10-23')])
      expect(dueDays(next.upcoming(2))).toEqual(['2026-10-30', '2026-11-06'])
    },
  )

  it('au samedi 17, case cochée : le report vise le 31, la plus proche de son arrivée', () => {
    const { postponement } = scheduleOf(book, today).redate(prise16.id, '2026-10-17', true)

    expect(postponement).toMatchObject({
      kept: true,
      followed: true,
      line: { dueOn: '2026-10-31', status: 'postponed', nextDueDate: '2026-10-30' },
    })
    const next = scheduleOf(redate(book, today, prise16.id, '2026-10-17', true), today)
    expect(dueDays(next.upcoming(3))).toEqual(['2026-10-30', '2026-11-07', '2026-11-14'])
  })

  it('au lundi 12, case cochée : jamais avant aujourd’hui ni contre la dose suivante', () => {
    const next = scheduleOf(redate(book, today, prise16.id, '2026-10-12', true), today)
    const moves = next.doses.filter(({ status }) => status === 'postponed')

    expect(moves.every(({ nextDueDate }) => nextDueDate >= today)).toBe(true)
    expect(dueDays(next.upcoming(2))).toEqual(['2026-10-30', '2026-11-09'])
  })
})

describe('Q2 a : rien ne fait passer la dose suivante à un report seul', () => {
  // Vendredis ; la dose du 9 en retard, celle du 16 reportée seule au jeudi 22.
  const report: Carnet = {
    ...carnet(weekly({ firstDueOn: '2026-10-02' })),
    doses: [
      stored({
        periodId: 'p1',
        dueOn: '2026-10-02',
        dueTime: null,
        givenOn: '2026-10-02',
        status: 'given',
        nextDueDate: '2026-10-09',
      }),
      stored({
        periodId: 'p1',
        dueOn: '2026-10-16',
        dueTime: null,
        givenOn: null,
        status: 'postponed',
        nextDueDate: '2026-10-22',
      }),
    ],
  }
  const late = { kind: 'given' as const, due: due('2026-10-09'), givenOn: '2026-10-14' }

  it('« Fait à une autre date » coché est refusé ; la case reste proposée', () => {
    const schedule = scheduleOf(report, '2026-10-14')

    expect(schedule.offersShift(due('2026-10-09'), '2026-10-14')).toBe(true)
    expect(schedule.noteRefusal(due('2026-10-09'), '2026-10-14')).toBe('2026-10-22')
    expect(() => schedule.doseFor({ ...late, shiftsFollowing: true })).toThrow(RangeError)
    expect(schedule.doseFor({ ...late, shiftsFollowing: false }).shift).toBeNull()
  })

  it('« C’est fait » en retard, sans case : la prise seule', () => {
    expect(scheduleOf(report, '2026-10-14').doseFor(late).shift).toBeNull()
  })

  it('« Changer la date » vers un jour qui le ferait passer est refusé', () => {
    const noted = record(report, '2026-10-09', {
      kind: 'given',
      due: due('2026-10-09'),
      givenOn: '2026-10-09',
    })
    const schedule = scheduleOf(noted, '2026-10-12')
    const id = lastDose(noted).id

    // Le report, plus ancien que la prise, ne la suit pas (TR-24 bis) : refusé dans cet état seul.
    expect(schedule.redateRefusal(id, '2026-10-07')).toEqual({ on: '2026-10-22', reason: 'passes' })
    expect(() => schedule.redate(id, '2026-10-07')).toThrow(RangeError)
    expect(schedule.redateOffersShift(id, '2026-10-07')).toBe(true)
    expect(schedule.redateRefusal(id, '2026-10-07', false)).toBeNull()
  })
})
