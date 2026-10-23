// @vitest-environment node
import { describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { vaccinationReminderPlan, type CarnetReminderSettings } from '../domain/reminder-plan'

const t = i18n.global.t
const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }
const VACCINATION = {
  id: '55555555-5555-4555-8555-555555555555',
  name: 'Rage',
  animalName: 'Pixel',
  dueDate: '2026-03-10',
}

function beforeBody(now: Date): string {
  const { reminders } = vaccinationReminderPlan(t, VACCINATION, SETTINGS, now)
  return reminders.find(({ key }) => key.endsWith('::before'))!.body.replace(/\s/gu, ' ')
}

describe('vaccinationReminderPlan : l’année affichée suit le jour civil local', () => {
  it('le 1er janvier à 00 h 30, une échéance de la même année s’écrit sans l’année', () => {
    expect(beforeBody(new Date(2026, 0, 1, 0, 30))).toBe(
      'Le 10 mars. Pense à prendre rendez-vous chez le vétérinaire.',
    )
  })

  it('le 31 décembre à 23 h 30, une échéance de l’année suivante s’écrit avec l’année', () => {
    expect(beforeBody(new Date(2025, 11, 31, 23, 30))).toBe(
      'Le 10 mars 2026. Pense à prendre rendez-vous chez le vétérinaire.',
    )
  })
})
