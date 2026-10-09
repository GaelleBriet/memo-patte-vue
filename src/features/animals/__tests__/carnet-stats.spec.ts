// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { carnetRemindersStat } from '../logic/carnet-stats'

const t = (key: string) => key

describe('carnetRemindersStat', () => {
  it('compte les rappels des sections tant qu’aucun n’est en retard', () => {
    expect(
      carnetRemindersStat(t, [
        { total: 2, overdue: 0 },
        { total: 1, overdue: 0 },
      ]),
    ).toEqual({ value: '3', sub: 'animals.carnet.stats.upcoming', isOverdue: false })
  })

  it('ne compte plus que les retards dès qu’il y en a un', () => {
    expect(
      carnetRemindersStat(t, [
        { total: 2, overdue: 1 },
        { total: 3, overdue: 0 },
      ]),
    ).toEqual({ value: '1', sub: 'animals.carnet.stats.overdue', isOverdue: true })
  })

  it('additionne les retards de toutes les sections', () => {
    expect(
      carnetRemindersStat(t, [
        { total: 2, overdue: 1 },
        { total: 3, overdue: 2 },
      ]).value,
    ).toBe('3')
  })

  it('affiche 0 rappel à venir sans rien', () => {
    expect(carnetRemindersStat(t, [])).toEqual({
      value: '0',
      sub: 'animals.carnet.stats.upcoming',
      isOverdue: false,
    })
  })
})
