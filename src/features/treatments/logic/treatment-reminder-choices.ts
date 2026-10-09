import {
  REMINDER_OFFSETS_MINUTES,
  type ReminderOffsetMinutes,
} from '../schema/treatment-period.schema'
import type { ExactRemindersStatus, NotificationPermissionStatus } from '@/core/notifications'
import { hasSeveralDoseTimes } from '@/shared/domain/treatment-periods'
import { formatClockTimes } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

const OFFSETS_WITHOUT_EXACT: readonly ReminderOffsetMinutes[] = [0, 60]

/** Les moments du rappel proposés ; `kept`, déjà choisi, le reste sans les rappels précis (RA-23). */
export function reminderOffsetChoices(
  exact: ExactRemindersStatus | null,
  kept: ReminderOffsetMinutes | null,
): ReminderOffsetMinutes[] {
  if (exact === 'precise') return [...REMINDER_OFFSETS_MINUTES]
  return REMINDER_OFFSETS_MINUTES.filter(
    (offset) => OFFSETS_WITHOUT_EXACT.includes(offset) || offset === kept,
  )
}

/** La suggestion des rappels précis, au plus une fois : quand le traitement reçoit sa première heure. */
export function suggestsExactReminders(
  before: readonly string[],
  after: readonly string[],
  context: {
    exact: ExactRemindersStatus | null
    notifications: NotificationPermissionStatus | null
    alreadySuggested: boolean
  },
): boolean {
  return (
    before.length === 0 &&
    after.length > 0 &&
    context.exact === 'never-enabled' &&
    context.notifications === 'granted' &&
    !context.alreadySuggested
  )
}

/** Relit les notifications et note la suggestion faite, seulement quand tout le reste la permet. */
export async function suggestExactReminders(
  before: readonly string[],
  after: readonly string[],
  deps: {
    exact: ExactRemindersStatus | null
    alreadySuggested: () => boolean
    notifications: () => Promise<NotificationPermissionStatus>
    markSuggested: () => void
  },
): Promise<boolean> {
  const context = { exact: deps.exact, alreadySuggested: deps.alreadySuggested() }
  if (!suggestsExactReminders(before, after, { ...context, notifications: 'granted' })) return false
  const notifications = await deps.notifications()
  if (!suggestsExactReminders(before, after, { ...context, notifications })) return false
  deps.markSuggested()
  return true
}

/** L'aide du champ « Rappel » : l'heure à choisir sans heure de traitement, chaque heure à plusieurs. */
export function reminderHelpText(t: Translate, times: readonly string[]): string | null {
  if (times.length === 0) return t('treatments.form.reminder.noTimeHelp')
  return hasSeveralDoseTimes(times)
    ? t('treatments.form.reminder.eachTime', { times: formatClockTimes(times) })
    : null
}
