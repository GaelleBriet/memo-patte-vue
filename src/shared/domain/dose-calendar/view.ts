import { episodeCalendar, type EpisodeCalendar, type Slot } from './calendar'
import { hoursOf, keyOf, later, longestStep, plusDays, stepped } from './grid'
import { episodeLines, isNote } from './lines'
import { momentOf } from './moment'
import { borrowedNotes, episodesOf, spanOf } from './settings'
import type {
  Day,
  Due,
  DueState,
  Line,
  LineEffect,
  Phase,
  Setting,
  TreatmentViewInput,
} from './types'

/** Une ligne de l'historique, avec ou sans effet (R11). */
export type HistoryLine = { line: Line; effect: LineEffect }

/** Fenêtre des échéances à venir : `from` aujourd'hui par défaut, `to` 400 jours plus loin. */
export type Window = { from?: Day; to?: Day; limit?: number }

/** R12 : la lecture unique d'un traitement, la même pour tous les écrans. */
export type TreatmentView = {
  phase: Phase
  finished: boolean
  /** TR-30 : arrêté avant toute échéance, sans aucune prise sur tout le traitement. */
  stoppedBeforeFirstDose: boolean
  /** Arrêté : le jour de l'arrêt ; fini : la date de fin atteinte, sinon la dernière échéance. */
  endedOn: Day | null
  currentDoses: Due[]
  unloggedDoses: Due[]
  /** Première échéance sans prise après aujourd'hui, tant que le traitement est en cours. */
  nextDue: Due | null
  upcoming(window?: Window): Due[]
  /** Dernière journée d'échéance, notée ou non ; `null` pour un traitement sans fin. */
  lastDueDay: Day | null
  history: HistoryLine[]
  dueState(due: Pick<Due, 'dueOn' | 'dueTime'>): DueState
  /** TR-21, Q33 : le jour où cette échéance a déjà été notée, `null` si elle ne l'est pas. */
  alreadyNotedOn(due: Pick<Due, 'dueOn' | 'dueTime'>, today: Day): Day | null
  /** R5 : premier jour où une prise couvre encore cette échéance ; `null` : pas de borne. */
  extraBoundary(due: Due): Day | null
  currentSetting: Setting | null
  settingAt(day: Day): Setting | undefined
}

const UPCOMING_DAYS = 400

const lineOrder = (a: Line, b: Line) =>
  keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)) ||
  a.updatedAt.localeCompare(b.updatedAt) ||
  a.id.localeCompare(b.id)

export function buildView({ settings, lines, today }: TreatmentViewInput): TreatmentView {
  const byId = new Map(settings.map((setting) => [setting.id, setting]))
  const settingOf = (id: string) => byId.get(id)!
  const episodes = episodesOf(settings)
  const parts = episodes.map((episode, index) => {
    const own = episodeLines(lines, new Set(episode.map(({ id }) => id)))
    const borrowed = borrowedNotes(episodes, index, lines)
    return { episode, lines: own, span: spanOf(episode, own.kept), borrowed }
  })
  const step = Math.max(0, ...settings.map(({ frequency }) => longestStep(frequency)))
  const lastKnownDay = [
    today,
    ...settings.flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn]),
    ...lines.flatMap(({ dueOn, targetOn }) => [dueOn, targetOn ?? dueOn]),
  ]
    .sort()
    .at(-1)!
  const base = plusDays(lastKnownDay, 2 * step)
  const built = new Map<Day, EpisodeCalendar[]>()
  const calendarsUntil = (day: Day): EpisodeCalendar[] => {
    const reach = later(base, day)
    const known = built.get(reach)
    if (known !== undefined) return known
    const calendars = parts.map((part) => episodeCalendar({ ...part, settingOf, reach }))
    built.set(reach, calendars)
    return calendars
  }
  const calendars = calendarsUntil(base)
  const currentSetting = episodes.at(-1)?.at(-1) ?? null
  const moment = momentOf(calendars, currentSetting ?? undefined, today)
  const closed = moment.phase === 'stopped' || moment.phase === 'ended'
  const end = currentSetting?.endsOn ?? currentSetting?.stoppedOn ?? null
  const lastSlots = end === null ? [] : (calendarsUntil(end).at(-1)?.slots ?? [])
  const lastDueDay = lastSlots.at(-1)?.due.dueOn ?? null
  const effects = new Map(calendars.flatMap(({ effects }) => [...effects]))
  const live = parts.flatMap(({ span }) => span.live)
  const slotOf = (key: string): Slot | undefined =>
    calendarsUntil(key.slice(0, 10))
      .flatMap(({ slots }) => slots)
      .filter((slot) => slot.key === key)
      .at(-1)

  const dueState = ({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): DueState => {
    const key = keyOf(dueOn, dueTime)
    const slot = slotOf(key)
    if (slot === undefined) {
      return calendarsUntil(dueOn).some(({ moved }) => moved.has(key)) ? 'moved' : 'removed'
    }
    if (slot.coveredBy === null) return 'pending'
    return slot.exact ? (slot.coveredBy.status as 'given' | 'missed') : 'covered'
  }

  return {
    phase: moment.phase,
    finished: moment.finished,
    stoppedBeforeFirstDose:
      moment.phase === 'stopped' &&
      calendars.every(({ slots }) => slots.length === 0) &&
      !lines.some((line) => isNote(line) || line.status === 'extra'),
    endedOn:
      moment.phase === 'stopped'
        ? (currentSetting?.stoppedOn ?? null)
        : moment.phase !== 'ended' || currentSetting === null
          ? null
          : currentSetting.endsOn !== null && currentSetting.endsOn <= today
            ? currentSetting.endsOn
            : (calendars.at(-1)?.slots.at(-1)?.due.dueOn ?? null),
    currentDoses: moment.current.map(({ due }) => due),
    unloggedDoses: moment.unlogged.map(({ due }) => due),
    nextDue: closed ? null : (moment.open.find(({ due }) => due.dueOn > today)?.due ?? null),
    upcoming: ({ from = today, to = plusDays(from, UPCOMING_DAYS), limit } = {}) => {
      if (closed) return []
      const setting = currentSetting!
      const dues = calendarsUntil(to)
        .at(-1)!
        .slots.filter(
          ({ coveredBy, due }) =>
            coveredBy === null &&
            due.dueOn >= setting.startsOn &&
            due.dueOn >= from &&
            due.dueOn <= to,
        )
        .map(({ due }) => due)
      return limit === undefined ? dues : dues.slice(0, limit)
    },
    lastDueDay,
    history: [...lines].sort(lineOrder).map((line) => ({
      line,
      effect: effects.get(line.id) ?? {
        kind: 'idle',
        reason: byId.has(line.settingId) ? 'outside' : 'unknown-setting',
      },
    })),
    dueState,
    alreadyNotedOn: (due, day) => {
      const slot = slotOf(keyOf(due.dueOn, due.dueTime))
      const by = slot?.coveredBy ?? null
      if (by !== null) return by.givenOn ?? day
      const extra = lines.some(
        (line) =>
          line.status === 'extra' &&
          line.dueOn === day &&
          line.dueTime === due.dueTime &&
          effects.get(line.id)?.kind === 'extra',
      )
      return extra ? day : null
    },
    extraBoundary: (due) => {
      const setting = byId.get(due.settingId)
      if (setting === undefined || hoursOf(setting.times).length > 1) return null
      let day = stepped(due.dueOn, setting.frequency, -1)
      while (stepped(day, setting.frequency, 1) <= due.dueOn) day = plusDays(day, 1)
      const start = settings.map(({ startsOn }) => startsOn).sort()[0]!
      return later(day, start)
    },
    currentSetting,
    settingAt: (day) => live.filter(({ startsOn }) => startsOn <= day).at(-1),
  }
}
