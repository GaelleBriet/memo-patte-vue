import { differenceInMinutes, parseISO } from 'date-fns'

import type { Translate } from '@/core/i18n/translate'
import { toDay } from '@/shared/domain/calendar-day'
import type { BackupStatus, CloudBackupStatus } from './backup-status'
import { lastBackupWhen } from './backup-summary-text'

const MINUTES_IN_AN_HOUR = 60

function savedWhen(t: Translate, at: string, now: Date): string {
  const minutes = differenceInMinutes(now, parseISO(at))
  if (minutes < MINUTES_IN_AN_HOUR) {
    return t('settings.backup.cloud.minutesAgo', { n: Math.max(1, minutes) })
  }
  return lastBackupWhen(t, at, toDay(now))
}

export function refusedItemsText(t: Translate, count: number): string {
  return t('settings.backup.cloud.refused', { n: count }, count)
}

export function refusedItemsHelpText(t: Translate, count: number): string {
  return t('settings.backup.cloud.refusedHelp', { text: refusedItemsText(t, count) })
}

/** Sous-titre de la rubrique Sauvegarde ; `null` : la rubrique garde son sous-titre habituel. */
export function backupSubtitle(
  t: Translate,
  status: BackupStatus | null,
  refused: number,
  now: Date,
): string | null {
  if (status === null || status.kind === 'local' || status.kind === 'unread') return null
  if (status.kind === 'saved' && refused > 0) return refusedItemsText(t, refused)
  return cloudBackupText(t, status, now).title
}

/** Les deux lignes de la carte d'état de Paramètres › Sauvegarde, pour un abonné. */
export function cloudBackupText(
  t: Translate,
  status: CloudBackupStatus,
  now: Date,
): { title: string; hint: string | null } {
  switch (status.kind) {
    case 'saved':
      return {
        title: t('settings.backup.cloud.saved.title', { when: savedWhen(t, status.at, now) }),
        hint: t('settings.backup.cloud.saved.hint'),
      }
    case 'first-backup':
      return {
        title: t('settings.backup.cloud.firstBackup.title'),
        hint: t(
          'settings.backup.cloud.firstBackup.count',
          { done: status.done, total: status.total },
          status.done,
        ),
      }
    case 'waiting-network':
      return {
        title: t('settings.backup.cloud.waitingNetwork.title'),
        hint: t('settings.backup.cloud.waitingNetwork.hint'),
      }
    case 'interrupted':
      return {
        title: t('settings.backup.cloud.interrupted.title'),
        hint:
          status.since === null
            ? null
            : t('settings.backup.cloud.interrupted.hint', {
                when: lastBackupWhen(t, status.since, toDay(now)),
              }),
      }
  }
}
