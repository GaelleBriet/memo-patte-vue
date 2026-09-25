import { afterEach, describe, expect, it } from 'vitest'

import i18n, { applyLocale } from '@/core/i18n'
import { dueDelayText } from '../domain/due-delay'

const t = i18n.global.t
const TODAY = '2026-09-23'

afterEach(() => {
  applyLocale('fr')
})

describe('dueDelayText', () => {
  it.each([
    ['2026-09-20', 'en retard de 3 jours', true],
    ['2026-09-22', 'en retard de 1 jour', true],
    ['2026-09-23', 'aujourd’hui', false],
    ['2026-09-24', 'demain', false],
    ['2026-09-28', 'dans 5 jours', false],
    ['2026-10-22', 'dans 29 jours', false],
    ['2026-10-23', 'dans 1 mois', false],
    ['2027-08-26', 'dans 11 mois', false],
    ['2027-09-23', 'dans 1 an', false],
    ['2029-09-23', 'dans 3 ans', false],
  ])('échéance du %s : « %s »', (dueDate, text, overdue) => {
    expect(dueDelayText(t, dueDate, TODAY)).toEqual({ text, overdue })
  })

  it('suit la langue courante', () => {
    applyLocale('en')

    expect(dueDelayText(t, '2027-08-26', TODAY).text).toBe('in 11 months')
    expect(dueDelayText(t, '2026-09-20', TODAY).text).toBe('3 days overdue')
  })
})
