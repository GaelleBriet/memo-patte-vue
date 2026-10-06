import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h } from 'vue'

import { simulateWebResume } from '@/core/app-lifecycle/__tests__/simulate-resume'
import type { ExactRemindersStatus } from '../exact-reminders'
import { useExactReminders } from '../use-exact-reminders'

const getStatus = vi.hoisted(() => vi.fn<() => Promise<ExactRemindersStatus>>())
const openSettings = vi.hoisted(() => vi.fn<() => Promise<ExactRemindersStatus>>())

vi.mock('../exact-reminders', () => ({
  getExactRemindersStatus: getStatus,
  openExactRemindersSettings: openSettings,
}))

function mountComposable() {
  let exposed!: ReturnType<typeof useExactReminders>
  const wrapper = mount(
    defineComponent({
      setup() {
        exposed = useExactReminders()
        return () => h('p')
      },
    }),
  )
  return { wrapper, exact: exposed }
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('useExactReminders', () => {
  it('lit l’état au montage, sans rien demander', async () => {
    getStatus.mockResolvedValue('never-enabled')

    const { wrapper, exact } = mountComposable()
    expect(exact.status.value).toBeNull()
    await flushPromises()

    expect(exact.status.value).toBe('never-enabled')
    expect(openSettings).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('relit l’état à chaque retour au premier plan', async () => {
    getStatus.mockResolvedValue('precise')
    const { wrapper, exact } = mountComposable()
    await flushPromises()

    getStatus.mockResolvedValue('removed')
    simulateWebResume()
    await flushPromises()

    expect(exact.status.value).toBe('removed')
    wrapper.unmount()
  })

  it('ouvre le réglage Android et prend l’état rendu au retour', async () => {
    getStatus.mockResolvedValue('never-enabled')
    openSettings.mockResolvedValue('precise')
    const { wrapper, exact } = mountComposable()
    await flushPromises()

    await exact.openSettings()

    expect(exact.status.value).toBe('precise')
    wrapper.unmount()
  })

  it('ne relit plus après démontage', async () => {
    getStatus.mockResolvedValue('precise')
    const { wrapper } = mountComposable()
    await flushPromises()
    wrapper.unmount()

    simulateWebResume()

    expect(getStatus).toHaveBeenCalledOnce()
  })
})
