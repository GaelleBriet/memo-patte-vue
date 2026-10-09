import type { TodoDueItem, TodoItem, TodoToLogItem, TodoUnreadableItem } from './todo-items'

/** Écart en jours entre aujourd’hui et le dernier jour de « À faire » : J+29, soit 30 jours. */
export const TODO_LAST_DAY_OFFSET = 29

export type TodoSummary = {
  /** Les soins de la fenêtre, les traitements illisibles, puis « À renseigner ». */
  items: TodoItem[]
  /** Les soins de la fenêtre seulement : ni « À renseigner » ni ligne illisible (AC-10). */
  total: number
  overdue: number
  /** Le plus proche des soins laissés hors de la fenêtre. */
  next: TodoDueItem | null
}

export type BuildTodoOptions = { animalId?: string }

function compareAlphabetically(a: string, b: string): number {
  return a.localeCompare(b)
}

function timeKey(time: string | null): string {
  return time ?? ''
}

function compareDue(a: TodoDueItem, b: TodoDueItem): number {
  return (
    a.daysUntil - b.daysUntil ||
    compareAlphabetically(timeKey(a.dueTime), timeKey(b.dueTime)) ||
    compareAlphabetically(a.label, b.label) ||
    compareAlphabetically(a.id, b.id)
  )
}

function compareToLog(a: TodoToLogItem, b: TodoToLogItem): number {
  return (
    compareAlphabetically(a.oldest.dueOn, b.oldest.dueOn) ||
    compareAlphabetically(timeKey(a.oldest.dueTime), timeKey(b.oldest.dueTime)) ||
    compareAlphabetically(a.label, b.label) ||
    compareAlphabetically(a.id, b.id)
  )
}

function compareUnreadable(a: TodoUnreadableItem, b: TodoUnreadableItem): number {
  return compareAlphabetically(a.label, b.label) || compareAlphabetically(a.id, b.id)
}

export function buildTodo(items: readonly TodoItem[], { animalId }: BuildTodoOptions): TodoSummary {
  const scoped = items.filter((item) => animalId === undefined || item.animalId === animalId)
  const dues = scoped.filter((item): item is TodoDueItem => item.group === 'due').sort(compareDue)
  const shown = dues.filter((item) => item.daysUntil <= TODO_LAST_DAY_OFFSET)
  const unreadable = scoped
    .filter((item): item is TodoUnreadableItem => item.group === 'unreadable')
    .sort(compareUnreadable)
  const toLog = scoped
    .filter((item): item is TodoToLogItem => item.group === 'to-log')
    .sort(compareToLog)

  return {
    items: [...shown, ...unreadable, ...toLog],
    total: shown.length,
    overdue: shown.filter((item) => item.status === 'overdue').length,
    next: dues.find((item) => item.daysUntil > TODO_LAST_DAY_OFFSET) ?? null,
  }
}
