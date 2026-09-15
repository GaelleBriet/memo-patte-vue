import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import type { NotificationPermissionStatus } from '../permission'
import { useNotificationPermission } from '../use-notification-permission'

const getStatus = vi.hoisted(() => vi.fn<() => Promise<NotificationPermissionStatus>>())

vi.mock('../permission', () => ({ getNotificationPermissionStatus: getStatus }))

function mountWithStatus() {
  let exposed!: ReturnType<typeof useNotificationPermission>
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useNotificationPermission()
        return () => h('p')
      },
    }),
  )
  return { wrapper, permission: exposed }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useNotificationPermission', () => {
  it('lit l’état au montage', async () => {
    getStatus.mockResolvedValue('disabled')

    const { wrapper, permission } = mountWithStatus()
    expect(permission.status.value).toBeNull()
    await flushPromises()

    expect(permission.status.value).toBe('disabled')
    wrapper.unmount()
  })

  it('relit l’état au retour au premier plan', async () => {
    getStatus.mockResolvedValue('disabled')
    const { wrapper, permission } = mountWithStatus()
    await flushPromises()

    getStatus.mockResolvedValue('granted')
    simulateWebResume()
    await flushPromises()

    expect(permission.status.value).toBe('granted')
    wrapper.unmount()
  })

  it('ne relit plus après démontage', async () => {
    getStatus.mockResolvedValue('disabled')
    const { wrapper } = mountWithStatus()
    await flushPromises()
    wrapper.unmount()

    simulateWebResume()

    expect(getStatus).toHaveBeenCalledOnce()
  })
})
