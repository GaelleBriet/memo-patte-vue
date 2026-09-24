import {
  buildReminders,
  type BuildRemindersOptions,
  type Reminder,
  type RemindersSummary,
  type ReminderSource,
} from '@/shared/domain/reminders'

/** Dernier jour de la fenêtre de « À faire » : J+29, soit 30 jours, aujourd'hui compris. */
export const TODO_WINDOW_DAYS = 29

export type TodoSummary<T extends ReminderSource = ReminderSource> = RemindersSummary<T> & {
  /** Le plus proche des rappels laissés hors de la fenêtre. */
  next: Reminder<T> | null
}

export function buildTodo<T extends ReminderSource>(
  sources: T[],
  options: BuildRemindersOptions,
): TodoSummary<T> {
  const { reminders } = buildReminders(sources, options)
  const shown = reminders.filter((reminder) => reminder.daysUntil <= TODO_WINDOW_DAYS)

  return {
    reminders: shown,
    total: shown.length,
    overdue: shown.filter((reminder) => reminder.status === 'overdue').length,
    next: reminders.find((reminder) => reminder.daysUntil > TODO_WINDOW_DAYS) ?? null,
  }
}
