import { flushPromises } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { promptNotificationsIfReminders } from '@/core/notifications/reminders-priming'
import { installLaunchPriming, installRemindersPriming } from '../reminders-priming'

const remindersPriming = vi.hoisted(() =>
  vi.fn<(router: Router, from: string) => Promise<boolean>>(async () => true),
)

vi.mock('@/features/treatments/service/reminders-priming.service', () => ({ remindersPriming }))

const Vide = { render: () => null }

function routeur(): Router {
  return createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', name: 'home', component: Vide }],
  })
}

describe('installLaunchPriming', () => {
  it('propose l’écran une fois la première navigation terminée, avec l’Accueil pour retour', async () => {
    const router = routeur()
    const prompt = vi.fn<(router: Router, from: string) => Promise<boolean>>(async () => false)

    installLaunchPriming(router, prompt)
    expect(prompt).not.toHaveBeenCalled()

    await router.push('/')
    await flushPromises()

    expect(prompt).toHaveBeenCalledExactlyOnceWith(router, 'home')
  })
})

describe('installRemindersPriming', () => {
  let uninstall = () => {}

  afterEach(() => {
    uninstall()
    remindersPriming.mockClear()
  })

  it('fait répondre le relais de core/ comme le service des traitements', async () => {
    const router = routeur()

    uninstall = installRemindersPriming()

    await expect(promptNotificationsIfReminders(router, 'settings-data')).resolves.toBe(true)
    expect(remindersPriming).toHaveBeenCalledExactlyOnceWith(router, 'settings-data')
  })

  it('débranche le relais', async () => {
    installRemindersPriming()()

    await expect(promptNotificationsIfReminders(routeur(), 'home')).resolves.toBe(false)
    expect(remindersPriming).not.toHaveBeenCalled()
  })
})
