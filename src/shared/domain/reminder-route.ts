import type {
  LocationQuery,
  LocationQueryRaw,
  RouteLocationNormalizedLoaded,
  RouteLocationRaw,
} from 'vue-router'

import { isClockTime } from './clock-time'
import type { ReminderKind } from './reminders'

/** Rappel de l'écran d'origine : sa feuille se rouvre sur l'accueil, son détail se retrouve sur le Carnet. */
export const REMINDER_QUERY_PARAM = 'reminder'

export const DETAIL_ROUTES: Readonly<Record<ReminderKind, string>> = {
  vaccination: 'vaccination-detail',
  treatment: 'treatment-detail',
}

export type ReminderRef = { kind: ReminderKind; id: string }

export function reminderQueryValue({ kind, id }: ReminderRef): string {
  return `${kind}:${id}`
}

const TODO_REMINDER =
  /^(vaccination|treatment):([^:]+)(?::(unlogged|\d{4}-\d{2}-\d{2})(?:T(.+))?)?$/

function parseTodoReminder(value: unknown): TodoRequest | null {
  if (typeof value !== 'string') return null
  const [, kind, id, day, time] = TODO_REMINDER.exec(value) ?? []
  if ((kind !== 'vaccination' && kind !== 'treatment') || id === undefined) return null
  if (day === undefined) return { kind, id, due: null }
  if (day === 'unlogged') return time === undefined ? { kind, id, due: 'unlogged' } : null
  if (time !== undefined && !isClockTime(time)) return null
  return { kind, id, due: { dueOn: day, dueTime: time ?? null } }
}

export function parseReminderQuery(value: unknown): ReminderRef | null {
  const request = parseTodoReminder(value)
  return request === null ? null : { kind: request.kind, id: request.id }
}

/** Le rappel et l'échéance de sa ligne : la feuille se rouvre sur elle au retour de « Modifier ». */
export function todoReminderValue({ due, ...ref }: TodoRequest): string {
  if (due === null) return reminderQueryValue(ref)
  if (due === 'unlogged') return `${reminderQueryValue(ref)}:unlogged`
  const time = due.dueTime === null ? '' : `T${due.dueTime}`
  return `${reminderQueryValue(ref)}:${due.dueOn}${time}`
}

/** Étape à laquelle la feuille s'ouvre : ses actions, ou « Fait » (F5) pour un vaccin. */
export const REMINDER_STEP_QUERY_PARAM = 'step'

const DUE_QUERY_PARAM = 'due'
const TIME_QUERY_PARAM = 'time'
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/

export type ReminderStep = 'actions' | 'done'

/** L'échéance d'une notification ; `dueTime` à `null` : sans heure, ou toute la journée (relance). */
export type NotifiedDue = { dueOn: string; dueTime: string | null }

/**
 * `given-when` : « Donnée quand ? » d'une notification d'un jour passé (V5) ; sinon `due`, l'échéance
 * de la ligne de « À faire » dont la feuille se rouvre.
 */
export type ReminderRequest = ReminderRef &
  ({ step: ReminderStep; due?: TodoDue } | { step: 'given-when'; due: NotifiedDue })

export function reminderSheetQuery(request: ReminderRequest): LocationQueryRaw {
  const query: LocationQueryRaw = {
    [REMINDER_QUERY_PARAM]: reminderQueryValue(request),
    [REMINDER_STEP_QUERY_PARAM]: request.step,
  }
  if (request.step !== 'given-when') return query
  const { dueOn, dueTime } = request.due
  return {
    ...query,
    [DUE_QUERY_PARAM]: dueOn,
    ...(dueTime === null ? {} : { [TIME_QUERY_PARAM]: dueTime }),
  }
}

function notifiedDueOf(query: LocationQuery | LocationQueryRaw): NotifiedDue | null {
  const dueOn = query[DUE_QUERY_PARAM]
  const dueTime = query[TIME_QUERY_PARAM] ?? null
  if (typeof dueOn !== 'string' || !ISO_DAY.test(dueOn)) return null
  if (dueTime !== null && !isClockTime(dueTime)) return null
  return { dueOn, dueTime }
}

export function parseReminderRequest(
  query: LocationQuery | LocationQueryRaw,
): ReminderRequest | null {
  const todo = parseTodoReminder(query[REMINDER_QUERY_PARAM])
  if (todo === null) return null
  const { due: rowDue, ...ref } = todo
  const step = query[REMINDER_STEP_QUERY_PARAM]
  const due = step === 'given-when' ? notifiedDueOf(query) : null
  if (due !== null) return { ...ref, step: 'given-when', due }
  const request = { ...ref, step: step === 'done' ? ('done' as const) : ('actions' as const) }
  return rowDue === null ? request : { ...request, due: rowDue }
}

export function withoutReminderRequest(query: LocationQuery): LocationQuery {
  const {
    [REMINDER_QUERY_PARAM]: _reminder,
    [REMINDER_STEP_QUERY_PARAM]: _step,
    [DUE_QUERY_PARAM]: _due,
    [TIME_QUERY_PARAM]: _time,
    ...rest
  } = query
  return rest
}

export function detailRoute({ kind, id }: ReminderRef): RouteLocationRaw {
  return { name: DETAIL_ROUTES[kind], params: { id } }
}

/** Le détail que désignent une origine et son rappel, `null` si ce n'en est pas un. */
export function detailOrigin(from: unknown, reminder: unknown): ReminderRef | null {
  const ref = parseReminderQuery(reminder)
  return ref !== null && DETAIL_ROUTES[ref.kind] === from ? ref : null
}

/** L'écran courant comme origine d'un écran poussé : son nom, et son rappel s'il est un détail. */
export function originQuery(route: Pick<RouteLocationNormalizedLoaded, 'name' | 'params'>): {
  from: string
  reminder?: string
} {
  const from = String(route.name ?? '')
  const id = route.params.id
  const kind = (Object.keys(DETAIL_ROUTES) as ReminderKind[]).find(
    (candidate) => DETAIL_ROUTES[candidate] === from,
  )
  return kind && typeof id === 'string'
    ? { from, reminder: reminderQueryValue({ kind, id }) }
    : { from }
}

/** L'échéance que vise une ligne de « À faire » : une dose (jour, heure), ou les doses non renseignées. */
export type TodoDue = NotifiedDue | 'unlogged'

/** Ce que la feuille d'un soin reçoit d'une ligne de « À faire » ; `due` à `null` pour un vaccin. */
export type TodoRequest = ReminderRef & { due: TodoDue | null }
