import { readonly, ref, type Ref } from 'vue'

import { useAppResume } from '@/core/app-lifecycle/app-resume'
import { getNotificationPermissionStatus, type NotificationPermissionStatus } from './permission'

/** État de la permission, relu au montage et à chaque retour au premier plan. `null` avant la première lecture. */
export function useNotificationPermission(): {
  status: Readonly<Ref<NotificationPermissionStatus | null>>
  refresh: () => Promise<void>
} {
  const status = ref<NotificationPermissionStatus | null>(null)

  async function refresh(): Promise<void> {
    status.value = await getNotificationPermissionStatus()
  }

  void refresh()
  useAppResume(() => void refresh())

  return { status: readonly(status), refresh }
}
