import { episodeCalendar, type EpisodeCalendar, type Slot } from './calendar'
import { dayOfKey, hoursOf, keyOf, later, longestStep, plusDays, stepped } from './grid'
import { episodeLines, isNote } from './lines'
import { momentOf } from './moment'
import { dueReminders, type DueReminder, type ReminderWindow } from './reminders'
import { borrowedNotes, closedBeforeFirstDue, episodesOf, spanOf } from './settings'
import type {
  Day,
  Due,
  DueState,
  Hour,
  Line,
  LineEffect,
  Phase,
  Setting,
  TreatmentViewInput,
} from './types'

/** Une ligne de l'historique, avec ou sans effet (R11). */
export type HistoryLine = { line: Line; effect: LineEffect }

/** Une échéance du calendrier, son état, et la prise qui la couvre. */
export type DueSlot = { due: Due; state: DueState; by: Line | null }

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
  /** Toutes les échéances du calendrier de `from` à `to` inclus, notées ou non. */
  slots(from: Day, to: Day): DueSlot[]
  /** TR-21, Q33 : le jour où cette échéance a déjà été notée, `null` si elle ne l'est pas. */
  alreadyNotedOn(due: Pick<Due, 'dueOn' | 'dueTime'>, today: Day): Day | null
  /** R5 : premier jour où une prise couvre encore cette échéance ; `null` : pas de borne. */
  extraBoundary(due: Due): Day | null
  currentSetting: Setting | null
  settingAt(day: Day): Setting | undefined
  /** RA-1 à RA-6 : les rappels des échéances encore à donner, la lecture unique des rappels. */
  reminders(window: ReminderWindow): DueReminder[]
  /**
   * RA-19 : l'échéance est donnée, oubliée ou couverte, ou sortie du calendrier avec une prise écrite
   * pour elle ; `dueTime` `null` : une échéance de sa journée.
   */
  isNoted(dueOn: Day, dueTime: Hour): boolean
}

const UPCOMING_DAYS = 400

const lineOrder = (a: Line, b: Line) =>
  keyOf(a.dueOn, a.dueTime).localeCompare(keyOf(b.dueOn, b.dueTime)) ||
  a.updatedAt.localeCompare(b.updatedAt) ||
  a.id.localeCompare(b.id)

// R1, R4, R8 : les échéances que les reprises lisent le jour de l'arrêt, une seule fois chacune.
function readOn(later: readonly EpisodeCalendar[], day: Day | null): Set<string> {
  if (day === null) return new Set()
  return new Set(
    later.flatMap(({ slots, effects }) => [
      ...slots.filter(({ due }) => due.dueOn === day).map(({ key }) => key),
      ...[...effects.values()].flatMap((effect) =>
        effect.kind === 'covers' && dayOfKey(effect.key) === day ? [effect.key] : [],
      ),
    ]),
  )
}

export function buildView({ settings, lines, today }: TreatmentViewInput): TreatmentView {
  const byId = new Map(settings.map((setting) => [setting.id, setting]))
  const settingOf = (id: string) => byId.get(id)!
  const episodes = episodesOf(settings)
  const parts = episodes.map((episode, index) => {
    const span = spanOf(episode, lines)
    const own = episodeLines(lines, span)
    return { episode, lines: own, span, borrowed: borrowedNotes(episodes, index, lines) }
  })
  const step = Math.max(0, ...settings.map(({ frequency }) => longestStep(frequency)))
  const settingDays = settings.flatMap(({ startsOn, firstDueOn }) => [startsOn, firstDueOn])
  const lineDays = lines.flatMap(({ dueOn, targetOn }) => [dueOn, targetOn ?? dueOn])
  const latest = (known: Day[]) => [today, ...known, ...lineDays].sort().at(-1)!
  const lastKnownDay = latest(settingDays)
  const horizon = plusDays(today, UPCOMING_DAYS)
  const base = plusDays(lastKnownDay, 2 * step)
  const build = (reach: Day) => {
    const built: EpisodeCalendar[] = []
    for (const part of [...parts].reverse()) {
      const yielded = readOn(built, part.span.live.at(-1)!.stoppedOn)
      built.unshift(episodeCalendar({ ...part, settingOf, reach, yielded }))
    }
    return built
  }
  const currentSetting = episodes.at(-1)?.at(-1) ?? null
  const currentStep = currentSetting === null ? 0 : longestStep(currentSetting.frequency)
  // Dérouler la grille jusqu'à un réglage lointain coûte cher : seulement quand le moment en dépend.
  const read = (reach: Day) => {
    const calendars = build(reach)
    const moment = momentOf(calendars, currentSetting ?? undefined, today)
    const settled =
      !calendars.some(({ reachTooShort }) => reachTooShort) &&
      (moment.phase === 'stopped' || moment.open.some(({ due }) => due.dueOn > today))
    return { reach, calendars, moment, settled }
  }
  const near = read(plusDays(latest(settingDays.filter((day) => day <= horizon)), 2 * step))
  const { reach, calendars, moment } = near.settled || near.reach === base ? near : read(base)
  let widest = { reach, calendars }
  const calendarsUntil = (day: Day): EpisodeCalendar[] => {
    if (day > widest.reach) {
      const reach = plusDays(day, UPCOMING_DAYS)
      widest = { reach, calendars: build(reach) }
    }
    return widest.calendars
  }
  const closed = moment.phase === 'stopped' || moment.phase === 'ended'
  const end = currentSetting?.endsOn ?? currentSetting?.stoppedOn ?? null
  const lastDueDayUntil = (end: Day): Day | null => {
    const { lastGridDay = null, lastPossibleDay = null } = calendars.at(-1) ?? {}
    if (lastGridDay !== null && lastGridDay > reach) return lastGridDay
    return (
      calendarsUntil(lastPossibleDay ?? end)
        .at(-1)
        ?.slots.at(-1)?.due.dueOn ?? null
    )
  }
  const lastDueDay = end === null ? null : lastDueDayUntil(end)
  // R8, #819 : une prise d'avant l'arrêt qui couvre sa dose y reste comptée, même si elle couvre
  // aussi la première journée de la reprise, sauf quand la reprise reprend cette dose.
  const effects = new Map<string, LineEffect>()
  for (const [id, effect] of calendars.flatMap((calendar) => [...calendar.effects])) {
    if (effects.get(id)?.kind !== 'covers') effects.set(id, effect)
  }
  const live = parts.flatMap(({ span }) => span.live)
  const slotOf = (key: string): Slot | undefined =>
    calendarsUntil(key.slice(0, 10))
      .flatMap(({ slots }) => slots)
      .filter((slot) => slot.key === key)
      .at(-1)

  const stateOf = (slot: Slot): DueState => {
    if (slot.coveredBy === null) return 'pending'
    return slot.exact ? (slot.coveredBy.status as 'given' | 'missed') : 'covered'
  }
  const dueState = ({ dueOn, dueTime }: Pick<Due, 'dueOn' | 'dueTime'>): DueState => {
    const key = keyOf(dueOn, dueTime)
    const slot = slotOf(key)
    if (slot === undefined) {
      return calendarsUntil(dueOn).some(({ moved }) => moved.has(key)) ? 'moved' : 'removed'
    }
    return stateOf(slot)
  }

  const pendingBetween = (from: Day, to: Day): Due[] => {
    const calendar = calendarsUntil(to).at(-1)!
    return calendar.slots
      .filter(
        ({ coveredBy, due }) =>
          coveredBy === null &&
          due.dueOn >= calendar.rhythmFrom &&
          due.dueOn >= from &&
          due.dueOn <= to,
      )
      .map(({ due }) => due)
  }
  const upcoming: TreatmentView['upcoming'] = ({
    from = today,
    to = plusDays(from, UPCOMING_DAYS),
    limit,
  } = {}) => {
    if (closed) return []
    if (limit === undefined) return pendingBetween(from, to)
    const near = plusDays(from, UPCOMING_DAYS)
    const first = near < to ? pendingBetween(from, near) : []
    return (first.length >= limit ? first : pendingBetween(from, to)).slice(0, limit)
  }
  const settingAt = (day: Day) => live.filter(({ startsOn }) => startsOn <= day).at(-1)
  const slots: TreatmentView['slots'] = (from, to) => {
    const byKey = new Map<string, Slot>()
    for (const slot of calendarsUntil(to).flatMap(({ slots }) => slots)) {
      if (slot.due.dueOn >= from && slot.due.dueOn <= to) byKey.set(slot.key, slot)
    }
    return [...byKey.values()]
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((slot) => ({ due: slot.due, state: stateOf(slot), by: slot.coveredBy }))
  }
  const currentDoses = moment.current.map(({ due }) => due)
  const unloggedDoses = moment.unlogged.map(({ due }) => due)

  return {
    phase: moment.phase,
    finished: moment.finished,
    stoppedBeforeFirstDose:
      moment.phase === 'stopped' &&
      moment.unlogged.length === 0 &&
      closedBeforeFirstDue(settings) &&
      !lines.some((line) => isNote(line) || line.status === 'extra'),
    endedOn:
      moment.phase === 'stopped'
        ? (currentSetting?.stoppedOn ?? null)
        : moment.phase !== 'ended' || currentSetting === null
          ? null
          : currentSetting.endsOn !== null && currentSetting.endsOn <= today
            ? currentSetting.endsOn
            : (calendars.at(-1)?.slots.at(-1)?.due.dueOn ?? null),
    currentDoses,
    unloggedDoses,
    nextDue: closed ? null : (moment.open.find(({ due }) => due.dueOn > today)?.due ?? null),
    upcoming,
    lastDueDay,
    history: [...lines].sort(lineOrder).map((line) => ({
      line,
      effect: effects.get(line.id) ?? {
        kind: 'idle',
        reason: byId.has(line.settingId) ? 'outside' : 'unknown-setting',
      },
    })),
    dueState,
    slots,
    alreadyNotedOn: (due, day) => {
      const slot = slotOf(keyOf(due.dueOn, due.dueTime))
      const by = slot?.coveredBy ?? null
      if (by !== null) return by.status === 'given' ? (by.givenOn ?? day) : null
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
    settingAt,
    reminders: (window) =>
      dueReminders(
        {
          phase: moment.phase,
          lastDueDay,
          currentDoses,
          unloggedDoses,
          currentSetting,
          settingAt,
          calendarDues: (from, to) => slots(from, to).map(({ due }) => due),
          upcomingUntil: (limit) =>
            upcoming({ limit, to: plusDays(lastKnownDay, (limit + 2) * currentStep) }),
        },
        window,
      ),
    isNoted: (dueOn, dueTime) => {
      const matches = (hour: Hour) => dueTime === null || hour === dueTime
      const ofDay = slots(dueOn, dueOn).filter(({ due }) => matches(due.dueTime))
      if (ofDay.length > 0) return ofDay.some(({ state }) => state !== 'pending')
      return lines.some((line) => isNote(line) && line.dueOn === dueOn && matches(line.dueTime))
    },
  }
}
