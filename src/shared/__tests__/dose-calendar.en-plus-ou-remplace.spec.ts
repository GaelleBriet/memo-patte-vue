// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  treatmentView,
  type Frequency,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { H, keys, line, setting, DAY, WEEK } from './dose-calendar.v2.aides'

const THREE_MONTHS: Frequency = { value: 3, unit: 'month' }
const due = (dueOn: string, dueTime: string | null = null) => ({ settingId: 'p1', dueOn, dueTime })
const accepted = (result: ReturnType<typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}
const written = (result: ReturnType<typeof noteDose>) =>
  accepted(result).changes.map((change) =>
    change.action === 'delete'
      ? ['delete', change.id]
      : [
          change.action,
          change.line.status,
          change.line.dueOn,
          change.line.dueTime,
          change.line.givenOn,
          change.line.targetOn,
        ],
  )
const nextAfter = (input: TreatmentViewInput, result: ReturnType<typeof noteDose>) =>
  keys(treatmentView(applied(input, accepted(result).changes)).currentDoses)

describe('« En plus » ou « Remplace celle du … » (R5, Q27 du 24 octobre 2026)', () => {
  describe('Luna, Bravecto tous les 3 mois, première prise le 1er novembre ; le 24 octobre', () => {
    const input: TreatmentViewInput = {
      settings: [setting('p1', '2026-11-01', THREE_MONTHS)],
      lines: [],
      today: '2026-10-24',
    }
    const note = (answer: 'extra' | 'replaces', shiftsFollowing = false) =>
      noteDose(input, {
        due: due('2026-11-01'),
        status: 'given',
        givenOn: '2026-10-24',
        shiftsFollowing,
        answer,
      })

    it('la question se pose avant la première échéance, quelle que soit l’avance', () => {
      const view = treatmentView(input)
      expect(view.asksExtraOrReplaces(due('2026-11-01'), '2026-10-24')).toBe(true)
      expect(view.asksExtraOrReplaces(due('2026-11-01'), '2026-10-31')).toBe(true)
    })

    it('« En plus » : une prise en plus sous sa date réelle, la prochaine dose reste le 1er nov.', () => {
      expect(written(note('extra'))).toEqual([
        ['create', 'extra', '2026-10-24', null, '2026-10-24', null],
      ])
      expect(accepted(note('extra')).offersShift).toBe(false)
      expect(nextAfter(input, note('extra'))).toEqual(['2026-11-01'])
    })

    it('« Remplace » : la dose du 1er nov. donnée le 24 oct., prochaine dose le 1er févr. 2027', () => {
      expect(written(note('replaces'))).toEqual([
        ['create', 'given', '2026-11-01', null, '2026-10-24', null],
      ])
      expect(nextAfter(input, note('replaces'))).toEqual(['2027-02-01'])
    })

    it('« Remplace » propose la case ; cochée, la suite repart du 24 oct. : prochaine dose le 24 janv.', () => {
      expect(accepted(note('replaces')).offersShift).toBe(true)
      expect(written(note('replaces', true))).toEqual([
        ['create', 'given', '2026-11-01', null, '2026-10-24', null],
        ['create', 'shift', '2026-11-01', null, null, '2026-10-24'],
      ])
      expect(nextAfter(input, note('replaces', true))).toEqual(['2027-01-24'])
    })
  })

  describe('Milbemax chaque semaine à 9 h, dose du jour déjà notée ; seconde prise aujourd’hui (Q29)', () => {
    const input: TreatmentViewInput = {
      settings: [setting('p1', '2026-10-17', WEEK, ['09:00'])],
      lines: [
        line('p1', 'given', '2026-10-17', '09:00'),
        line('p1', 'given', '2026-10-24', '09:00'),
      ],
      today: '2026-10-24',
    }
    const note = (answer?: 'extra' | 'replaces') =>
      noteDose(input, {
        due: due('2026-10-31', '09:00'),
        status: 'given',
        givenOn: '2026-10-24',
        shiftsFollowing: false,
        ...(answer === undefined ? {} : { answer }),
      })

    it('la prochaine dose du 31, un rythme plus loin : la question se pose', () => {
      expect(
        treatmentView(input).asksExtraOrReplaces(due('2026-10-31', '09:00'), '2026-10-24'),
      ).toBe(true)
    })

    it('« Remplace » couvre la dose du 31, prochaine dose le 7 nov.', () => {
      expect(written(note('replaces'))).toEqual([
        ['create', 'given', '2026-10-31', '09:00', '2026-10-24', null],
      ])
      expect(nextAfter(input, note('replaces'))).toEqual(['2026-11-07 09:00'])
    })

    it('« En plus » écrit la prise en plus du jour', () => {
      expect(written(note('extra'))).toEqual([
        ['create', 'extra', '2026-10-24', '09:00', '2026-10-24', null],
      ])
    })

    it('sans réponse (« Changer la date », anciens exports) : la règle par distance, inchangée', () => {
      expect(written(note())).toEqual([
        ['create', 'extra', '2026-10-24', '09:00', '2026-10-24', null],
      ])
    })
  })

  describe('plusieurs heures par jour', () => {
    it('une heure donnée en avance dans sa journée couvre déjà : pas de question', () => {
      const view = treatmentView({
        settings: [setting('p1', '2026-10-20', DAY, H)],
        lines: [],
        today: '2026-10-24',
      })
      expect(view.asksExtraOrReplaces(due('2026-10-24', '20:00'), '2026-10-24')).toBe(false)
    })

    it('au-delà de sa journée, un rythme ou plus avant : la question, et « Remplace » couvre jour et heure', () => {
      const input: TreatmentViewInput = {
        settings: [setting('p1', '2026-11-01', WEEK, H)],
        lines: [],
        today: '2026-10-24',
      }
      expect(
        treatmentView(input).asksExtraOrReplaces(due('2026-11-01', '08:00'), '2026-10-24'),
      ).toBe(true)
      const replaces = noteDose(input, {
        due: due('2026-11-01', '08:00'),
        status: 'given',
        givenOn: '2026-10-24',
        shiftsFollowing: false,
        answer: 'replaces',
      })
      expect(written(replaces)).toEqual([
        ['create', 'given', '2026-11-01', '08:00', '2026-10-24', null],
      ])
      const extra = noteDose(input, {
        due: due('2026-11-01', '08:00'),
        status: 'given',
        givenOn: '2026-10-24',
        shiftsFollowing: false,
        answer: 'extra',
      })
      expect(written(extra)).toEqual([
        ['create', 'extra', '2026-10-24', '08:00', '2026-10-24', null],
      ])
    })

    it('moins d’un rythme avant : pas de question', () => {
      const view = treatmentView({
        settings: [setting('p1', '2026-10-18', WEEK, H)],
        lines: [
          line('p1', 'given', '2026-10-18', '08:00'),
          line('p1', 'given', '2026-10-18', '20:00'),
        ],
        today: '2026-10-24',
      })
      expect(view.asksExtraOrReplaces(due('2026-10-25', '08:00'), '2026-10-24')).toBe(false)
    })
  })

  it('une réponse sans question ne change rien : la dose du jour donnée le jour même reste donnée', () => {
    const input: TreatmentViewInput = {
      settings: [setting('p1', '2026-10-17', WEEK)],
      lines: [],
      today: '2026-10-24',
    }
    const result = noteDose(input, {
      due: due('2026-10-24'),
      status: 'given',
      givenOn: '2026-10-24',
      shiftsFollowing: false,
      answer: 'extra',
    })
    expect(written(result)).toEqual([['create', 'given', '2026-10-24', null, '2026-10-24', null]])
  })
})
