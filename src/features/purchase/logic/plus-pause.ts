import { addMonths, parseISO } from 'date-fns'

import { toDay } from '@/shared/domain/calendar-day'
import type { PlusStatus, SubscriptionPlan } from './plus-status'

const BACKUP_KEPT_MONTHS = 12

export type BackupPause = {
  /** Dernier jour où la sauvegarde cloud est conservée (`AAAA-MM-JJ`), `null` si la fin de Plus est inconnue. */
  keptUntil: string | null
}

export function backupKeptUntil(endedAt: string): string {
  return toDay(addMonths(parseISO(endedAt), BACKUP_KEPT_MONTHS))
}

export function pausedBackupOf({
  status,
  expiredPlan,
  endedAt,
  now,
}: {
  status: PlusStatus
  expiredPlan: SubscriptionPlan | null
  endedAt: string | null
  now: number
}): BackupPause | null {
  if (status.plan !== 'none') return null
  if (endedAt === null) return expiredPlan === null ? null : { keptUntil: null }
  const keptUntil = backupKeptUntil(endedAt)
  return toDay(new Date(now)) <= keptUntil ? { keptUntil } : null
}
