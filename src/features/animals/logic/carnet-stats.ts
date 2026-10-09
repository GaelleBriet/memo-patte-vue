import type { ReminderCounts } from '@/shared/domain/reminders'
import type { Translate } from '@/core/i18n/translate'

export type CarnetStat = { value: string; sub: string; isOverdue: boolean }

/** Dès qu'il y a un retard, la colonne ne compte que les retards : « 2 en retard » pour un seul mentirait. */
export function carnetRemindersStat(t: Translate, sections: readonly ReminderCounts[]): CarnetStat {
  const total = sections.reduce((sum, section) => sum + section.total, 0)
  const overdue = sections.reduce((sum, section) => sum + section.overdue, 0)
  if (overdue > 0) {
    return { value: String(overdue), sub: t('animals.carnet.stats.overdue'), isOverdue: true }
  }
  return { value: String(total), sub: t('animals.carnet.stats.upcoming'), isOverdue: false }
}
