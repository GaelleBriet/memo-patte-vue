// @vitest-environment node
import { afterEach, describe, expect, it } from 'vitest'

import i18n from '@/core/i18n'
import { REMINDER_DONE_ACTION_TYPE } from '@/core/notifications/reminder-actions'
import type { CarnetReminderSettings } from '@/shared/domain/reminder-plan'
import { isInjectionNoted, vaccinationReminders } from '../domain/vaccination-reminders'

const t = i18n.global.t
const ID = '22222222-2222-4222-8222-222222222222'
type Reminded = Parameters<typeof vaccinationReminders>

const MILO: NonNullable<Reminded[2]> = { name: 'Milo', deletedAt: null, unfollowedOn: null }
const CHPPI: Reminded[1] = {
  id: ID,
  name: 'CHPPi',
  lastInjectionDate: '2025-10-15',
  dueDate: '2026-10-15',
  deletedAt: null,
  replacedDues: [],
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

  it('AN-9 : ne produit rien pour un animal qu’on ne suit plus', () => {
    expect(remindersOf(CHPPI, { animal: { ...MILO, unfollowedOn: '2026-09-15' } })).toEqual([])
  })

  it('tient pour notée une échéance qu’une injection plus récente a remplacée, quelle que soit l’heure', () => {
    const { isNoted } = vaccinationReminders(
      t,
      {
        ...CHPPI,
        lastInjectionDate: '2026-10-01',
        dueDate: '2027-10-01',
        replacedDues: ['2026-10-15'],
      },
      MILO,
      SETTINGS,
      NOW,
    )

    expect(isNoted('2026-10-15', null)).toBe(true)
    expect(isNoted('2027-10-01', null)).toBe(false)
  })
})

describe('isInjectionNoted', () => {
  const carre = {
    lastInjectionDate: '2027-03-01',
    dueDate: '2027-03-01',
    replacedDues: ['2027-03-15'],
  }

  it('VA-8 : l’échéance du 15 mars est notée par l’injection du 1er mars, sans fenêtre de 3 jours', () => {
    expect(isInjectionNoted(carre, '2027-03-15')).toBe(true)
    expect(isInjectionNoted({ ...carre, dueDate: null }, '2027-03-15')).toBe(true)
  })

  it('ne tient pas pour notée l’échéance encore attendue', () => {
    expect(isInjectionNoted({ ...carre, replacedDues: [] }, '2027-03-01')).toBe(false)
    expect(isInjectionNoted({ ...carre, replacedDues: ['2027-03-01'] }, '2027-03-01')).toBe(false)
  })

  it('ne tient pas pour notée une échéance déplacée sans injection', () => {
    const reporte = { lastInjectionDate: '2026-03-15', dueDate: '2027-04-15', replacedDues: [] }

    expect(isInjectionNoted(reporte, '2027-03-15')).toBe(false)
  })

  it('#657 : le rappel du 15 mars reporté au 20 est noté par l’injection du 18', () => {
    const reporte = { lastInjectionDate: '2027-03-18', dueDate: '2028-03-18' }

    expect(isInjectionNoted({ ...reporte, replacedDues: ['2027-03-20'] }, '2027-03-15')).toBe(true)
    expect(isInjectionNoted({ ...reporte, replacedDues: ['2027-03-20'] }, '2027-03-20')).toBe(true)
  })

  it('#657 : une injection faite avant la date d’origine, après un report, ne la note pas', () => {
    const reporte = { lastInjectionDate: '2027-03-10', dueDate: '2028-03-10' }

    expect(isInjectionNoted({ ...reporte, replacedDues: ['2027-03-20'] }, '2027-03-15')).toBe(false)
  })

  it('#657 : un rappel court reporté sans injection reste non noté', () => {
    const reporte = { lastInjectionDate: '2027-03-05', dueDate: '2027-03-20', replacedDues: [] }

    expect(isInjectionNoted(reporte, '2027-03-15')).toBe(false)
  })

  it('note un rendez-vous remplacé par une injection faite plus de deux semaines avant', () => {
    const remplace = {
      lastInjectionDate: '2027-03-01',
      dueDate: '2028-03-01',
      replacedDues: ['2027-04-15'],
    }

    expect(isInjectionNoted(remplace, '2027-04-15')).toBe(true)
  })
})
