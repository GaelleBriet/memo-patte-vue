import { format, parseISO, subDays } from 'date-fns'

import type { Translate } from '@/core/i18n/translate'
import type { RestoreProgress } from '@/core/sync/service/account-restore'
import type { BackupSummary } from '@/core/sync/service/backup-summary'
import { toDay } from '@/shared/domain/calendar-day'
import { formatClockTime, formatFullDate, formatFullDayMonth } from '@/shared/utils/format'

function lastBackupWhen(t: Translate, instant: string, today: string): string {
  const at = parseISO(instant)
  const day = toDay(at)
  const time = formatClockTime(format(at, 'HH:mm'))
  if (day >= today) return t('settings.restore.when.today', { time })
  if (day === toDay(subDays(parseISO(today), 1))) {
    return t('settings.restore.when.yesterday', { time })
  }
  if (day.slice(0, 4) === today.slice(0, 4)) {
    return t('settings.restore.when.thisYear', { date: formatFullDayMonth(day), time })
  }
  return t('settings.restore.when.earlier', { date: formatFullDate(day) })
}

/** `3 animaux · dernière sauvegarde hier à 21 h 04`. */
export function backupSummaryText(t: Translate, summary: BackupSummary, today: string): string {
  const when = lastBackupWhen(t, summary.lastBackupAt, today)
  return t('settings.restore.summary', { n: summary.animalCount, when }, summary.animalCount)
}

/** `120 éléments sur 348` ; `null` tant que le total n'est pas connu. */
export function restoreProgressText(t: Translate, { done, total }: RestoreProgress): string | null {
  if (total === 0) return null
  return t('settings.restore.progress.count', { done, total }, done)
}
