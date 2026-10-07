import type { TodoDueItem, TodoItem } from './todo-items'
import type { DueStatus } from '@/shared/components/DueStatusChip.vue'
import {
  todoReminderValue,
  type ReminderRef,
  type TodoDue,
  type TodoRequest,
} from '@/shared/domain/reminder-route'
import { reminderIcon as sharedReminderIcon, type ReminderStatus } from '@/shared/domain/reminders'
import {
  formatClockTime,
  formatDayMonth,
  formatFullDayMonth,
  formatLongDate,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type ScopeCounterInput = {
  total: number
  animalName: string | null
}

export function scopeCounter(
  t: Translate,
  { total, animalName }: ScopeCounterInput,
): string | null {
  if (animalName === null) {
    return total === 0 ? null : t('home.todo.count', { n: total }, total)
  }
  if (total === 0) return animalName
  return t('home.todo.scoped', {
    name: animalName,
    count: t('home.todo.count', { n: total }, total),
  })
}

export function overdueBanner(t: Translate, overdue: number): string | null {
  if (overdue === 0) return null
  return t('home.todo.overdueBanner', { n: overdue }, overdue)
}

export type DueBadge = {
  text: string
  icon: string | null
  status: DueStatus
}

const DUE_ICONS: Record<ReminderStatus, string | null> = {
  overdue: null,
  today: 'ms:today',
  tomorrow: 'ms:schedule',
  later: 'ms:schedule',
}

function isPlanned(item: TodoDueItem): boolean {
  return item.firstVaccine && item.daysUntil > 0
}

/** « Aujourd’hui · 20 h » : une dose du jour garde son heure, même passée (TR-11). */
export function dueBadge(t: Translate, item: TodoItem): DueBadge {
  if (item.group === 'to-log') return { text: t('home.due.toLog'), icon: null, status: 'to-log' }
  if (item.group === 'unreadable') {
    return { text: t('home.due.unreadable'), icon: null, status: 'none' }
  }
  if (isPlanned(item)) {
    return {
      text: t('home.due.planned', { date: formatDayMonth(item.dueOn) }),
      icon: null,
      status: 'planned',
    }
  }
  const days = Math.abs(item.daysUntil)
  const text =
    item.status === 'today' && item.dueTime !== null
      ? t('home.due.todayAt', { time: formatClockTime(item.dueTime) })
      : t(`home.due.${item.status}`, { n: days }, days)
  return { text, icon: DUE_ICONS[item.status], status: item.status }
}

type Typed = Pick<TodoItem, 'kind' | 'treatmentType' | 'firstVaccine'>

type TypeKey = 'firstVaccine' | 'vaccination' | 'deworming' | 'antiparasitic' | 'medication'

function typeKey(source: Typed): TypeKey {
  if (source.firstVaccine) return 'firstVaccine'
  return source.kind === 'vaccination' ? 'vaccination' : (source.treatmentType ?? 'deworming')
}

/** « Vaccin », « Vermifuge », « Médicament » : le titre d'une ligne est le nom du produit. */
export function reminderType(t: Translate, source: Typed): string {
  return t(`home.reminder.${typeKey(source)}`)
}

export function reminderIcon(source: Typed): string {
  return sharedReminderIcon(source.kind, source.treatmentType)
}

function spokenDue(t: Translate, item: TodoDueItem): string {
  const days = Math.abs(item.daysUntil)
  if (isPlanned(item)) {
    return t('home.row.due.planned', { date: formatFullDayMonth(item.dueOn) })
  }
  if (item.status === 'today' && item.dueTime !== null) {
    return t('home.row.due.todayAt', { time: formatClockTime(item.dueTime) })
  }
  if (item.status === 'overdue' && item.dueTime !== null) {
    return t('home.row.due.overdueAt', { n: days, time: formatClockTime(item.dueTime) }, days)
  }
  if (item.status !== 'later') return t(`home.row.due.${item.status}`, { n: days }, days)
  return t('home.row.due.later', { n: days, date: formatFullDayMonth(item.dueOn) }, days)
}

export type UpToDateInput = {
  animalName: string | null
  allNames: string[]
}

export function upToDateText(t: Translate, { animalName, allNames }: UpToDateInput): string {
  if (animalName !== null) return t('home.upToDate.forAnimal', { name: animalName })
  const head = allNames.slice(0, -1).join(t('home.upToDate.namesSeparator'))
  const names = [head, allNames.at(-1)].join(t('home.upToDate.namesLast'))
  return t('home.upToDate.forMany', { names })
}

export type ReminderRow = {
  key: string
  /** `to-log` : sous l'intitulé « À renseigner », en fin de liste. */
  group: 'due' | 'to-log'
  /** Ce que la feuille reçoit : le soin et l'échéance de la ligne. */
  request: TodoRequest
  /** Une ligne illisible ouvre la fiche du traitement, pas sa feuille. */
  opens: 'sheet' | 'detail'
  tone: ReminderStatus | 'planned' | 'to-log' | 'unreadable'
  icon: string
  title: string
  /** « Vermifuge · Boree », même quand un seul animal est affiché (AC-8). */
  subtitle: string
  /** « 3 doses non renseignées », sous une ligne « À renseigner ». */
  unlogged: string | null
  badge: DueBadge
  /** Nom lu par le lecteur d'écran : produit, type, animal, échéance, puis ce que fait le tap. */
  ariaLabel: string
}

export type ReminderRowsOptions = {
  animalNames: ReadonlyMap<string, string>
  showAnimal: boolean
}

function requestOf(item: TodoItem): TodoRequest {
  const ref = { kind: item.kind, id: item.id }
  if (item.group === 'to-log') return { ...ref, due: 'unlogged' }
  if (item.group === 'unreadable' || item.kind === 'vaccination') return { ...ref, due: null }
  return { ...ref, due: { dueOn: item.dueOn, dueTime: item.dueTime } }
}

function toneOf(item: TodoItem): ReminderRow['tone'] {
  if (item.group !== 'due') return item.group
  return isPlanned(item) ? 'planned' : item.status
}

function unloggedText(t: Translate, item: TodoItem): string | null {
  if (item.group !== 'to-log') return null
  return t('home.row.unlogged', { n: item.unlogged }, item.unlogged)
}

function spokenState(t: Translate, item: TodoItem, unlogged: string | null): string {
  if (item.group === 'to-log') return t('home.row.due.toLog', { unlogged })
  if (item.group === 'unreadable') return t('home.row.due.unreadable')
  return spokenDue(t, item)
}

function ariaLabelOf(
  t: Translate,
  item: TodoItem,
  spoken: { title: string; type: string; animal: string | undefined; due: string },
): string {
  const single = spoken.animal === undefined
  if (item.group === 'unreadable') {
    return single
      ? t('home.row.labelUnreadableSingle', spoken)
      : t('home.row.labelUnreadable', spoken)
  }
  return single ? t('home.row.labelSingle', spoken) : t('home.row.label', spoken)
}

export function reminderRows(
  t: Translate,
  items: TodoItem[],
  { animalNames }: Pick<ReminderRowsOptions, 'animalNames'>,
): ReminderRow[] {
  return items.map((item) => {
    const type = reminderType(t, item)
    const animal = animalNames.get(item.animalId)
    const unlogged = unloggedText(t, item)
    return {
      key: item.key,
      group: item.group === 'to-log' ? 'to-log' : 'due',
      request: requestOf(item),
      opens: item.group === 'unreadable' ? 'detail' : 'sheet',
      tone: toneOf(item),
      icon: reminderIcon(item),
      title: item.label,
      subtitle: animal === undefined ? type : t('home.row.subtitle', { type, animal }),
      unlogged,
      badge: dueBadge(t, item),
      ariaLabel: ariaLabelOf(t, item, {
        title: item.label,
        type: t(`home.row.spokenType.${typeKey(item)}`),
        animal,
        due: spokenState(t, item, unlogged),
      }),
    }
  })
}

/** La ligne dont la feuille se rouvre : celle de l'échéance demandée, sinon la première du soin. */
export function rowToReopen(
  rows: readonly ReminderRow[],
  { kind, id, due }: ReminderRef & { due?: TodoDue },
): ReminderRow | undefined {
  const ofReminder = rows.filter(
    ({ opens, request }) => opens === 'sheet' && request.kind === kind && request.id === id,
  )
  const wanted = due === undefined ? null : todoReminderValue({ kind, id, due })
  return ofReminder.find(({ request }) => todoReminderValue(request) === wanted) ?? ofReminder[0]
}

export function nextReminderText(
  t: Translate,
  item: TodoDueItem | null,
  { animalNames, showAnimal }: ReminderRowsOptions,
): string | null {
  if (item === null) return null
  const params = {
    reminder: item.label,
    date: formatLongDate(item.dueOn),
  }
  const name = showAnimal ? animalNames.get(item.animalId) : undefined
  if (name === undefined) return t('home.upToDate.nextForAnimal', params)
  return t('home.upToDate.nextForMany', { ...params, name })
}
