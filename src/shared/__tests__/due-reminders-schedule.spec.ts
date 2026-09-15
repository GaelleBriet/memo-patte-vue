// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Reminder } from '@/core/notifications'
import { cancelDueReminders, replaceDueReminders } from '../due-reminders-schedule'
import { createFakeNotifications, type FakeNotifications } from './fake-notifications'

const ID = '22222222-2222-4222-8222-222222222222'
const OTHER = '33333333-3333-4333-8333-333333333333'

const DUE: Reminder = {
  key: `vaccination:${ID}:due`,
  title: 'titre',
  body: 'corps',
  at: new Date(2026, 9, 15, 9),
}

let notifications: FakeNotifications

beforeEach(() => {
  notifications = createFakeNotifications()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('replaceDueReminders', () => {
  it('annule les deux rappels de l’entrée puis programme les nouveaux', async () => {
    await replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, () => [DUE])

    expect(notifications.cancelReminder.mock.calls).toEqual([
      [`vaccination:${ID}:before`],
      [`vaccination:${ID}:due`],
    ])
    expect(notifications.scheduleReminder.mock.calls).toEqual([[DUE]])
    expect(notifications.cancelReminder.mock.invocationCallOrder[1]).toBeLessThan(
      notifications.scheduleReminder.mock.invocationCallOrder[0]!,
    )
  })

  it('ne programme rien sans permission et ne construit pas les rappels', async () => {
    notifications.checkPermission.mockResolvedValue(false)
    const build = vi.fn<() => Reminder[]>(() => [DUE])

    await replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, build)

    expect(build).not.toHaveBeenCalled()
    expect(notifications.scheduleReminder).not.toHaveBeenCalled()
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.scheduleReminder.mockRejectedValue(new Error('plugin'))

    await expect(
      replaceDueReminders(notifications, { kind: 'vaccination', id: ID }, () => [DUE]),
    ).resolves.toBeUndefined()
    expect(console.warn).toHaveBeenCalled()
  })
})

describe('cancelDueReminders', () => {
  it('annule les rappels de chaque entrée, même sans permission', async () => {
    notifications.checkPermission.mockResolvedValue(false)

    await cancelDueReminders(notifications, [
      { kind: 'vaccination', id: ID },
      { kind: 'treatment', id: OTHER },
    ])

    expect(notifications.cancelReminder.mock.calls.flat()).toEqual([
      `vaccination:${ID}:before`,
      `vaccination:${ID}:due`,
      `treatment:${OTHER}:before`,
      `treatment:${OTHER}:due`,
    ])
  })

  it('ne lève pas quand le plugin échoue', async () => {
    notifications.cancelReminder.mockRejectedValue(new Error('plugin'))

    await expect(
      cancelDueReminders(notifications, [{ kind: 'treatment', id: ID }]),
    ).resolves.toBeUndefined()
  })
})
