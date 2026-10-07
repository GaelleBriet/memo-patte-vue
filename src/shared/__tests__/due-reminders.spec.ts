// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { dueReminderPrefix, isLegacyReminderKey, parseReminderKey } from '../domain/due-reminders'

const ID = '22222222-2222-4222-8222-222222222222'
const ENTRY = { kind: 'vaccination', id: ID } as const

describe('dueReminderPrefix', () => {
  it('préfixe toutes les clés d’une entrée par son type et son identifiant', () => {
    expect(dueReminderPrefix(ENTRY)).toBe(`vaccination:${ID}:`)
    expect(dueReminderPrefix({ kind: 'treatment', id: ID })).toBe(`treatment:${ID}:`)
  })
})

describe('parseReminderKey', () => {
  it('relit l’entrée, l’échéance et le moment d’une clé de l’ancienne forme, sans heure', () => {
    expect(parseReminderKey(`vaccination:${ID}:2026-10-15:before`)).toEqual({
      entry: `vaccination:${ID}`,
      dueDate: '2026-10-15',
      dueTime: null,
      moment: 'before',
    })
  })

  it.each([
    ['une clé sans moment', `vaccination:${ID}:2026-10-15`],
    ['un moment inconnu', `vaccination:${ID}:2026-10-15:soon`],
    ['une clé d’un autre domaine', 'weight:3'],
    ['une clé à rallonge', `vaccination:${ID}:2026-10-15:due:2`],
  ])('ne lit pas %s', (_, key) => {
    expect(parseReminderKey(key)).toBeNull()
  })
})

describe('isLegacyReminderKey', () => {
  it.each([
    [`treatment:${ID}:2026-10-15:due`, true],
    [`treatment:${ID}:2026-10-15:2000:due`, false],
    [`treatment:${ID}:2026-10-15::overdue`, false],
    [`treatment:${ID}:2026-10-15:soon`, false],
  ])('%s : %s', (key, expected) => {
    expect(isLegacyReminderKey(key)).toBe(expected)
  })
})
