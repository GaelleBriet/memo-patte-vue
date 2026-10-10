import type { EpisodeCalendar, Slot } from './calendar'
import { plusDays } from './grid'
import type { Day, Phase, Setting } from './types'

export type Moment = {
  phase: Phase
  /** Fini ou arrêté sans rien à renseigner ; vrai aussi sans réglage. */
  finished: boolean
  /** TR-10, Q23 : les heures sans prise de la dernière journée arrivée, sinon la prochaine échéance. */
  current: Slot[]
  /** TR-13 : échéances passées sans prise qui ne sont plus la dose du moment. */
  unlogged: Slot[]
  /** Échéances sans prise du réglage en cours ; vide une fois le traitement fini ou arrêté. */
  open: Slot[]
}

const byKey = (a: Slot, b: Slot) => a.key.localeCompare(b.key)
const pendingOf = ({ slots }: EpisodeCalendar) =>
  slots.filter(({ coveredBy }) => coveredBy === null)

/**
 * TR-10 à TR-13 : la dose du moment se lit par journée ; une échéance du jour le reste jusqu'à
 * minuit (TR-11) ; arrêté ou date de fin passée, tout ce qui reste passé est à renseigner.
 */
export function momentOf(
  calendars: readonly EpisodeCalendar[],
  setting: Setting | undefined,
  today: Day,
): Moment {
  const yesterday = plusDays(today, -1)
  const last = calendars.at(-1)
  const unlogged = calendars
    .slice(0, -1)
    .flatMap(pendingOf)
    .filter(({ due }) => due.dueOn <= yesterday)
  if (last === undefined || setting === undefined) {
    return { phase: 'ended', finished: unlogged.length === 0, current: [], unlogged, open: [] }
  }
  const pending = pendingOf(last)
  unlogged.push(
    ...pending.filter(({ due }) => due.dueOn < setting.startsOn && due.dueOn <= yesterday),
  )
  const own = pending.filter(({ due }) => due.dueOn >= setting.startsOn)
  const closed = (phase: Phase, missed: Slot[]): Moment => {
    const all = [...unlogged, ...missed].sort(byKey)
    return { phase, finished: all.length === 0, current: [], unlogged: all, open: [] }
  }
  if (setting.stoppedOn !== null) {
    return closed(
      'stopped',
      own.filter(({ due }) => due.dueOn <= yesterday),
    )
  }
  if (setting.endsOn !== null && setting.endsOn < today) return closed('ended', own)

  const lastDay = [...last.fallen]
    .filter((day) => day >= setting.startsOn && day <= today)
    .sort()
    .at(-1)
  const ofLastDay = own.filter(({ due }) => due.dueOn === lastDay)
  const coming = own.find(({ due }) => due.dueOn > today)
  const current = ofLastDay.length > 0 ? ofLastDay : coming === undefined ? [] : [coming]
  const day = current[0]?.due.dueOn
  const phase: Phase =
    day === undefined ? 'ended' : day === today ? 'today' : day < today ? 'overdue' : 'upcoming'
  const missed = own.filter((slot) => slot.due.dueOn <= today && !current.includes(slot))
  return {
    phase,
    finished: phase === 'ended' && unlogged.length + missed.length === 0,
    current,
    unlogged: [...unlogged, ...missed].sort(byKey),
    open: own,
  }
}
