import { computed, ref, watch, type ComputedRef } from 'vue'

import { displayedNotificationsStatus } from '../logic/reminders-settings'
import {
  hasAndroidAskedNotifications,
  type NotificationPermissionStatus,
} from '@/core/notifications/permission'
import { useNotificationPermission } from '@/core/notifications/use-notification-permission'

/** État des notifications tel que Paramètres le montre, relu à chaque retour au premier plan. */
export function useRemindersPermission(): ComputedRef<NotificationPermissionStatus | null> {
  const { status } = useNotificationPermission()
  const androidAsked = ref<boolean | null>(null)

  watch(
    status,
    async (current) => {
      if (current === 'disabled') androidAsked.value = await hasAndroidAskedNotifications()
    },
    { immediate: true },
  )

  return computed(() => displayedNotificationsStatus(status.value, androidAsked.value))
}
