import { afterEach, describe, expect, it } from 'vitest'

import type { HomeReminderSource } from '../service/home-reminders.service'
import {
  dueBadge,
  nextReminderText,
  overdueBanner,
  reminderIcon,
  reminderRows,
  reminderType,
  scopeCounter,
  upToDateText,
} from '../logic/home-summary'
import i18n, { applyLocale } from '@/core/i18n'
import type { Reminder } from '@/shared/domain/reminders'

const t = i18n.global.t

function reminder(overrides: Partial<Reminder> = {}): Reminder {
  return {
    kind: 'vaccination',
    id: 'v1',
    animalId: 'milo',
    label: 'CHPPiL',
    dueDate: '2026-09-07',
    status: 'overdue',
    daysUntil: -2,
    ...overrides,
  }
}

describe('scopeCounter', () => {
  it('compte les rappels de tous les animaux, au singulier comme au pluriel', () => {
    expect(scopeCounter(t, { total: 3, animalName: null })).toBe('3 rappels')
    expect(scopeCounter(t, { total: 1, animalName: null })).toBe('1 rappel')
  })

  it('préfixe du prénom quand un animal est sélectionné', () => {
    expect(scopeCounter(t, { total: 2, animalName: 'Milo' })).toBe('Milo · 2 rappels')
  })

  it('n’écrit que le prénom quand l’animal sélectionné n’a aucun rappel', () => {
    expect(scopeCounter(t, { total: 0, animalName: 'Milo' })).toBe('Milo')
  })

  it('n’écrit rien en vue globale sans rappel', () => {
    expect(scopeCounter(t, { total: 0, animalName: null })).toBeNull()
  })
})

describe('overdueBanner', () => {
  it('reste absent sans retard', () => {
    expect(overdueBanner(t, 0)).toBeNull()
  })

  it('gère le pluriel', () => {
    expect(overdueBanner(t, 1)).toBe('1 rappel en retard')
    expect(overdueBanner(t, 2)).toBe('2 rappels en retard')
  })
})

describe('dueBadge', () => {
  it('écrit le retard en jours, sans icône', () => {
    expect(dueBadge(t, reminder({ status: 'overdue', daysUntil: -2 }))).toEqual({
      text: 'En retard · 2 j',
      icon: null,
    })
  })

  it('écrit Aujourd’hui avec l’icône today', () => {
    expect(dueBadge(t, reminder({ status: 'today', daysUntil: 0 }))).toEqual({
      text: 'Aujourd’hui',
      icon: 'ms:today',
    })
  })

  it('écrit Demain avec l’icône schedule', () => {
    expect(dueBadge(t, reminder({ status: 'tomorrow', daysUntil: 1 }))).toEqual({
      text: 'Demain',
      icon: 'ms:schedule',
    })
  })

  it('écrit Dans N jours avec l’icône schedule', () => {
    expect(dueBadge(t, reminder({ status: 'later', daysUntil: 3 }))).toEqual({
      text: 'Dans 3 jours',
      icon: 'ms:schedule',
    })
  })
})

describe('reminderType et reminderIcon', () => {
  it('donne le type d’un vaccin', () => {
    const source = reminder()
    expect(reminderType(t, { ...source, treatmentType: null })).toBe('Vaccin')
    expect(reminderIcon({ ...source, treatmentType: null })).toBe('ms:vaccines')
  })

  it('donne le type d’un traitement', () => {
    const deworming = {
      ...reminder({ kind: 'treatment', label: 'Milbemax' }),
      treatmentType: 'deworming' as const,
    }
    const antiparasitic = {
      ...reminder({ kind: 'treatment', label: 'Bravecto' }),
      treatmentType: 'antiparasitic' as const,
    }

    expect(reminderType(t, deworming)).toBe('Vermifuge')
    expect(reminderIcon(deworming)).toBe('ms:medication')
    expect(reminderType(t, antiparasitic)).toBe('Antiparasitaire')
    expect(reminderIcon(antiparasitic)).toBe('ms:pest_control')
  })
})

describe('upToDateText', () => {
  it('nomme l’animal sélectionné', () => {
    expect(upToDateText(t, { animalName: 'Milo', allNames: ['Milo', 'Luna'] })).toBe(
      'Aucun rappel à venir pour Milo.',
    )
  })

  it('liste les animaux en vue globale', () => {
    expect(upToDateText(t, { animalName: null, allNames: ['Milo', 'Luna'] })).toBe(
      'Milo et Luna n’ont aucun rappel à venir.',
    )
    expect(upToDateText(t, { animalName: null, allNames: ['Milo', 'Luna', 'Nala'] })).toBe(
      'Milo, Luna et Nala n’ont aucun rappel à venir.',
    )
  })
})

describe('reminderRows', () => {
  const names = new Map([
    ['milo', 'Milo'],
    ['luna', 'Luna'],
  ])

  const reminders: Reminder<HomeReminderSource>[] = [
    { ...reminder(), treatmentType: null },
    {
      ...reminder({ kind: 'treatment', id: 't1', animalId: 'luna', label: 'Milbemax' }),
      status: 'today',
      daysUntil: 0,
      treatmentType: 'deworming',
    },
  ]

  it('titre chaque ligne du nom du produit, type et animal dessous', () => {
    expect(reminderRows(t, reminders, { animalNames: names, showAnimal: true })).toEqual([
      {
        id: 'v1',
        kind: 'vaccination',
        status: 'overdue',
        icon: 'ms:vaccines',
        title: 'CHPPiL',
        subtitle: 'Vaccin · Milo',
        badge: { text: 'En retard · 2 j', icon: null },
        ariaLabel: 'CHPPiL, vaccin, Milo, en retard de 2 jours. Ouvre les actions.',
      },
      {
        id: 't1',
        kind: 'treatment',
        status: 'today',
        icon: 'ms:medication',
        title: 'Milbemax',
        subtitle: 'Vermifuge · Luna',
        badge: { text: 'Aujourd’hui', icon: 'ms:today' },
        ariaLabel: 'Milbemax, vermifuge, Luna, aujourd’hui. Ouvre les actions.',
      },
    ])
  })

  it('annonce une échéance à venir avec son délai et sa date', () => {
    const bravecto: Reminder<HomeReminderSource> = {
      ...reminder({ kind: 'treatment', id: 't2', label: 'Bravecto', dueDate: '2026-09-28' }),
      status: 'later',
      daysUntil: 5,
      treatmentType: 'deworming',
    }

    expect(
      reminderRows(t, [bravecto], { animalNames: names, showAnimal: true })[0]?.ariaLabel,
    ).toBe('Bravecto, vermifuge, Milo, dans 5 jours, le 28 septembre. Ouvre les actions.')
  })

  it('titre un vaccin du nom saisi seul, sans « vaccin » redoublé, dans les deux langues', () => {
    const antirabique: Reminder<HomeReminderSource> = {
      ...reminder({ label: 'Vaccin antirabique' }),
      treatmentType: null,
    }

    expect(
      reminderRows(t, [antirabique], { animalNames: names, showAnimal: false })[0],
    ).toMatchObject({ title: 'Vaccin antirabique', subtitle: 'Vaccin' })

    applyLocale('en')
    expect(
      reminderRows(t, [{ ...antirabique, label: 'Rabies vaccine' }], {
        animalNames: names,
        showAnimal: false,
      })[0],
    ).toMatchObject({ title: 'Rabies vaccine', subtitle: 'Vaccine' })
    applyLocale('fr')
  })

  it('masque le nom de l’animal quand un animal est sélectionné', () => {
    const rows = reminderRows(t, reminders, { animalNames: names, showAnimal: false })
    expect(rows.map((row) => row.subtitle)).toEqual(['Vaccin', 'Vermifuge'])
    expect(rows[1]?.ariaLabel).toBe('Milbemax, vermifuge, aujourd’hui. Ouvre les actions.')
  })
})

describe('nextReminderText', () => {
  const names = new Map([
    ['milo', 'Milo'],
    ['luna', 'Luna'],
  ])

  const carre: Reminder<HomeReminderSource> = {
    ...reminder({ label: 'Carré', dueDate: '2027-08-26', status: 'later', daysUntil: 351 }),
    treatmentType: null,
  }

  const vermifuge: Reminder<HomeReminderSource> = {
    ...reminder({
      kind: 'treatment',
      id: 't1',
      animalId: 'luna',
      label: 'Milbemax',
      dueDate: '2026-11-08',
      status: 'later',
      daysUntil: 60,
    }),
    treatmentType: 'deworming',
  }

  afterEach(() => applyLocale('fr'))

  it('annonce le rappel et sa date, sans l’animal quand un seul animal est affiché', () => {
    expect(nextReminderText(t, carre, { animalNames: names, showAnimal: false })).toBe(
      'Prochain rappel\u00a0: Carré le 26\u00a0août\u00a02027',
    )
  })

  it('nomme le produit et l’animal dans la vue de plusieurs animaux', () => {
    expect(nextReminderText(t, vermifuge, { animalNames: names, showAnimal: true })).toBe(
      'Prochain rappel\u00a0: Milbemax pour Luna le 8\u00a0nov.\u00a02026',
    )
  })

  it('garde la date d’un seul tenant, espaces insécables compris', () => {
    const text = nextReminderText(t, carre, { animalNames: names, showAnimal: false })

    expect(text).toMatch(/le 26\u00a0août\u00a02027$/)
    expect(text?.split(' ').at(-1)).toBe('26\u00a0août\u00a02027')
  })

  it('n’annonce rien sans rappel au-delà de la fenêtre', () => {
    expect(nextReminderText(t, null, { animalNames: names, showAnimal: true })).toBeNull()
  })

  it('omet l’animal quand son prénom est introuvable', () => {
    expect(
      nextReminderText(t, { ...carre, animalId: 'nala' }, { animalNames: names, showAnimal: true }),
    ).toBe('Prochain rappel\u00a0: Carré le 26\u00a0août\u00a02027')
  })

  it('suit la langue courante, date comprise', () => {
    applyLocale('en')

    expect(nextReminderText(t, carre, { animalNames: names, showAnimal: false })).toBe(
      'Next reminder: Carré on Aug\u00a026,\u00a02027',
    )
    expect(nextReminderText(t, vermifuge, { animalNames: names, showAnimal: true })).toBe(
      'Next reminder: Milbemax for Luna on Nov\u00a08,\u00a02026',
    )
  })
})
