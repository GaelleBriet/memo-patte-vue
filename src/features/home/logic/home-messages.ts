import { addMonths } from 'date-fns'

import type { NotificationPermissionStatus } from '@/core/notifications'
import type { UsageSignalTally } from '@/shared/utils/usage-signals'
import type { HomeMessagesMemory } from './home-messages-memory'

export const QUARTER_IN_MONTHS = 3

export type HomeMessage =
  | { kind: 'remindersOff'; enable: 'androidSettings' | 'priming' }
  | { kind: 'protect' }
  | { kind: 'quarterly' }

export type HomeMessageKind = HomeMessage['kind']

export type HomeMessagesFacts = {
  notifications: NotificationPermissionStatus | null
  hasAndroidAsked: boolean
  isPlus: boolean
  care: Pick<UsageSignalTally, 'firstAt' | 'lastAt'>
  lastJsonShareAt: string | null
  memory: HomeMessagesMemory
  now: Date
}

function time(iso: string | null): number {
  return iso === null ? Number.NEGATIVE_INFINITY : Date.parse(iso)
}

function remindersOff(facts: HomeMessagesFacts): HomeMessage | null {
  if (facts.notifications !== 'disabled') return null
  const { remindersClosedAt } = facts.memory
  if (remindersClosedAt !== null && time(facts.care.lastAt) <= time(remindersClosedAt)) return null
  return { kind: 'remindersOff', enable: facts.hasAndroidAsked ? 'androidSettings' : 'priming' }
}

function isQuarterlyDue({ care, lastJsonShareAt, memory, now }: HomeMessagesFacts): boolean {
  if (care.firstAt === null || memory.quarterlyStopped) return false
  const since = Math.max(time(care.firstAt), time(lastJsonShareAt), time(memory.quarterlyClosedAt))
  return addMonths(since, QUARTER_IN_MONTHS).getTime() <= now.getTime()
}

/** Au plus un message, par priorité : rappels désactivés, carte « protéger », carte trimestrielle. */
export function homeMessage(facts: HomeMessagesFacts): HomeMessage | null {
  const reminders = remindersOff(facts)
  if (reminders) return reminders
  if (facts.isPlus || facts.care.firstAt === null) return null
  if (!facts.memory.protectClosed) return { kind: 'protect' }
  return isQuarterlyDue(facts) ? { kind: 'quarterly' } : null
}
