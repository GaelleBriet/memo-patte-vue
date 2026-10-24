// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  redateDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, days, H, keys, line, setting } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof redateDose>) => {
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
    it(`Milo, rien noté le 24 ; la prise d’hier 20 h changée à aujourd’hui, case ${checked ? 'cochée' : 'décochée'} : elle reste sur hier 20 h`, () => {
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
      expect(keys(treatmentView(applied(input, result.changes)).unloggedDoses)).toEqual([])
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
