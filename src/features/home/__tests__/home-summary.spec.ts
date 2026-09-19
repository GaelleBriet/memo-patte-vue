import { describe, expect, it } from 'vitest'

import type { HomeReminderSource } from '../home-reminders.service'
import {
  dueBadge,
  overdueBanner,
  reminderIcon,
  reminderRows,
  reminderTitle,
  scopeCounter,
  upToDateText,
} from '../home-summary'
import i18n from '@/core/i18n'
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

describe('reminderTitle et reminderIcon', () => {
  it('nomme un vaccin par le nom saisi, sans préfixe de type', () => {
    const source = reminder()
    expect(reminderTitle(t, { ...source, treatmentType: null })).toBe('CHPPiL')
    expect(reminderIcon({ ...source, treatmentType: null })).toBe('ms:vaccines')
  })

  it('nomme un traitement par son type, pas par son produit', () => {
    const deworming = {
      ...reminder({ kind: 'treatment', label: 'Milbemax' }),
      treatmentType: 'deworming' as const,
    }
    const antiparasitic = {
      ...reminder({ kind: 'treatment', label: 'Bravecto' }),
      treatmentType: 'antiparasitic' as const,
    }

    expect(reminderTitle(t, deworming)).toBe('Vermifuge')
    expect(reminderIcon(deworming)).toBe('ms:medication')
    expect(reminderTitle(t, antiparasitic)).toBe('Antiparasitaire')
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

  it('accorde au singulier avec un seul animal', () => {
    expect(upToDateText(t, { animalName: null, allNames: ['Milo'] })).toBe(
      'Milo n’a aucun rappel à venir.',
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

  it('compose titre, icône, animal et badge de chaque ligne', () => {
    expect(reminderRows(t, reminders, { animalNames: names, showAnimal: true })).toEqual([
      {
        id: 'v1',
        status: 'overdue',
        icon: 'ms:vaccines',
        title: 'CHPPiL',
        animalName: 'Milo',
        badge: { text: 'En retard · 2 j', icon: null },
      },
      {
        id: 't1',
        status: 'today',
        icon: 'ms:medication',
        title: 'Vermifuge',
        animalName: 'Luna',
        badge: { text: 'Aujourd’hui', icon: 'ms:today' },
      },
    ])
  })

  it('masque le nom de l’animal quand un animal est sélectionné', () => {
    const rows = reminderRows(t, reminders, { animalNames: names, showAnimal: false })
    expect(rows.map((row) => row.animalName)).toEqual([null, null])
  })
})
