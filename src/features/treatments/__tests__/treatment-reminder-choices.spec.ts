import { describe, expect, it, vi } from 'vitest'

import {
  reminderHelpText,
  reminderOffsetChoices,
  suggestExactReminders,
  suggestsExactReminders,
} from '../logic/treatment-reminder-choices'
import i18n from '@/core/i18n'
import type { NotificationPermissionStatus } from '@/core/notifications'

describe('champ « Rappel » (RA-7, RA-8, RA-23)', () => {
  it('propose les quatre moments avec les rappels précis actifs', () => {
    expect(reminderOffsetChoices('precise', null)).toEqual([0, 15, 30, 60])
  })

  it.each(['never-enabled', 'removed', 'unavailable', null] as const)(
    'sans rappels précis (%s), seulement « À l’heure » et « 1 h avant »',
    (status) => {
      expect(reminderOffsetChoices(status, null)).toEqual([0, 60])
      expect(reminderOffsetChoices(status, 0)).toEqual([0, 60])
    },
  )

  it('garde le choix déjà fait, à sa place, quand les rappels précis ne sont plus actifs (V2 ter)', () => {
    expect(reminderOffsetChoices('removed', 30)).toEqual([0, 30, 60])
    expect(reminderOffsetChoices('never-enabled', 15)).toEqual([0, 15, 60])
  })

  describe('suggestion des rappels précis (RA-23)', () => {
    const contexte = {
      exact: 'never-enabled',
      notifications: 'granted',
      alreadySuggested: false,
    } as const

    it('la propose quand le traitement reçoit sa première heure, notifications autorisées', () => {
      expect(suggestsExactReminders([], ['21:00'], contexte)).toBe(true)
    })

    it('ne la propose pas pour une heure de plus, ni pour une heure retirée', () => {
      expect(suggestsExactReminders(['08:00'], ['08:00', '20:00'], contexte)).toBe(false)
      expect(suggestsExactReminders(['08:00'], [], contexte)).toBe(false)
    })

    it('ne la propose qu’une fois', () => {
      expect(suggestsExactReminders([], ['21:00'], { ...contexte, alreadySuggested: true })).toBe(
        false,
      )
    })

    it.each([
      ['precise', 'granted'],
      ['removed', 'granted'],
      ['unavailable', 'granted'],
      [null, 'granted'],
      ['never-enabled', 'unasked'],
      ['never-enabled', 'disabled'],
      ['never-enabled', null],
    ] as const)(
      'ne la propose pas avec les rappels précis %s et les notifications %s',
      (exact, notifications) => {
        expect(suggestsExactReminders([], ['21:00'], { ...contexte, exact, notifications })).toBe(
          false,
        )
      },
    )
  })
})

describe('suggestExactReminders (RA-23)', () => {
  function dependances(overrides: Partial<Parameters<typeof suggestExactReminders>[2]> = {}) {
    return {
      exact: 'never-enabled' as const,
      alreadySuggested: vi.fn<() => boolean>(() => false),
      notifications: vi.fn<() => Promise<NotificationPermissionStatus>>(async () => 'granted'),
      markSuggested: vi.fn<() => void>(),
      ...overrides,
    }
  }

  it('propose la suggestion et la note comme faite, une fois les notifications relues', async () => {
    const deps = dependances()

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(true)
    expect(deps.notifications).toHaveBeenCalledOnce()
    expect(deps.markSuggested).toHaveBeenCalledOnce()
  })

  it('ne relit pas les notifications quand rien d’autre ne permet la suggestion', async () => {
    const deps = dependances({ exact: 'precise' })

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(false)
    expect(deps.notifications).not.toHaveBeenCalled()
    expect(deps.markSuggested).not.toHaveBeenCalled()
  })

  it('ne note rien quand les notifications ne sont pas autorisées', async () => {
    const deps = dependances({
      notifications: vi.fn<() => Promise<NotificationPermissionStatus>>(async () => 'unasked'),
    })

    expect(await suggestExactReminders([], ['21:00'], deps)).toBe(false)
    expect(deps.markSuggested).not.toHaveBeenCalled()
  })
})

describe('reminderHelpText (RA-8, V1 bis)', () => {
  const t = i18n.global.t

  it('demande l’heure du rappel sans heure de traitement', () => {
    expect(reminderHelpText(t, [])).toBe('Sans heure de traitement, choisis l’heure du rappel.')
  })

  it('ne dit rien pour une seule heure', () => {
    expect(reminderHelpText(t, ['21:00'])).toBeNull()
  })

  it('dit que le rappel vaut pour chaque heure', () => {
    expect(reminderHelpText(t, ['08:00', '20:00'])).toBe(
      'Pour chaque heure\u00a0: 8\u00a0h et 20\u00a0h.',
    )
  })
})
