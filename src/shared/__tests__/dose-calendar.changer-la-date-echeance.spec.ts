// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  redateAsksExtraOrReplaces,
  redateDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, days, H, keys, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof redateDose | typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

const rewritten = (input: TreatmentViewInput, result: GestureOutcome, id: string) => {
  const after = applied(input, result.changes).lines.find((other) => other.id === id)
  return [after?.dueOn, after?.dueTime, after?.status, after?.givenOn]
}

describe('« Changer la date » ne change jamais l’échéance d’une prise (TR-13, TR-24 bis, Q30)', () => {
  // Milo, Métacam tous les jours à 8 h et 20 h depuis le 5 oct., « Toutes données » ; le 24, 8 h notée.
  const metacam = setting('p1', '2026-10-05', DAY, H)
  const toutes = days('2026-10-05', '2026-10-23').flatMap((day) =>
    H.map((time) => line('p1', 'given', day, time)),
  )
  const hierSoir = toutes.find(
    ({ dueOn, dueTime }) => dueOn === '2026-10-23' && dueTime === '20:00',
  )!

  it('Milo, 8 h du jour notée ; la prise d’hier 20 h changée à aujourd’hui : « hier · 20 h — Donnée le 24 oct. », aucun bandeau, 20 h reste la dose du jour, pas de case', () => {
    const input = {
      settings: [metacam],
      lines: [...toutes, line('p1', 'given', '2026-10-24', '08:00')],
      today: '2026-10-24',
    }
    const result = accepted(
      redateDose(input, { lineId: hierSoir.id, givenOn: '2026-10-24', shiftsFollowing: true }),
    )

    expect(result.offersShift).toBe(false)
    expect(rewritten(input, result, hierSoir.id)).toEqual([
      '2026-10-23',
      '20:00',
      'given',
      '2026-10-24',
    ])
    const read = treatmentView(applied(input, result.changes))
    expect(keys(read.unloggedDoses)).toEqual([])
    expect(keys(read.currentDoses)).toEqual(['2026-10-24 20:00'])
    expect(result.newlyDue).toEqual([])
  })

  for (const checked of [true, false]) {
    it(`Milo, rien noté le 24 ; la prise d’hier 20 h changée à aujourd’hui, case ${checked ? 'cochée' : 'décochée'} : elle reste sur hier 20 h, pas de case, les doses du 24 restent à donner (Q38)`, () => {
      const input = { settings: [metacam], lines: toutes, today: '2026-10-24' }
      const result = accepted(
        redateDose(input, { lineId: hierSoir.id, givenOn: '2026-10-24', shiftsFollowing: checked }),
      )

      expect(rewritten(input, result, hierSoir.id)).toEqual([
        '2026-10-23',
        '20:00',
        'given',
        '2026-10-24',
      ])
      expect(result.offersShift).toBe(false)
      const read = treatmentView(applied(input, result.changes))
      expect(keys(read.unloggedDoses)).toEqual([])
      expect(keys(read.currentDoses)).toEqual(['2026-10-24 08:00', '2026-10-24 20:00'])
    })
  }

  it('jours grisés : avant-hier est un rythme avant l’échéance d’hier, refusé ; hier est possible ; demain est futur', () => {
    const input = { settings: [metacam], lines: toutes, today: '2026-10-24' }

    expect(
      redateDose(input, { lineId: hierSoir.id, givenOn: '2026-10-22', shiftsFollowing: true }),
    ).toEqual({ refusal: { reason: 'too-early', earliest: '2026-10-23' } })
    expect(
      'refusal' in
        redateDose(input, { lineId: hierSoir.id, givenOn: '2026-10-23', shiftsFollowing: true }),
    ).toBe(false)
    expect(() =>
      redateDose(input, { lineId: hierSoir.id, givenOn: '2026-10-25', shiftsFollowing: true }),
    ).toThrow(RangeError)
  })

  // Luna, Bravecto tous les 3 mois depuis le 1er mai : 1er mai, 1er août, 1er nov., 1er févr.
  const bravecto = setting('p1', '2026-05-01', { value: 3, unit: 'month' })
  const mai = line('p1', 'given', '2026-05-01')
  const aout = line('p1', 'given', '2026-08-01')

  it('Bravecto, prise du 1er nov. donnée le 1er nov. ; le 10 févr., dose du 1er févr. en retard, la prise changée au 5 févr. : elle reste sur le 1er nov., le 1er févr. reste la dose du moment', () => {
    const nov = line('p1', 'given', '2026-11-01')
    const input = { settings: [bravecto], lines: [mai, aout, nov], today: '2027-02-10' }
    const result = accepted(
      redateDose(input, { lineId: nov.id, givenOn: '2027-02-05', shiftsFollowing: false }),
    )

    expect(rewritten(input, result, nov.id)).toEqual(['2026-11-01', null, 'given', '2027-02-05'])
    const read = treatmentView(applied(input, result.changes))
    expect([keys(read.currentDoses), keys(read.unloggedDoses)]).toEqual([['2027-02-01'], []])
  })

  it('Bravecto, prise du 1er nov. : possible dès le 2 août, le 1er août est grisé', () => {
    const nov = line('p1', 'given', '2026-11-01')
    const input = { settings: [bravecto], lines: [mai, aout, nov], today: '2026-11-10' }

    expect(
      redateDose(input, { lineId: nov.id, givenOn: '2026-08-01', shiftsFollowing: false }),
    ).toEqual({ refusal: { reason: 'too-early', earliest: '2026-08-02' } })
    const result = accepted(
      redateDose(input, { lineId: nov.id, givenOn: '2026-08-02', shiftsFollowing: false }),
    )
    expect(rewritten(input, result, nov.id)).toEqual(['2026-11-01', null, 'given', '2026-08-02'])
  })
})

describe('« Changer la date » d’une prise en plus pose « Cette prise » quand elle couvrirait une dose (Q37)', () => {
  // Milbemax chaque vendredi : 2, 9, 16, 23, 30 ; le 16, la dose donnée puis une prise « En plus ».
  const milbemax = setting('p1', '2026-10-02', WEEK)
  const given = ['2026-10-02', '2026-10-09', '2026-10-16'].map((day) => line('p1', 'given', day))
  const enPlus = line('p1', 'extra', '2026-10-16')
  const input = { settings: [milbemax], lines: [...given, enPlus], today: '2026-10-17' }

  it('le 17 couvrirait la dose du 23 : la question se pose ; le 15 et le 16, non', () => {
    expect(redateAsksExtraOrReplaces(input, enPlus.id, '2026-10-17')).toEqual({
      settingId: 'p1',
      dueOn: '2026-10-23',
      dueTime: null,
    })
    expect(redateAsksExtraOrReplaces(input, enPlus.id, '2026-10-15')).toBeNull()
    expect(redateAsksExtraOrReplaces(input, enPlus.id, '2026-10-16')).toBeNull()
  })

  it('« En plus » : une prise en plus le 17, la prochaine dose reste le 23', () => {
    const result = accepted(
      redateDose(input, {
        lineId: enPlus.id,
        givenOn: '2026-10-17',
        shiftsFollowing: false,
        answer: 'extra',
      }),
    )

    expect(rewritten(input, result, enPlus.id)).toEqual(['2026-10-17', null, 'extra', '2026-10-17'])
    expect(treatmentView(applied(input, result.changes)).nextDue?.dueOn).toBe('2026-10-23')
  })

  it('« Remplace celle du 23 oct. » : la dose du 23 donnée le 17, prochaine dose le 30', () => {
    const result = accepted(
      redateDose(input, {
        lineId: enPlus.id,
        givenOn: '2026-10-17',
        shiftsFollowing: false,
        answer: 'replaces',
      }),
    )

    expect(rewritten(input, result, enPlus.id)).toEqual(['2026-10-23', null, 'given', '2026-10-17'])
    expect(treatmentView(applied(input, result.changes)).nextDue?.dueOn).toBe('2026-10-30')
  })
})

describe('« Décaler aussi » : « Changer la date » et « Fait à une autre date » proposent la case dans les mêmes cas (Q38)', () => {
  const vendredis = setting('p1', '2026-10-02', WEEK)
  const metacam = setting('p1', '2026-10-05', DAY, H)
  const avant = days('2026-10-05', '2026-10-23').flatMap((day) =>
    H.map((time) => line('p1', 'given', day, time)),
  )
  const avance = (dueOn: string, givenOn: string, time: string | null = null) => ({
    ...line('p1', 'given', dueOn, time),
    givenOn,
  })
  const cas = [
    {
      nom: 'dose du moment en retard : la prise du 16 changée au 19, le 20',
      settings: [vendredis],
      prise: line('p1', 'given', '2026-10-16'),
      autres: [line('p1', 'given', '2026-10-09')],
      today: '2026-10-20',
      givenOn: '2026-10-19',
      propose: true,
    },
    {
      nom: 'avance : la dose du 23 donnée le 20, changée au 21',
      settings: [vendredis],
      prise: avance('2026-10-23', '2026-10-20'),
      autres: [line('p1', 'given', '2026-10-16')],
      today: '2026-10-21',
      givenOn: '2026-10-21',
      propose: true,
    },
    {
      nom: 'dose plus ancienne : la prise du 2 changée au 17, le 20',
      settings: [vendredis],
      prise: line('p1', 'given', '2026-10-02'),
      autres: [],
      today: '2026-10-20',
      givenOn: '2026-10-17',
      propose: false,
    },
    {
      nom: 'plusieurs heures, dose plus ancienne : la prise du 23 à 20 h changée au 24, rien noté le 24',
      settings: [metacam],
      prise: avant.find(({ dueOn, dueTime }) => dueOn === '2026-10-23' && dueTime === '20:00')!,
      autres: avant.filter(({ dueOn, dueTime }) => dueOn !== '2026-10-23' || dueTime !== '20:00'),
      today: '2026-10-24',
      givenOn: '2026-10-24',
      propose: false,
    },
    {
      nom: 'plusieurs heures, avance : chaque vendredi à 8 h et 20 h, les deux doses du 23 données le 20, 20 h changée au 19',
      settings: [setting('p1', '2026-10-02', WEEK, H)],
      prise: avance('2026-10-23', '2026-10-20', '20:00'),
      autres: [
        ...['2026-10-09', '2026-10-16'].flatMap((day) =>
          H.map((time) => line('p1', 'given', day, time)),
        ),
        avance('2026-10-23', '2026-10-20', '08:00'),
      ],
      today: '2026-10-20',
      givenOn: '2026-10-19',
      propose: true,
    },
  ]

  for (const { nom, settings, prise, autres, today, givenOn, propose } of cas) {
    it(`${nom} : case ${propose ? 'proposée' : 'non proposée'}`, () => {
      const input = { settings, lines: [...autres, prise], today }
      const redated = accepted(
        redateDose(input, { lineId: prise.id, givenOn, shiftsFollowing: true }),
      )
      const noted = noteDose(
        { settings, lines: autres, today },
        {
          due: { settingId: prise.settingId, dueOn: prise.dueOn, dueTime: prise.dueTime },
          status: 'given',
          givenOn,
          shiftsFollowing: true,
        },
      )

      expect([redated.offersShift, accepted(noted).offersShift]).toEqual([propose, propose])
    })
  }
})

describe('« Décaler aussi » : une dose encore à venir au jour de la nouvelle date garde la case (Q38)', () => {
  // Tous les 3 jours à 20 h depuis le 26 mars ; la dose du 26 sans prise.
  it('le 29, « C’est fait » sur le 29 puis la prise changée au 27, quand la dose du 26 était encore la dose du moment : case proposée, comme « Fait à une autre date » le 27', () => {
    const s1 = setting('p1', '2026-03-26', { value: 3, unit: 'day' }, ['20:00'])
    const prise = line('p1', 'given', '2026-03-29', '20:00')
    const input = { settings: [s1], lines: [prise], today: '2026-03-29' }
    const redated = accepted(
      redateDose(input, { lineId: prise.id, givenOn: '2026-03-27', shiftsFollowing: true }),
    )
    const noted = accepted(
      noteDose(
        { ...input, lines: [] },
        {
          due: { settingId: 'p1', dueOn: '2026-03-29', dueTime: '20:00' },
          status: 'given',
          givenOn: '2026-03-27',
          shiftsFollowing: true,
        },
      ),
    )

    expect([redated.offersShift, noted.offersShift]).toEqual([true, true])
  })
})
