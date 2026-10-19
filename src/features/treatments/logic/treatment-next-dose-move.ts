import { keepsShift } from './treatment-dose-change'
import type {
  EditionResolution,
  NextDoseChoice,
  NextDoseHelp,
} from './treatment-edition-resolution'
import type { TreatmentPeriodRecord } from '../schema/treatment-period.schema'
import type { TreatmentRhythm } from '../schema/treatment-form.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { isCalendarDay } from '@/shared/domain/calendar-day'
import {
  moveBounds,
  play,
  type Due,
  type GestureOutcome,
  type Line,
  type Refusal,
  type TreatmentView,
} from '@/shared/domain/dose-calendar'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

/** Le report en vigueur qui amène une dose le jour `day`. */
export function reportArrivingOn(
  view: Pick<TreatmentView, 'history'>,
  day: string,
): Line | undefined {
  return view.history.find(
    ({ line, effect }) =>
      line.status === 'postponed' && effect.kind === 'moves' && effect.arrival === day,
  )?.line
}

/** Le réglage en cours a déjà une prise ou un report : « Prochaine dose » déplace alors la dose, elle ne corrige plus la première échéance. */
export function hasDoseLine(view: Pick<TreatmentView, 'history'>, settingId: string): boolean {
  return view.history.some(
    ({ line }) =>
      line.settingId === settingId &&
      (line.status === 'given' || line.status === 'missed' || line.status === 'postponed'),
  )
}

type Moved = {
  period: TreatmentPeriodRecord
  treatment: TreatmentWithPeriods
  reading: TreatmentReading
  due: Due
  next: Pick<TreatmentRhythm, 'endsOn'>
  choice: NextDoseChoice
  today: string
}

const isRefused = (result: object): result is { refusal: Refusal } => 'refusal' in result

const movesALine = ({ changes }: GestureOutcome): boolean =>
  changes.some((change) => change.action !== 'delete' && change.line.status === 'postponed')

/** TR-9 : seule la date de « Prochaine dose » change, la dose du moment est déplacée (R7, Q17, Q18, Q21). */
export function resolveMoved({
  period,
  treatment,
  reading,
  due,
  next,
  choice: { chosenOn, shiftsFollowing },
  today,
}: Moved): EditionResolution {
  const { input, view } = reading
  const full = moveBounds(input, due, true)
  const alone = moveBounds(input, due, false)
  const fieldRefusal = isRefused(full) && isRefused(alone) ? full.refusal : null
  const onlyAlone = isRefused(full) && !isRefused(alone)
  const bounds = isRefused(full) ? alone : full
  const aloneBounds = shiftsFollowing || isRefused(alone) ? null : alone
  const latest = aloneBounds?.latest ?? next.endsOn
  const typed =
    chosenOn !== null && isCalendarDay(chosenOn) && chosenOn !== due.dueOn ? chosenOn : null
  const gesture = (to: string, shifts: boolean) =>
    play(input, { kind: 'move', due, to, shiftsFollowing: shifts })
  const played = typed === null || fieldRefusal !== null ? null : gesture(typed, shiftsFollowing)
  const offered = [true, false].some((shifts) => {
    const result = typed === null || isRefused(alone) ? null : gesture(typed, shifts)
    return result !== null && !isRefused(result) && movesALine(result)
  })
  const report = reportArrivingOn(view, due.dueOn)
  const refusal =
    typed !== null && fieldRefusal !== null
      ? fieldRefusal
      : played !== null && isRefused(played)
        ? played.refusal
        : null
  const help: NextDoseHelp | null =
    fieldRefusal !== null
      ? { kind: 'refused', refusal: fieldRefusal }
      : due.dueOn < today
        ? { kind: 'overdue', since: due.dueOn }
        : { kind: 'calculated', on: report?.dueOn ?? due.dueOn }
  return {
    period,
    change: 'edit',
    nextDose: {
      change: 'move',
      proposedOn: due.dueOn,
      earliest: isRefused(bounds) ? today : bounds.earliest,
      latest,
      refusal: fieldRefusal,
      help,
      shift:
        typed !== null && offered
          ? { due, chosenOn: typed, carnet: { treatment, reading, today } }
          : null,
      shiftInitial: !onlyAlone && (report === undefined || keepsShift(reading, report)),
    },
    plan: null,
    move: played === null || isRefused(played) ? null : played,
    refusal,
    pastDues: [],
    pastDuesNextDose: null,
  }
}
