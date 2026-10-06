import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  getNotificationPermissionStatus,
  hasAndroidAskedNotifications,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'
import { usePurchaseStore } from '@/features/purchase/store/purchase.store'
import { readUsageSignals } from '@/shared/utils/usage-signals'
import { homeMessage } from '../logic/home-messages'
import {
  readHomeMessagesMemory,
  rememberHomeMessages,
  type HomeMessagesMemory,
} from '../logic/home-messages-memory'
import {
  carnetCopyService,
  type CarnetCopyOutcome,
  type CarnetCopyService,
} from '../service/carnet-copy.service'

export type CarnetCopyServiceProvider = () => CarnetCopyService

let provider: CarnetCopyServiceProvider = () => carnetCopyService

/** `null` rétablit le service réel. */
export function provideCarnetCopyService(next: CarnetCopyServiceProvider | null): void {
  provider = next ?? (() => carnetCopyService)
}

export const useHomeMessagesStore = defineStore('homeMessages', () => {
  const purchase = usePurchaseStore()
  const notifications = ref<NotificationPermissionStatus | null>(null)
  const hasAndroidAsked = ref(true)
  const signals = ref(readUsageSignals())
  const memory = ref(readHomeMessagesMemory())
  const now = ref(new Date())
  const isSharing = ref(false)
  let latestRefresh = 0

  const message = computed(() =>
    homeMessage({
      notifications: notifications.value,
      hasAndroidAsked: hasAndroidAsked.value,
      isPlus: purchase.status.plan !== 'none',
      care: signals.value.care,
      lastJsonShareAt: signals.value.jsonShare.lastAt,
      memory: memory.value,
      now: now.value,
    }),
  )

  function readDevice(): void {
    signals.value = readUsageSignals()
    memory.value = readHomeMessagesMemory()
    now.value = new Date()
  }

  function remember(changes: Partial<HomeMessagesMemory>): void {
    memory.value = rememberHomeMessages(changes)
  }

  return {
    message,
    isSharing,

    async refresh(): Promise<void> {
      const call = ++latestRefresh
      readDevice()
      const [status, asked] = await Promise.all([
        getNotificationPermissionStatus(),
        hasAndroidAskedNotifications(),
      ])
      if (call !== latestRefresh) return
      notifications.value = status
      hasAndroidAsked.value = asked
    },

    closeRemindersOff(): void {
      remember({ remindersClosedAt: new Date().toISOString() })
    },

    closeProtect(): void {
      remember({ protectClosed: true })
    },

    closeQuarterly(): void {
      remember({ quarterlyClosedAt: new Date().toISOString() })
    },

    stopQuarterly(): void {
      remember({ quarterlyStopped: true })
    },

    async shareCopy(): Promise<CarnetCopyOutcome> {
      isSharing.value = true
      try {
        return await provider().share()
      } finally {
        isSharing.value = false
        readDevice()
      }
    },
  }
})
