import { addMonths, addYears, subDays } from 'date-fns'

import {
  NO_STORED_PLUS,
  writeStoredPlusStatus,
  type WritablePlusStatus,
} from './plus-status-storage'

export const DEV_PLUS_STATUS_MARKER = 'memo-patte:dev-plus-status'

const DEV_PLANS = new Map<string, (now: Date) => WritablePlusStatus>([
  ['lifetime', () => ({ plan: 'lifetime', expiresAt: null })],
  ['annual', (now) => ({ plan: 'annual', expiresAt: addYears(now, 1).toISOString() })],
  ['monthly', (now) => ({ plan: 'monthly', expiresAt: addMonths(now, 1).toISOString() })],
  ['expired', (now) => ({ plan: 'monthly', expiresAt: subDays(now, 3).toISOString() })],
  ['none', () => NO_STORED_PLUS],
])

export function applyDevPlusStatus(requested: string | undefined, now = new Date()): void {
  if (!requested) return
  const statusAt = DEV_PLANS.get(requested)
  if (!statusAt) {
    console.warn(
      `[${DEV_PLUS_STATUS_MARKER}] VITE_DEV_PLAN « ${requested} » inconnu, statut Plus laissé tel quel (attendu : ${[...DEV_PLANS.keys()].join(', ')})`,
    )
    return
  }
  writeStoredPlusStatus(statusAt(now))
}
