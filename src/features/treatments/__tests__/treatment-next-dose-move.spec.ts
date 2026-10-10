import { describe, expect, it } from 'vitest'

import { dose, period, postponed, treatment } from './treatment-fixtures'
import { moveArrivingOn, resolveMoved } from '../logic/treatment-next-dose-move'
import { treatmentScheduleOf } from '../logic/treatment-schedule-adapter'
import { settingsOf } from '../logic/treatment-settings'

const TODAY = '2026-09-09'
const WEEKLY = period({ frequency: { value: 1, unit: 'week' } })
const REPORTEE = treatment(
  [WEEKLY],
  [dose('2026-09-01', '2026-09-08'), postponed('2026-09-08', '2026-09-10')],
)

function moved(chosenOn: string, shiftsFollowing = true) {
  const schedule = treatmentScheduleOf(REPORTEE, TODAY)
  const due = schedule.currentDoses[0]!
  return resolveMoved(
    WEEKLY,
    REPORTEE,
    schedule,
    due,
    settingsOf(WEEKLY),
    { chosenOn, shiftsFollowing },
    TODAY,
  )
}

describe('prochaine dose déplacée (TR-9)', () => {
  it('retrouve la ligne de report qui amène la prochaine dose', () => {
    const schedule = treatmentScheduleOf(REPORTEE, TODAY)
    const due = schedule.currentDoses[0]!

    expect(due.dueOn).toBe('2026-09-10')
    expect(moveArrivingOn(schedule, due)?.id).toBe('report 2026-09-08')
    expect(moveArrivingOn(treatmentScheduleOf(treatment([WEEKLY]), TODAY), due)).toBeUndefined()
  })

  it('propose la date en vigueur et réécrit la ligne de report à la date choisie', () => {
    expect(moved('2026-09-12')).toMatchObject({
      change: 'correct',
      movedLineId: 'report 2026-09-08',
      nextDose: {
        change: 'move',
        proposedOn: '2026-09-10',
        earliest: TODAY,
        latest: null,
        refusal: null,
        shiftInitial: false,
      },
      move: {
        report: { action: 'rewrite', doseId: 'report 2026-09-08' },
        shift: { action: 'create' },
      },
    })
  })

  it('annonce sous la case les doses qui suivraient, décalées ou non', () => {
    expect(moved('2026-09-12').nextDose?.shift).toEqual({
      following: ['2026-09-19', '2026-09-26', '2026-10-03'],
      followingAlone: ['2026-09-15', '2026-09-22', '2026-09-29'],
      lost: [],
      aloneLatest: '2026-09-14',
    })
  })

  it('ne propose pas d’aller seule au-delà de la dose suivante', () => {
    expect(moved('2026-09-20').nextDose?.shift).toMatchObject({
      followingAlone: [],
      aloneLatest: '2026-09-14',
    })
  })

  it('n’écrit rien hors des bornes du déplacement', () => {
    expect(moved('2026-09-08').move).toBeNull()
    expect(moved('2026-09-20', false).move).toBeNull()
  })
})
