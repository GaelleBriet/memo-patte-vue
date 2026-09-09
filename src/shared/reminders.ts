import { differenceInCalendarDays, parseISO } from 'date-fns'

export type ReminderKind = 'vaccination' | 'treatment'

export type ReminderSource = {
  kind: ReminderKind
  id: string
  animalId: string
  label: string
  /** Date civile `yyyy-MM-dd` ; `null` = pas de rappel programmé, jamais listé comme rappel. */
  dueDate: string | null
}

export type ReminderStatus = 'overdue' | 'today' | 'tomorrow' | 'later'

export type Reminder = Omit<ReminderSource, 'dueDate'> & {
  dueDate: string
  status: ReminderStatus
  /** Négatif en retard, 0 aujourd'hui. */
  daysUntil: number
}

export type BuildRemindersOptions = {
  /** Date civile `yyyy-MM-dd` du jour ; le module ne lit jamais l'horloge. */
  today: string
  animalId?: string
}

export type RemindersSummary = {
  reminders: Reminder[]
  total: number
  overdue: number
}

function toStatus(daysUntil: number): ReminderStatus {
  if (daysUntil < 0) return 'overdue'
  if (daysUntil === 0) return 'today'
  if (daysUntil === 1) return 'tomorrow'
  return 'later'
}

function compare(a: Reminder, b: Reminder): number {
  return a.daysUntil - b.daysUntil || a.label.localeCompare(b.label) || a.id.localeCompare(b.id)
}

export function buildReminders(
  sources: ReminderSource[],
  { today, animalId }: BuildRemindersOptions,
): RemindersSummary {
  const todayDate = parseISO(today)
  const reminders: Reminder[] = []

  for (const source of sources) {
    if (source.dueDate === null) continue
    if (animalId !== undefined && source.animalId !== animalId) continue
    const daysUntil = differenceInCalendarDays(parseISO(source.dueDate), todayDate)
    reminders.push({ ...source, dueDate: source.dueDate, status: toStatus(daysUntil), daysUntil })
  }

  reminders.sort(compare)

  return {
    reminders,
    total: reminders.length,
    overdue: reminders.filter((reminder) => reminder.status === 'overdue').length,
  }
}
