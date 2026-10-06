// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { REMINDER_DONE_ACTION_TYPE } from '@/core/notifications/reminder-actions'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { isInjectionNoted, vaccinationReminders } from '../logic/vaccination-reminders'

const t = i18n.global.t
const ID = '22222222-2222-4222-8222-222222222222'
type Reminded = Parameters<typeof vaccinationReminders>

const MILO: NonNullable<Reminded[2]> = { name: 'Milo', deletedAt: null }
const CHPPI: Reminded[1] = {
  id: ID,
  name: 'CHPPi',
  lastInjectionDate: '2025-10-15',
  dueDate: '2026-10-15',
  deletedAt: null,
}
const SETTINGS: CarnetReminderSettings = { vaccineReminderTime: '09:00', remindBeforeDue: true }
const NOW = new Date(2026, 8, 15, 12)

afterEach(() => {
  i18n.global.locale.value = 'fr'
})

/** Espaces insécables remplacées : les attentes s'écrivent au clavier. */
const typed = (text = '') => text.replace(/\s/gu, ' ')

function remindersOf(
  vaccination = CHPPI,
  { animal = MILO as Reminded[2], settings = SETTINGS } = {},
) {
  return vaccinationReminders(t, vaccination, animal, settings, NOW).care?.reminders ?? []
}

describe('vaccinationReminders', () => {
  it('RA-2 et RA-9 : 2 semaines avant, le jour même et 3 jours après, à l’heure des vaccins', () => {
    expect(
      remindersOf().map(({ key, title, body, at, actionTypeId }) => ({
        key,
        title: typed(title),
        body: typed(body),
        at,
        actionTypeId,
      })),
    ).toEqual([
      {
        key: `vaccination:${ID}:2026-10-15::before`,
        title: 'CHPPi de Milo dans 2 semaines',
        body: 'Le 15 oct. Pense à prendre rendez-vous chez le vétérinaire.',
        at: new Date(2026, 9, 1, 9),
        actionTypeId: undefined,
      },
      {
        key: `vaccination:${ID}:2026-10-15::due`,
        title: 'CHPPi de Milo aujourd’hui',
        body: 'Note le vaccin dans MémoPatte une fois fait.',
        at: new Date(2026, 9, 15, 9),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
      {
        key: `vaccination:${ID}:2026-10-15::overdue`,
        title: 'CHPPi de Milo en retard de 3 jours',
        body: 'Prends rendez-vous chez le vétérinaire, puis note le vaccin dans MémoPatte.',
        at: new Date(2026, 9, 18, 9),
        actionTypeId: REMINDER_DONE_ACTION_TYPE,
      },
    ])
  })

  it('suit l’heure des rappels de vaccins et « Me prévenir avant l’échéance »', () => {
    const settings = { vaccineReminderTime: '18:30', remindBeforeDue: false }

    expect(remindersOf(CHPPI, { settings }).map(({ at }) => at)).toEqual([
      new Date(2026, 9, 15, 18, 30),
      new Date(2026, 9, 18, 18, 30),
    ])
  })

  it('ne se répète pas : une fois la relance passée, plus rien pour cette échéance', () => {
    expect(remindersOf({ ...CHPPI, dueDate: '2026-09-12' })).toEqual([])
  })

  it('ne produit rien pour un vaccin sans rappel', () => {
    expect(remindersOf({ ...CHPPI, dueDate: null })).toEqual([])
  })

  it('ne produit rien pour un vaccin supprimé', () => {
    expect(remindersOf({ ...CHPPI, deletedAt: '2026-09-15T08:00:00.000Z' })).toEqual([])
  })

  it('ne produit rien quand l’animal est supprimé ou introuvable', () => {
    const deleted = { ...MILO, deletedAt: '2026-09-15T08:00:00.000Z' }

    expect(remindersOf(CHPPI, { animal: deleted })).toEqual([])
    expect(remindersOf(CHPPI, { animal: null })).toEqual([])
  })

  it('tient pour notée l’échéance que l’injection de tête a notée, quelle que soit l’heure', () => {
    const { isNoted } = vaccinationReminders(
      t,
      { ...CHPPI, lastInjectionDate: '2026-10-14', dueDate: '2027-10-14' },
      MILO,
      SETTINGS,
      NOW,
    )

    expect(isNoted('2026-10-15', null)).toBe(true)
    expect(isNoted('2027-10-14', null)).toBe(false)
  })
})

describe('isInjectionNoted', () => {
  const carre = { lastInjectionDate: '2025-10-15', dueDate: '2026-10-15' }

  it('reconnaît l’échéance que l’injection de tête a notée, rappel suivant choisi ou non', () => {
    expect(
      isInjectionNoted({ lastInjectionDate: '2026-10-13', dueDate: '2027-10-13' }, '2026-10-15'),
    ).toBe(true)
    expect(isInjectionNoted({ lastInjectionDate: '2026-10-16', dueDate: null }, '2026-10-15')).toBe(
      true,
    )
  })

  it('ne tient pas pour notée l’échéance encore attendue', () => {
    expect(isInjectionNoted(carre, '2026-10-15')).toBe(false)
  })

  it('ne tient pas pour notée une échéance déplacée sans injection', () => {
    expect(isInjectionNoted({ ...carre, dueDate: '2026-11-02' }, '2026-10-15')).toBe(false)
  })
})
