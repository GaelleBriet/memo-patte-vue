// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  moveDose,
  reportFactsOf,
  treatmentView,
  type Line,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { setting, WEEK } from './dose-calendar.v2.aides'

// Les faits qu'une ligne de report garde de son histoire : son arrivée d'avant et le rang de son heure.

const REPORT = {
  settingId: 's1',
  dueOn: '2026-03-04',
  dueTime: '12:00',
  status: 'postponed' as const,
  givenOn: null,
  targetOn: '2026-03-05',
}

describe('reportFactsOf', () => {
  it('un report écrit pour la première fois : rang de son heure dans son réglage, aucune arrivée d’avant', () => {
    expect(reportFactsOf(REPORT, undefined, ['06:00', '12:00', '18:00', '23:00'])).toEqual({
      previousTargetOn: null,
      previousTargetTime: null,
      dueRank: 2,
    })
  })

  it('le rang suit l’ordre de la journée, quel que soit l’ordre de stockage des heures', () => {
    expect(
      reportFactsOf({ ...REPORT, dueTime: '08:00' }, undefined, ['20:00', '08:00']).dueRank,
    ).toBe(1)
    expect(
      reportFactsOf({ ...REPORT, dueTime: '20:00' }, undefined, ['20:00', '08:00']).dueRank,
    ).toBe(2)
  })

  it('sans heure : rang 1 ; heure absente ou réglage inconnu : rang inconnu', () => {
    expect(reportFactsOf({ ...REPORT, dueTime: null }, undefined, []).dueRank).toBe(1)
    expect(reportFactsOf(REPORT, undefined, ['08:00', '20:00']).dueRank).toBeNull()
    expect(reportFactsOf(REPORT, undefined, undefined).dueRank).toBeNull()
  })

  it('déplacé vers une autre arrivée : il garde celle d’avant, jour et heure, et son rang', () => {
    const before = { ...REPORT, dueRank: 2 }
    expect(reportFactsOf({ ...REPORT, targetOn: '2026-03-08' }, before, ['08:00'])).toEqual({
      previousTargetOn: '2026-03-05',
      previousTargetTime: '12:00',
      dueRank: 2,
    })
  })

  it('réécrit vers la même arrivée : il garde l’arrivée d’avant qu’il portait', () => {
    const before = {
      ...REPORT,
      previousTargetOn: '2026-03-04',
      previousTargetTime: '12:00',
      dueRank: 2,
    }
    expect(reportFactsOf(REPORT, before, ['12:00'])).toEqual({
      previousTargetOn: '2026-03-04',
      previousTargetTime: '12:00',
      dueRank: 2,
    })
  })

  it('une prise ou un décalage ne portent aucun fait de report', () => {
    expect(reportFactsOf({ ...REPORT, status: 'shift' }, undefined, ['12:00'])).toEqual({
      previousTargetOn: null,
      previousTargetTime: null,
      dueRank: null,
    })
  })
})

describe('Milo, chaque semaine à 20 h depuis le 4 mars ; la dose du 11 reportée au 12, puis déplacée du 12 au 15', () => {
  const s1 = setting('s1', '2026-03-04', WEEK, ['20:00'], { createdAt: '2026-03-01T08:00:00.000Z' })
  const report: Line = {
    id: 'l1',
    settingId: 's1',
    dueOn: '2026-03-11',
    dueTime: '20:00',
    status: 'postponed',
    givenOn: null,
    targetOn: '2026-03-12',
    dueRank: 1,
    updatedAt: '2026-03-03T08:00:00.000Z',
  }
  const base: TreatmentViewInput = { settings: [s1], lines: [report], today: '2026-03-10' }

  it('la ligne du report, réécrite, garde son arrivée d’avant (le 12 à 20 h) ; la fiche ne change pas de lecture', () => {
    const due = treatmentView(base).slots('2026-03-12', '2026-03-12')[0]!.due
    const result = moveDose(base, { due, to: '2026-03-15', shiftsFollowing: false })
    if ('refusal' in result) throw new Error(result.refusal.reason)

    const after = applied(base, result.changes)

    expect(after.lines.find(({ id }) => id === 'l1')).toMatchObject({
      dueOn: '2026-03-11',
      targetOn: '2026-03-15',
      previousTargetOn: '2026-03-12',
      previousTargetTime: '20:00',
      dueRank: 1,
    })
    const plain = {
      ...after,
      lines: after.lines.map(
        ({ previousTargetOn: _o, previousTargetTime: _t, dueRank: _r, ...line }) => line,
      ),
    }
    const dates = (input: TreatmentViewInput) =>
      treatmentView(input)
        .upcoming({ limit: 3 })
        .map(({ dueOn }) => dueOn)
    expect(dates(after)).toEqual(dates(plain))
  })
})
