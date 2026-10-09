import {
  hasNote,
  overdueHelp,
  type EditionResolution,
  type NextDoseChoice,
  type NextDoseHelp,
  type NextDoseShift,
} from './treatment-edition-resolution'
import { treatmentScheduleOf } from './treatment-schedule-adapter'
import { lostDays, pendingDaysAfter } from './treatment-shift-box'
import type {
  TreatmentPeriodRecord,
  TreatmentPeriodSettings,
} from '../schema/treatment-period.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import type { Due, MovedDose, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

export function moveArrivingOn(schedule: TreatmentSchedule, due: Due) {
  return schedule.doses.find(
    (dose) =>
      dose.status === 'postponed' &&
      dose.periodId === due.periodId &&
      dose.nextDueDate === due.dueOn,
  )
}

function dosesWith(history: TreatmentWithHistory, { report, shift }: MovedDose, today: string) {
  const at = `${today}T23:59:59.999Z`
  const owner = { treatmentId: history.id, animalId: history.animalId, deletedAt: null }
  return [report, shift].reduce((doses, change, index) => {
    switch (change.action) {
      case 'none':
        return doses
      case 'delete':
        return doses.filter(({ id }) => id !== change.doseId)
      case 'rewrite':
        return doses.map((dose) =>
          dose.id === change.doseId ? { ...dose, ...change.dose, updatedAt: at } : dose,
        )
      case 'create':
        return [
          ...doses,
          { ...change.dose, ...owner, id: `apercu-${index}`, createdAt: at, updatedAt: at },
        ]
    }
  }, history.doses)
}

// La case n'apparaît que si la dose change vraiment de date et peut aller seule (Q2 a).
function shiftOf(
  book: TreatmentWithHistory,
  schedule: TreatmentSchedule,
  due: Due,
  chosenOn: string,
  today: string,
): NextDoseShift | null {
  const period = book.periods.find(({ id }) => id === due.periodId)
  const alone = schedule.moveBounds(due, false)
  if (period === undefined || alone === null) return null
  const checked = schedule.move(due, chosenOn, true)
  if (checked.report.action !== 'create' && checked.report.action !== 'rewrite') return null
  const followingWith = (moved: MovedDose) =>
    pendingDaysAfter(
      treatmentScheduleOf({ ...book, doses: dosesWith(book, moved, today) }, today),
      period,
      chosenOn,
    )
  const following = followingWith(checked)
  const fitsAlone = alone.latest === null || chosenOn <= alone.latest
  const followingAlone = fitsAlone ? followingWith(schedule.move(due, chosenOn, false)) : []
  const before = pendingDaysAfter(schedule, period, due.dueOn)
  return {
    following,
    followingAlone,
    lost: lostDays(before, following, period),
    aloneLatest: alone.latest,
  }
}

export function resolveMoved(
  period: TreatmentPeriodRecord,
  book: TreatmentWithHistory,
  schedule: TreatmentSchedule,
  due: Due,
  settings: TreatmentPeriodSettings,
  { chosenOn, shiftsFollowing }: NextDoseChoice,
  today: string,
): EditionResolution {
  const bounds = schedule.moveBounds(due)
  const refusal = schedule.moveRefusal(due)
  const alone = shiftsFollowing ? null : schedule.moveBounds(due, false)
  const latest = alone?.latest ?? settings.endsOn
  const line = moveArrivingOn(schedule, due)
  const inBounds =
    bounds !== null &&
    chosenOn !== null &&
    chosenOn !== due.dueOn &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (latest === null || chosenOn <= latest)
  const shift =
    bounds !== null &&
    chosenOn !== null &&
    chosenOn !== due.dueOn &&
    isCalendarDay(chosenOn) &&
    chosenOn >= bounds.earliest &&
    (settings.endsOn === null || chosenOn <= settings.endsOn)
      ? shiftOf(book, schedule, due, chosenOn, today)
      : null
  const calculated: NextDoseHelp | null = hasNote(schedule, period.id)
    ? { kind: 'calculated', on: line?.dueOn ?? due.dueOn }
    : null
  return {
    period,
    change: 'correct',
    proposesFirstDue: false,
    movedLineId: line?.id ?? null,
    nextDose: {
      change: 'move',
      proposedOn: due.dueOn,
      earliest: bounds?.earliest ?? today,
      latest,
      refusal,
      help:
        refusal !== null ? { kind: 'refused', refusal } : (overdueHelp(due, today) ?? calculated),
      shift,
      shiftInitial:
        line === undefined ||
        schedule.doses.some(
          (dose) =>
            dose.status === 'shift' && dose.periodId === line.periodId && dose.dueOn === line.dueOn,
        ),
    },
    settings,
    referenceOn: period.referenceOn,
    move: inBounds ? schedule.move(due, chosenOn, shiftsFollowing) : null,
  }
}
