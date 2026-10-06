import { describe, expect, it } from 'vitest'

import {
  enableRemindersRoute,
  exactRemindersAction,
  exactRemindersRow,
  remindersSummary,
} from '../logic/reminders-settings'

describe('exactRemindersAction — toucher l’interrupteur « Rappels précis »', () => {
  it('déjà accordés : l’écran Android « Alarmes et rappels » directement', () => {
    expect(exactRemindersAction('precise')).toBe('androidSettings')
  })

  it.each(['never-enabled', 'removed', 'unavailable', null] as const)(
    '%s : l’écran d’explication d’abord',
    (status) => {
      expect(exactRemindersAction(status)).toBe('explainer')
    },
  )
})

describe('enableRemindersRoute — bouton sous l’état des notifications', () => {
  it('jamais demandées : l’écran d’explication d’abord (RA-21)', () => {
    expect(enableRemindersRoute('unasked')).toBe('priming')
  })

  it('refusées : seuls les réglages d’Android peuvent les rendre (RA-22)', () => {
    expect(enableRemindersRoute('disabled')).toBe('androidSettings')
  })

  it.each(['granted', 'unavailable', null] as const)('%s : aucun bouton', (status) => {
    expect(enableRemindersRoute(status)).toBeNull()
  })
})

describe('remindersSummary — sous-titre de l’entrée « Rappels » (V19)', () => {
  it.each([
    ['granted', 'precise', 'allowedExact'],
    ['granted', 'never-enabled', 'allowed'],
    ['granted', 'removed', 'allowed'],
    ['granted', 'unavailable', 'allowed'],
    ['granted', null, 'allowed'],
    ['unasked', 'precise', 'notYet'],
    ['disabled', 'precise', 'off'],
    ['unavailable', 'precise', null],
    [null, null, null],
  ] as const)('notifications %s, rappels précis %s → %s', (notifications, exact, expected) => {
    expect(remindersSummary(notifications, exact)).toBe(expected)
  })
})

describe('exactRemindersRow — ligne « Rappels précis » (V20 à V20 sexies)', () => {
  it('cache la ligne tant que l’accès n’est pas lu, ou sans rappels précis possibles', () => {
    expect(exactRemindersRow('granted', null)).toBeNull()
    expect(exactRemindersRow('granted', 'unavailable')).toBeNull()
    expect(exactRemindersRow(null, 'precise')).toBeNull()
    expect(exactRemindersRow('unavailable', 'precise')).toBeNull()
  })

  it('V20 : accordés, interrupteur allumé et encart « à l’heure pile »', () => {
    expect(exactRemindersRow('granted', 'precise')).toEqual({
      isOn: true,
      hint: 'allowed',
      notice: 'precise',
    })
  })

  it('V20 ter : jamais activés, la phrase qui dit à quoi ils servent', () => {
    expect(exactRemindersRow('granted', 'never-enabled')).toEqual({
      isOn: false,
      hint: 'pitch',
      notice: null,
    })
  })

  it('V20 quater : retirés dans Android, « peuvent arriver en retard » avec « Réactiver »', () => {
    expect(exactRemindersRow('granted', 'removed')).toEqual({
      isOn: false,
      hint: 'off',
      notice: 'lessPrecise',
    })
  })

  it('V20 sexies : notifications jamais demandées, sans effet pour l’instant', () => {
    expect(exactRemindersRow('unasked', 'never-enabled')).toEqual({
      isOn: false,
      hint: 'notYetOn',
      notice: null,
    })
  })

  it('V20 bis : notifications refusées, l’autorisation réelle reste montrée', () => {
    expect(exactRemindersRow('disabled', 'precise')).toEqual({
      isOn: true,
      hint: 'allowedNotificationsOff',
      notice: null,
    })
  })

  it.each([
    ['unasked', 'precise', true, 'allowedNotYetOn'],
    ['unasked', 'removed', false, 'offNotYetOn'],
    ['disabled', 'never-enabled', false, 'notificationsOff'],
    ['disabled', 'removed', false, 'offNotificationsOff'],
  ] as const)(
    'notifications %s, rappels précis %s : sans encart, rien ne sonne',
    (notifications, exact, isOn, hint) => {
      expect(exactRemindersRow(notifications, exact)).toEqual({ isOn, hint, notice: null })
    },
  )
})
