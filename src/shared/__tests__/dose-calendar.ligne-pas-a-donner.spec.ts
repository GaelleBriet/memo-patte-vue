// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  newSettings,
  removeLine,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import type { Line } from '../domain/dose-calendar/types'
import { readings } from './dose-calendar.reglage-corrige.aides'
import { WEEK, keys, line, setting } from './dose-calendar.v2.aides'

// Milo, chaque lundi à 8 h depuis le 2 mars, rien de noté ; le 9 et le 16 répondus « pas à donner ».
function milo(extra: Line[] = [], today = '2026-03-18'): TreatmentViewInput {
  const weekly = setting('m1', '2026-03-02', WEEK, ['08:00'])
  return {
    settings: [weekly],
    lines: [
      line('m1', 'not-due', '2026-03-09', '08:00'),
      line('m1', 'not-due', '2026-03-16', '08:00'),
      ...extra,
    ],
    today,
  }
}

const shown = (input: TreatmentViewInput) =>
  treatmentView(input)
    .slots('2026-03-01', '2026-04-30')
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

describe('#873 : une ligne « pas à donner » retire sa dose de partout (décisions du 18 octobre 2026)', () => {
  it('la dose n’est nulle part : ni au calendrier, ni à renseigner, ni dose du moment ; la ligne couvre son échéance', () => {
    const input = milo()
    const view = treatmentView(input)
    expect(shown(input)).toEqual([
      '2026-03-02 08:00 pending',
      '2026-03-23 08:00 pending',
      '2026-03-30 08:00 pending',
      '2026-04-06 08:00 pending',
      '2026-04-13 08:00 pending',
      '2026-04-20 08:00 pending',
      '2026-04-27 08:00 pending',
    ])
    expect(keys(view.unloggedDoses)).toEqual([])
    expect(keys(view.currentDoses)).toEqual(['2026-03-02 08:00'])
    expect(view.history.map(({ effect }) => effect.kind)).toEqual(['covers', 'covers'])
    const { moteur, reference } = readings(input)
    expect(moteur).toEqual(reference)
  })

  it('« Supprimer » la ligne : la dose revient à renseigner', () => {
    const input = milo()
    const removal = removeLine(input, input.lines[1]!.id)
    if ('refusal' in removal) throw new Error(JSON.stringify(removal))
    const after = { ...input, lines: input.lines.filter(({ id }) => id !== input.lines[1]!.id) }
    expect(removal.changes).toEqual([{ action: 'delete', id: input.lines[1]!.id }])
    expect(keys(treatmentView(after).currentDoses)).toEqual(['2026-03-16 08:00'])
  })

  it('TR-25 : une prise plus récente sur la même dose la remplace ; plus ancienne, la ligne « pas à donner » l’emporte', () => {
    const older = milo()
    const given = {
      ...line('m1', 'given', '2026-03-16', '08:00'),
      updatedAt: '2027-01-01T00:00:00.000Z',
    }
    const withGiven = { ...older, lines: [...older.lines, given] }
    expect(shown(withGiven)).toContain('2026-03-16 08:00 given')
    const stale = { ...given, updatedAt: '2025-01-01T00:00:00.000Z' }
    const withStale = { ...older, lines: [...older.lines, stale] }
    expect(shown(withStale).some((key) => key.startsWith('2026-03-16'))).toBe(false)
  })

  it('n’est pas une prise : le réglage reste sans prise, « Modifier » repose la question sur ce qui est tombé depuis', () => {
    const input = milo([], '2026-03-25')
    const asked = newSettings(input, { frequency: WEEK, times: ['09:00'], endsOn: null })
    expect('question' in asked && keys(asked.question.fallen)).toEqual([
      '2026-03-02 08:00',
      '2026-03-23 08:00',
    ])
  })

  it('une journée retirée en entier n’est pas la dernière journée passée : la dose du 2 reste la dose du moment', () => {
    const view = treatmentView(milo())
    expect(view.phase).toBe('overdue')
    expect(keys(view.currentDoses)).toEqual(['2026-03-02 08:00'])
  })
})
