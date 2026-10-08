import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import { formatDaySeries } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

/** Doses passées sans prise qu'un geste fait apparaître : à renseigner, ou en retard. */
export type RevealedDues = { unlogged: Due[]; overdue: Due[] }

type PastSchedule = Pick<TreatmentSchedule, 'unloggedDoses' | 'currentDoses'>

function keyOf({ periodId, dueOn, dueTime }: Due): string {
  return `${periodId} ${dueOn} ${dueTime ?? ''}`
}

function overdueOf(schedule: PastSchedule, today: string): Due[] {
  return schedule.currentDoses.filter(({ dueOn }) => dueOn < today)
}

function added(before: readonly Due[], after: readonly Due[]): Due[] {
  const known = new Set(before.map(keyOf))
  return after.filter((due) => !known.has(keyOf(due)))
}

/** Ce qui devient à renseigner ou en retard, et n'était ni l'un ni l'autre avant le geste. */
export function revealedDues(
  before: PastSchedule,
  after: PastSchedule,
  today: string,
): RevealedDues {
  const past = [...before.unloggedDoses, ...overdueOf(before, today)]
  return {
    unlogged: added(past, after.unloggedDoses),
    overdue: added(past, overdueOf(after, today)),
  }
}

function datesOf(dues: readonly Due[]): string {
  return formatDaySeries([...new Set(dues.map(({ dueOn }) => dueOn))].sort())
}

/** `help` : l'aide sous la case, avant l'enregistrement ; `toast` : après. */
export function revealedDuesText(
  t: Translate,
  { unlogged, overdue }: RevealedDues,
  tense: 'help' | 'toast',
): string | null {
  const key = (part: string) => `treatments.shift.revealed.${tense}.${part}`
  const late = { dates: datesOf(overdue) }
  if (unlogged.length === 0) {
    return overdue.length === 0 ? null : t(key('overdue'), late, overdue.length)
  }
  const toLog = { dates: datesOf(unlogged) }
  if (overdue.length === 0) return t(key('unlogged'), toLog, unlogged.length)
  const first = t(key('unloggedThen'), toLog, unlogged.length)
  return `${first} ${t(key('thenOverdue'), late, overdue.length)}`
}
