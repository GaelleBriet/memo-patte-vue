import { afterEach, describe, expect, it } from 'vitest'

import type { TodoDueItem, TodoItem } from '../logic/todo-items'
import {
  dueBadge,
  nextReminderText,
  overdueBanner,
  reminderIcon,
  reminderRows,
  reminderType,
  rowToReopen,
  scopeCounter,
  upToDateText,
} from '../logic/home-summary'
import i18n, { applyLocale } from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t

function reminder(overrides: Partial<TodoDueItem> = {}): TodoDueItem {
  return {
    group: 'due',
    key: 'vaccination:v1',
    kind: 'vaccination',
    id: 'v1',
    animalId: 'milo',
    label: 'CHPPiL',
    treatmentType: null,
    dueOn: '2026-09-07',
    dueTime: null,
    status: 'overdue',
    daysUntil: -2,
    ...overrides,
  }
}

const TO_LOG: TodoItem = {
  group: 'to-log',
  key: 'treatment:t3:unlogged',
  kind: 'treatment',
  id: 't3',
  animalId: 'luna',
  label: 'Métacam',
  treatmentType: 'medication',
  unlogged: 3,
  oldest: { dueOn: '2026-09-02', dueTime: '20:00' },
}

const UNREADABLE: TodoItem = {
  group: 'unreadable',
  key: 'treatment:t4',
  kind: 'treatment',
  id: 't4',
  animalId: 'milo',
  label: 'Panacur',
  treatmentType: 'deworming',
}

describe('scopeCounter', () => {
  it('compte les soins de tous les animaux, au singulier comme au pluriel (Accueil Q5)', () => {
    expect(scopeCounter(t, { total: 3, animalName: null })).toBe('3 soins')
    expect(scopeCounter(t, { total: 1, animalName: null })).toBe('1 soin')
  })

  it('préfixe du prénom quand un animal est sélectionné', () => {
    expect(scopeCounter(t, { total: 2, animalName: 'Milo' })).toBe('Milo · 2 soins')
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
    expect(overdueBanner(t, 1)).toBe('1 soin en retard')
    expect(overdueBanner(t, 2)).toBe('2 soins en retard')
  })
})

describe('dueBadge', () => {
  it('écrit le retard en jours, sans icône', () => {
    expect(dueBadge(t, reminder({ status: 'overdue', daysUntil: -2 }))).toEqual({
      text: 'En retard · 2 j',
      icon: null,
      status: 'overdue',
    })
  })

  it('écrit Aujourd’hui avec l’icône today', () => {
    expect(dueBadge(t, reminder({ status: 'today', daysUntil: 0 }))).toEqual({
      text: 'Aujourd’hui',
      icon: 'ms:today',
      status: 'today',
    })
  })

  it('garde l’heure d’une dose du jour (AC-7)', () => {
    expect(dueBadge(t, reminder({ status: 'today', daysUntil: 0, dueTime: '20:00' }))).toEqual({
      text: 'Aujourd’hui · 20\u00a0h',
      icon: 'ms:today',
      status: 'today',
    })
    applyLocale('en')
    expect(dueBadge(t, reminder({ status: 'today', daysUntil: 0, dueTime: '20:00' })).text).toBe(
      'Today · 8\u00a0pm',
    )
    applyLocale('fr')
  })

  it('écrit une journée en retard sans heure, même pour une dose à heure (Q5)', () => {
    expect(dueBadge(t, reminder({ daysUntil: -1, dueTime: '08:00' })).text).toBe('En retard · 1 j')
  })

  it('écrit « À renseigner » au contour turquoise, « Donnée illisible » en neutre', () => {
    expect(dueBadge(t, TO_LOG)).toEqual({ text: 'À renseigner', icon: null, status: 'to-log' })
    expect(dueBadge(t, UNREADABLE)).toEqual({
      text: 'Donnée illisible',
      icon: null,
      status: 'none',
    })
  })

  it('écrit Demain avec l’icône schedule', () => {
    expect(dueBadge(t, reminder({ status: 'tomorrow', daysUntil: 1 }))).toEqual({
      text: 'Demain',
      icon: 'ms:schedule',
      status: 'tomorrow',
    })
  })

  it('écrit Dans N jours avec l’icône schedule', () => {
    expect(dueBadge(t, reminder({ status: 'later', daysUntil: 3 }))).toEqual({
      text: 'Dans 3 jours',
      icon: 'ms:schedule',
      status: 'later',
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

  it('donne le type et l’icône d’un médicament', () => {
    const medication = {
      ...reminder({ kind: 'treatment', label: 'Métacam' }),
      treatmentType: 'medication' as const,
    }

    expect(reminderType(t, medication)).toBe('Médicament')
    expect(reminderIcon(medication)).toBe('ms:medication')
  })
})

describe('upToDateText', () => {
  it('nomme l’animal sélectionné', () => {
    expect(upToDateText(t, { animalName: 'Milo', allNames: ['Milo', 'Luna'] })).toBe(
      'Aucun soin à venir pour Milo.',
    )
  })

  it('liste les animaux en vue globale', () => {
    expect(upToDateText(t, { animalName: null, allNames: ['Milo', 'Luna'] })).toBe(
      'Milo et Luna n’ont aucun soin à venir.',
    )
    expect(upToDateText(t, { animalName: null, allNames: ['Milo', 'Luna', 'Nala'] })).toBe(
      'Milo, Luna et Nala n’ont aucun soin à venir.',
    )
  })
})

describe('reminderRows', () => {
  const names = new Map([
    ['milo', 'Milo'],
    ['luna', 'Luna'],
  ])

  const milbemax = reminder({
    key: 'treatment:t1:2026-09-09',
    kind: 'treatment',
    id: 't1',
    animalId: 'luna',
    label: 'Milbemax',
    treatmentType: 'deworming',
    dueOn: '2026-09-09',
    status: 'today',
    daysUntil: 0,
  })

  it('titre chaque ligne du nom du produit, type et animal dessous', () => {
    expect(
      reminderRows(t, [reminder(), milbemax], { animalNames: names, showAnimal: true }),
    ).toEqual([
      {
        key: 'vaccination:v1',
        group: 'due',
        request: { kind: 'vaccination', id: 'v1', due: null },
        opens: 'sheet',
        tone: 'overdue',
        icon: 'ms:vaccines',
        title: 'CHPPiL',
        subtitle: 'Vaccin · Milo',
        unlogged: null,
        badge: { text: 'En retard · 2 j', icon: null, status: 'overdue' },
        ariaLabel: 'CHPPiL, vaccin, Milo, en retard de 2 jours. Ouvre les actions.',
      },
      {
        key: 'treatment:t1:2026-09-09',
        group: 'due',
        request: { kind: 'treatment', id: 't1', due: { dueOn: '2026-09-09', dueTime: null } },
        opens: 'sheet',
        tone: 'today',
        icon: 'ms:medication',
        title: 'Milbemax',
        subtitle: 'Vermifuge · Luna',
        unlogged: null,
        badge: { text: 'Aujourd’hui', icon: 'ms:today', status: 'today' },
        ariaLabel: 'Milbemax, vermifuge, Luna, aujourd’hui. Ouvre les actions.',
      },
    ])
  })

  it('porte l’échéance de la ligne dans la requête de la feuille, heure comprise', () => {
    const soir = { ...milbemax, key: 'treatment:t1:2026-09-09T20:00', dueTime: '20:00' }

    const [row] = reminderRows(t, [soir], { animalNames: names, showAnimal: true })

    expect(row?.request).toEqual({
      kind: 'treatment',
      id: 't1',
      due: { dueOn: '2026-09-09', dueTime: '20:00' },
    })
    expect(row?.ariaLabel).toBe('Milbemax, vermifuge, Luna, aujourd’hui à 20 h. Ouvre les actions.')
  })

  it('nomme l’heure d’une dose en retard pour TalkBack, sans la mettre dans le badge (Q5)', () => {
    const matin = reminder({ kind: 'treatment', label: 'Métacam', daysUntil: -1, dueTime: '08:00' })
    const options = { animalNames: names, showAnimal: false }

    expect(reminderRows(t, [matin], options)[0]).toMatchObject({
      badge: { text: 'En retard · 1 j' },
      ariaLabel: 'Métacam, vermifuge, en retard de 1 jour, prise de 8 h. Ouvre les actions.',
    })
    applyLocale('en')
    expect(reminderRows(t, [matin], options)[0]?.ariaLabel).toBe(
      'Métacam, dewormer, 1 day overdue, 8 am dose. Opens actions.',
    )
    applyLocale('fr')
  })

  it('annonce une échéance à venir avec son délai et sa date', () => {
    const bravecto = reminder({
      kind: 'treatment',
      id: 't2',
      label: 'Bravecto',
      treatmentType: 'deworming',
      dueOn: '2026-09-28',
      status: 'later',
      daysUntil: 5,
    })

    expect(
      plain(reminderRows(t, [bravecto], { animalNames: names, showAnimal: true })[0]?.ariaLabel),
    ).toBe('Bravecto, vermifuge, Milo, dans 5 jours, le 28 septembre. Ouvre les actions.')
  })

  it('« À renseigner » : badge, nombre de doses sous le type, groupe à part (AC-8)', () => {
    expect(reminderRows(t, [TO_LOG], { animalNames: names, showAnimal: true })).toEqual([
      {
        key: 'treatment:t3:unlogged',
        group: 'to-log',
        request: { kind: 'treatment', id: 't3', due: 'unlogged' },
        opens: 'sheet',
        tone: 'to-log',
        icon: 'ms:medication',
        title: 'Métacam',
        subtitle: 'Médicament · Luna',
        unlogged: '3 doses non renseignées',
        badge: { text: 'À renseigner', icon: null, status: 'to-log' },
        ariaLabel:
          'Métacam, médicament, Luna, à renseigner, 3 doses non renseignées. Ouvre les actions.',
      },
    ])
  })

  it('accorde « À renseigner » au singulier, et le dit en anglais', () => {
    const one = { ...TO_LOG, unlogged: 1 }

    expect(reminderRows(t, [one], { animalNames: names, showAnimal: false })[0]).toMatchObject({
      unlogged: '1 dose non renseignée',
      ariaLabel: 'Métacam, médicament, à renseigner, 1 dose non renseignée. Ouvre les actions.',
    })
    applyLocale('en')
    expect(reminderRows(t, [TO_LOG], { animalNames: names, showAnimal: true })[0]).toMatchObject({
      unlogged: '3 doses not logged',
      badge: { text: 'To log' },
      ariaLabel: 'Métacam, medication, Luna, to log, 3 doses not logged. Opens actions.',
    })
    applyLocale('fr')
  })

  it('traitement illisible : ligne neutre « Donnée illisible » qui ouvre la fiche (B2)', () => {
    expect(reminderRows(t, [UNREADABLE], { animalNames: names, showAnimal: true })).toEqual([
      expect.objectContaining({
        group: 'due',
        request: { kind: 'treatment', id: 't4', due: null },
        opens: 'detail',
        tone: 'unreadable',
        subtitle: 'Vermifuge · Milo',
        unlogged: null,
        badge: { text: 'Donnée illisible', icon: null, status: 'none' },
        ariaLabel: 'Panacur, vermifuge, Milo, donnée illisible. Ouvre le traitement.',
      }),
    ])
  })

  it('titre un vaccin du nom saisi seul, sans « vaccin » redoublé, dans les deux langues', () => {
    const antirabique = reminder({ label: 'Vaccin antirabique' })

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
    const rows = reminderRows(t, [reminder(), milbemax, UNREADABLE], {
      animalNames: names,
      showAnimal: false,
    })
    expect(rows.map((row) => row.subtitle)).toEqual(['Vaccin', 'Vermifuge', 'Vermifuge'])
    expect(rows[1]?.ariaLabel).toBe('Milbemax, vermifuge, aujourd’hui. Ouvre les actions.')
    expect(rows[2]?.ariaLabel).toBe('Panacur, vermifuge, donnée illisible. Ouvre le traitement.')
  })
})

describe('rowToReopen', () => {
  const names = { animalNames: new Map([['luna', 'Luna']]), showAnimal: true }
  const metacam = (dueTime: string) =>
    reminder({
      key: `treatment:t3:2026-09-09T${dueTime}`,
      kind: 'treatment',
      id: 't3',
      animalId: 'luna',
      label: 'Métacam',
      treatmentType: 'medication',
      dueOn: '2026-09-09',
      dueTime,
      status: 'today',
      daysUntil: 0,
    })
  const rows = reminderRows(t, [metacam('08:00'), metacam('20:00'), TO_LOG, UNREADABLE], names)
  const ref = { kind: 'treatment' as const, id: 't3' }

  it('la ligne de l’échéance demandée', () => {
    expect(rowToReopen(rows, { ...ref, due: { dueOn: '2026-09-09', dueTime: '20:00' } })?.key).toBe(
      'treatment:t3:2026-09-09T20:00',
    )
    expect(rowToReopen(rows, { ...ref, due: 'unlogged' })?.key).toBe('treatment:t3:unlogged')
  })

  it('la première ligne du soin sans échéance, ou quand la sienne a quitté la liste', () => {
    expect(rowToReopen(rows, ref)?.key).toBe('treatment:t3:2026-09-09T08:00')
    expect(rowToReopen(rows, { ...ref, due: { dueOn: '2026-09-01', dueTime: '08:00' } })?.key).toBe(
      'treatment:t3:2026-09-09T08:00',
    )
  })

  it('jamais une ligne qui ouvre la fiche', () => {
    expect(rowToReopen(rows, { kind: 'treatment', id: 't4' })).toBeUndefined()
  })
})

describe('nextReminderText', () => {
  const names = new Map([
    ['milo', 'Milo'],
    ['luna', 'Luna'],
  ])

  const carre = reminder({ label: 'Carré', dueOn: '2027-08-26', status: 'later', daysUntil: 351 })

  const vermifuge = reminder({
    kind: 'treatment',
    id: 't1',
    animalId: 'luna',
    label: 'Milbemax',
    treatmentType: 'deworming',
    dueOn: '2026-11-08',
    status: 'later',
    daysUntil: 60,
  })

  afterEach(() => applyLocale('fr'))

  it('annonce le soin et sa date, sans l’animal quand un seul animal est affiché', () => {
    expect(nextReminderText(t, carre, { animalNames: names, showAnimal: false })).toBe(
      'Prochain soin : Carré le 26 août 2027',
    )
  })

  it('nomme le produit et l’animal dans la vue de plusieurs animaux', () => {
    expect(nextReminderText(t, vermifuge, { animalNames: names, showAnimal: true })).toBe(
      'Prochain soin : Milbemax pour Luna le 8 nov. 2026',
    )
  })

  it('garde la date d’un seul tenant, espaces insécables compris', () => {
    const text = nextReminderText(t, carre, { animalNames: names, showAnimal: false })

    expect(text).toMatch(/le 26 août 2027$/)
    expect(text?.split(' ').at(-1)).toBe('26 août 2027')
  })

  it('n’annonce rien sans soin au-delà de la fenêtre', () => {
    expect(nextReminderText(t, null, { animalNames: names, showAnimal: true })).toBeNull()
  })

  it('omet l’animal quand son prénom est introuvable', () => {
    expect(
      nextReminderText(t, { ...carre, animalId: 'nala' }, { animalNames: names, showAnimal: true }),
    ).toBe('Prochain soin : Carré le 26 août 2027')
  })

  it('suit la langue courante, date comprise', () => {
    applyLocale('en')

    expect(nextReminderText(t, carre, { animalNames: names, showAnimal: false })).toBe(
      'Next reminder: Carré on Aug 26, 2027',
    )
    expect(nextReminderText(t, vermifuge, { animalNames: names, showAnimal: true })).toBe(
      'Next reminder: Milbemax for Luna on Nov 8, 2026',
    )
  })
})
