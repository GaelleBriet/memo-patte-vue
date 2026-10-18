// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  moveBounds,
  moveDose,
  removalRefusal,
  removeLine,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import type { Line } from '../domain/dose-calendar/types'
import { moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { WEEK, keys, line, setting } from './dose-calendar.v2.aides'

// Milo, chaque lundi à 8 h depuis le 2 mars ; le 8, la dose du 9 reportée au 11 en décalant la
// suite (18, 25) ; des lignes « pas à donner » sur le 18 et le 25.
function milo(): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [
      setting('s1', '2026-03-02', WEEK, ['08:00'], { createdAt: '2026-02-01T00:00:00.000Z' }),
    ],
    lines: [],
    today: '2026-03-02',
  }
  const carnet = moved(on(start, '2026-03-08'), '2026-03-09', '08:00', '2026-03-11', true)
  const notDue = (dueOn: string): Line => ({
    ...line('s1', 'not-due', dueOn, '08:00'),
    updatedAt: '2026-03-26T10:00:00.000Z',
  })
  return {
    ...on(carnet, '2026-03-26'),
    lines: [...carnet.lines, notDue('2026-03-18'), notDue('2026-03-25')],
  }
}

const removed = (input: TreatmentViewInput, id: string) => {
  const result = removeLine(input, id)
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  const deleted = new Set(
    result.changes.flatMap((change) => (change.action === 'delete' ? [change.id] : [])),
  )
  return { ...input, lines: input.lines.filter(({ id: each }) => !deleted.has(each)) }
}

const effectsOfNotDue = (input: TreatmentViewInput) =>
  treatmentView(input)
    .history.filter(({ line: each }) => each.status === 'not-due')
    .map(({ line: each, effect }) => `${each.dueOn} ${effect.kind}`)

const toFill = (input: TreatmentViewInput) => {
  const view = treatmentView(input)
  return keys([...view.unloggedDoses, ...view.currentDoses])
}

describe('« Supprimer » un report ou un décalage ne compte pas les lignes « pas à donner » plus loin (décision du 18 octobre 2026)', () => {
  for (const status of ['shift', 'postponed'] as const) {
    it(`${status} : la suppression est permise ; les lignes du 18 et du 25 deviennent sans effet, le 16 et le 23 reviennent à renseigner ; « Annuler » rétablit`, () => {
      const before = milo()
      const target = before.lines.find((each) => each.status === status)!
      expect(effectsOfNotDue(before)).toEqual(['2026-03-18 covers', '2026-03-25 covers'])
      expect(removalRefusal(before, target.id)).toBeNull()

      const after = removed(before, target.id)
      expect(effectsOfNotDue(after)).toEqual(['2026-03-18 idle', '2026-03-25 idle'])
      expect(toFill(after)).toEqual(
        expect.arrayContaining(['2026-03-16 08:00', '2026-03-23 08:00']),
      )
      expect(readings(after).moteur).toEqual(readings(after).reference)

      const undone = { ...after, lines: before.lines }
      expect(effectsOfNotDue(undone)).toEqual(['2026-03-18 covers', '2026-03-25 covers'])
      expect(toFill(undone)).toEqual(toFill(before))
    })
  }

  // Une ligne « pas à donner » du 11, plus ancienne que le report qui y arrive : le report l'emporte.
  const withOlderNotDueOn11 = (): TreatmentViewInput => {
    const input = milo()
    const older = {
      ...line('s1', 'not-due', '2026-03-11', '08:00'),
      updatedAt: '2026-01-01T00:00:00.000Z',
    }
    return { ...input, lines: [...input.lines, older] }
  }

  it('le report dont l’arrivée porte une ligne « pas à donner » n’a pas servi : sa suppression est permise', () => {
    const input = withOlderNotDueOn11()
    const report = input.lines.find(({ status }) => status === 'postponed')!
    expect(
      treatmentView(input).history.find(({ line: each }) => each.id === report.id)?.effect.kind,
    ).toBe('moves')
    expect(removalRefusal(input, report.id)).toBeNull()
  })

  it('la dose arrivée le 11 sur une ligne « pas à donner » se déplace de nouveau', () => {
    const input = withOlderNotDueOn11()
    const due = { settingId: 's1', dueOn: '2026-03-11', dueTime: '08:00' }
    const bounds = moveBounds(input, due, true)
    if ('refusal' in bounds) throw new Error(JSON.stringify(bounds))
    const result = moveDose(input, { due, to: bounds.earliest, shiftsFollowing: true })
    if ('refusal' in result) throw new Error(JSON.stringify(result))
    const report = input.lines.find(({ status }) => status === 'postponed')!
    expect(result.changes).toContainEqual(
      expect.objectContaining({ action: 'rewrite', id: report.id }),
    )
  })
})
