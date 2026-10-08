import { addMonths } from 'date-fns'

import type { NotificationPermissionStatus } from '@/core/notifications'
import type { UsageSignalTally } from '@/shared/utils/usage-signals'
import type { HomeMessagesMemory } from './home-messages-memory'
import type { Translate } from '@/core/i18n/translate'

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

export type HomeMessagePlace = 'aboveTodo' | 'belowTodo'

export function homeMessagePlace(message: HomeMessage): HomeMessagePlace {
  return message.kind === 'remindersOff' ? 'aboveTodo' : 'belowTodo'
}

export type HomeMessageAction =
  | 'androidSettings'
  | 'priming'
  | 'closeRemindersOff'
  | 'seeHow'
  | 'closeProtect'
  | 'exportCopy'
  | 'discoverPlus'
  | 'stopQuarterly'
  | 'closeQuarterly'

type Labelled = { action: HomeMessageAction; label: string }

export type HomeMessageButton = Labelled & {
  ariaLabel: string
  variant: 'flat' | 'outlined' | 'text'
}

export type HomeMessageView =
  | {
      kind: 'remindersOff'
      title: string
      enable: { action: 'androidSettings' | 'priming'; label: string }
      help: { label: string; ariaLabel: string }
      close: Labelled
    }
  | {
      kind: 'protect' | 'quarterly'
      icon: string
      title: string
      body: string | null
      close: Labelled
      buttons: HomeMessageButton[]
    }

export function homeMessageView(t: Translate, message: HomeMessage): HomeMessageView {
  switch (message.kind) {
    case 'remindersOff':
      return {
        kind: 'remindersOff',
        title: t('notifications.disabled.title'),
        enable: {
          action: message.enable,
          label:
            message.enable === 'priming'
              ? t('notifications.disabled.enable')
              : t('notifications.disabled.openSettings'),
        },
        help: {
          label: t('notifications.disabled.help'),
          ariaLabel: t('notifications.disabled.helpLabel'),
        },
        close: { action: 'closeRemindersOff', label: t('home.messages.close') },
      }
    case 'protect':
      return {
        kind: 'protect',
        icon: 'ms:mobile',
        title: t('home.messages.protect.title'),
        body: null,
        close: { action: 'closeProtect', label: t('home.messages.close') },
        buttons: [
          {
            action: 'seeHow',
            label: t('home.messages.protect.seeHow'),
            ariaLabel: t('home.messages.protect.seeHowLabel'),
            variant: 'outlined',
          },
        ],
      }
    case 'quarterly':
      return {
        kind: 'quarterly',
        icon: 'ms:shield',
        title: t('home.messages.quarterly.title'),
        body: t('home.messages.quarterly.body'),
        close: { action: 'closeQuarterly', label: t('home.messages.quarterly.close') },
        buttons: [
          {
            action: 'exportCopy',
            label: t('settings.backup.copy.export'),
            ariaLabel: t('home.messages.quarterly.exportLabel'),
            variant: 'flat',
          },
          {
            action: 'discoverPlus',
            label: t('home.messages.quarterly.plus'),
            ariaLabel: t('home.messages.quarterly.plusLabel'),
            variant: 'outlined',
          },
          {
            action: 'stopQuarterly',
            label: t('home.messages.quarterly.stop'),
            ariaLabel: t('home.messages.quarterly.stopLabel'),
            variant: 'text',
          },
        ],
      }
  }
}
