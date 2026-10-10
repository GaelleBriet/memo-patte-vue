import type { TreatmentPeriodInput, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

import { FREQUENCIES, int, pick, plusDays, TIMES } from './carnet'
import { stampOf, WalkStopped, type Walk } from './walk-state'

export function stop(walk: Walk): void {
  const { periods, today } = walk.book
  const last = periods.at(-1)
  if (last === undefined || last.stoppedOn !== null || last.startsOn > today) return
  walk.log.push(`${today} arrêter`)
  walk.book = {
    ...walk.book,
    periods: periods.map((period) => (period === last ? { ...period, stoppedOn: today } : period)),
  }
}

export function resume(walk: Walk, before: TreatmentSchedule): void {
  const { periods, today } = walk.book
  if (before.phase !== 'stopped' || periods.length >= 4) return
  const firstDueOn = plusDays(today, int(walk.random, 0, 3))
  const times = pick(walk.random, TIMES) ?? []
  const period: TreatmentPeriodInput = {
    id: `p${periods.length + 1}`,
    startsOn: today,
    firstDueOn,
    referenceOn: firstDueOn,
    endsOn: walk.random() < 0.2 ? plusDays(firstDueOn, int(walk.random, 3, 40)) : null,
    stoppedOn: null,
    frequency: pick(walk.random, FREQUENCIES) ?? { value: 1, unit: 'day' },
    times,
    createdAt: stampOf(walk),
  }
  walk.log.push(`${today} reprendre ${JSON.stringify(period)}`)
  walk.book = { ...walk.book, periods: [...periods, period] }
}

// La prochaine dose est l'arrivée d'un déplacement de cette période, seul ou avec décalage.
function arrivesOnNextDose(schedule: TreatmentSchedule, period: TreatmentPeriodInput): boolean {
  const day = schedule.currentDoses[0]?.dueOn
  return schedule.doses.some(
    ({ periodId, status, nextDueDate }) =>
      periodId === period.id && status === 'postponed' && nextDueDate === day,
  )
}

// « Modifier » : un nouveau réglage aux dates proposées par le moteur actuel.
export function newPeriod(walk: Walk, before: TreatmentSchedule): void {
  const { periods } = walk.book
  if (!before.currentPeriodHasDose || periods.length >= 4 || before.phase === 'stopped') return
  const picked = {
    frequency: pick(walk.random, FREQUENCIES) ?? { value: 1, unit: 'day' as const },
    times: pick(walk.random, TIMES) ?? [],
  }
  const current = periods.at(-1)
  const keeps =
    current !== undefined && arrivesOnNextDose(before, current) && walk.rhythmRandom() < 0.5
  const { frequency, times } = keeps ? current : picked
  let dates
  try {
    dates = before.newPeriod(frequency, times)
  } catch (error) {
    throw new WalkStopped(`${walk.book.today} nouvelle période : ${String(error)}`)
  }
  walk.log.push(
    `${walk.book.today} nouvelle période ${JSON.stringify({ ...dates, frequency, times })}`,
  )
  const period: TreatmentPeriodInput = {
    id: `p${periods.length + 1}`,
    ...dates,
    endsOn: walk.random() < 0.2 ? plusDays(dates.firstDueOn, int(walk.random, 3, 40)) : null,
    stoppedOn: null,
    frequency,
    times: [...times],
    createdAt: stampOf(walk),
  }
  walk.book = { ...walk.book, periods: [...periods, period] }
}
