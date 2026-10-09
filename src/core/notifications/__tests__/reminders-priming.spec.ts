import { afterEach, describe, expect, it, vi } from 'vitest'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'

import { promptNotificationsIfReminders, provideRemindersPriming } from '../reminders-priming'

const router = createRouter({ history: createMemoryHistory(), routes: [] })

afterEach(() => {
  provideRemindersPriming(null)
})

describe('promptNotificationsIfReminders', () => {
  it('ne propose rien tant qu’aucune lecture du carnet n’est branchée', async () => {
    await expect(promptNotificationsIfReminders(router, 'home')).resolves.toBe(false)
  })

  it('confie la décision à la lecture branchée au démarrage', async () => {
    const prompt = vi.fn<(router: Router, from: string) => Promise<boolean>>(async () => true)
    provideRemindersPriming(prompt)

    await expect(promptNotificationsIfReminders(router, 'settings-data')).resolves.toBe(true)
    expect(prompt).toHaveBeenCalledExactlyOnceWith(router, 'settings-data')
  })

  it('ne propose plus rien une fois débranchée', async () => {
    provideRemindersPriming(async () => true)
    provideRemindersPriming(null)

    await expect(promptNotificationsIfReminders(router, 'home')).resolves.toBe(false)
  })
})
