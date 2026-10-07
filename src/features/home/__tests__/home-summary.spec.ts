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
    firstVaccine: false,
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
  firstVaccine: false,
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
  firstVaccine: false,
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

describe('dueBadge — vaccin jamais fait (Vaccins Q1 bis, VA-18)', () => {
  const premier = (overrides: Partial<TodoDueItem>) =>
    reminder({ firstVaccine: true, dueOn: '2026-10-05', ...overrides })

  afterEach(() => applyLocale('fr'))

  it('écrit « Prévu le 5 oct. » au contour neutre, sans icône, demain comme plus tard', () => {
    expect(dueBadge(t, premier({ status: 'later', daysUntil: 12 }))).toEqual({
      text: 'Prévu le 5 oct.',
      icon: null,
      status: 'planned',
    })
    expect(dueBadge(t, premier({ status: 'tomorrow', daysUntil: 1 })).status).toBe('planned')
  })

  it('écrit « Aujourd’hui » le jour du rendez-vous, puis le retard', () => {
    expect(dueBadge(t, premier({ status: 'today', daysUntil: 0 }))).toEqual({
      text: 'Aujourd’hui',
      icon: 'ms:today',
      status: 'today',
    })
    expect(dueBadge(t, premier({ status: 'overdue', daysUntil: -1 })).text).toBe('En retard · 1 j')
  })

  it('suit la langue courante', () => {
    applyLocale('en')

    expect(dueBadge(t, premier({ status: 'later', daysUntil: 12 })).text).toBe('Planned Oct 5')
  })
})

describe('reminderType et reminderIcon', () => {
  afterEach(() => applyLocale('fr'))

  it('donne le type d’un vaccin jamais fait', () => {
    const source = reminder({ firstVaccine: true })
    expect(reminderType(t, source)).toBe('Premier vaccin')
    expect(reminderIcon(source)).toBe('ms:vaccines')
    applyLocale('en')
    expect(reminderType(t, source)).toBe('First vaccine')
  })

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
    expect(reminderRows(t, [reminder(), milbemax], { animalNames: names })).toEqual([
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

    const [row] = reminderRows(t, [soir], { animalNames: names })

    expect(row?.request).toEqual({
      kind: 'treatment',
      id: 't1',
      due: { dueOn: '2026-09-09', dueTime: '20:00' },
    })
    expect(row?.ariaLabel).toBe('Milbemax, vermifuge, Luna, aujourd’hui à 20 h. Ouvre les actions.')
  })

  it('nomme l’heure d’une dose en retard pour TalkBack, sans la mettre dans le badge (Q5)', () => {
    const matin = reminder({ kind: 'treatment', label: 'Métacam', daysUntil: -1, dueTime: '08:00' })
    const options = { animalNames: names }

    expect(reminderRows(t, [matin], options)[0]).toMatchObject({
      badge: { text: 'En retard · 1 j' },
      ariaLabel: 'Métacam, vermifuge, Milo, en retard de 1 jour, prise de 8 h. Ouvre les actions.',
    })
    applyLocale('en')
    expect(reminderRows(t, [matin], options)[0]?.ariaLabel).toBe(
      'Métacam, dewormer, Milo, 1 day overdue, 8 am dose. Opens actions.',
    )
    applyLocale('fr')
  })

  describe('vaccin jamais fait', () => {
    const typhus = reminder({
      key: 'vaccination:v9',
      id: 'v9',
      animalId: 'luna',
      label: 'Typhus, coryza',
      firstVaccine: true,
      dueOn: '2026-10-05',
      status: 'later',
      daysUntil: 12,
    })

    afterEach(() => applyLocale('fr'))

    it('« Premier vaccin · Luna », « Prévu le 5 oct. », et la feuille du vaccin (AC-8)', () => {
      const [row] = reminderRows(t, [typhus], { animalNames: names })

      expect(row).toMatchObject({
        group: 'due',
        request: { kind: 'vaccination', id: 'v9', due: null },
        opens: 'sheet',
        tone: 'planned',
        icon: 'ms:vaccines',
        title: 'Typhus, coryza',
        subtitle: 'Premier vaccin · Luna',
        badge: { text: 'Prévu le 5 oct.', status: 'planned' },
        ariaLabel: 'Typhus, coryza, premier vaccin, Luna, prévu le 5 octobre. Ouvre les actions.',
      })
    })

    it('garde « Premier vaccin » le jour même et en retard', () => {
      const rows = reminderRows(
        t,
        [
          { ...typhus, status: 'today', daysUntil: 0 },
          { ...typhus, status: 'overdue', daysUntil: -2 },
        ],
        { animalNames: names },
      )

      expect(rows.map(({ subtitle, tone, ariaLabel }) => [subtitle, tone, ariaLabel])).toEqual([
        [
          'Premier vaccin · Luna',
          'today',
          'Typhus, coryza, premier vaccin, Luna, aujourd’hui. Ouvre les actions.',
        ],
        [
          'Premier vaccin · Luna',
          'overdue',
          'Typhus, coryza, premier vaccin, Luna, en retard de 2 jours. Ouvre les actions.',
        ],
      ])
    })

    it('en anglais', () => {
      applyLocale('en')

      expect(reminderRows(t, [typhus], { animalNames: names })[0]).toMatchObject({
        subtitle: 'First vaccine · Luna',
        badge: { text: 'Planned Oct 5' },
        ariaLabel: 'Typhus, coryza, first vaccine, Luna, planned for October 5. Opens actions.',
      })
    })
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

    expect(plain(reminderRows(t, [bravecto], { animalNames: names })[0]?.ariaLabel)).toBe(
      'Bravecto, vermifuge, Milo, dans 5 jours, le 28 septembre. Ouvre les actions.',
    )
  })

  it('« À renseigner » : badge, nombre de doses sous le type, groupe à part (AC-8)', () => {
    expect(reminderRows(t, [TO_LOG], { animalNames: names })).toEqual([
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

    expect(reminderRows(t, [one], { animalNames: names })[0]).toMatchObject({
      unlogged: '1 dose non renseignée',
      ariaLabel:
        'Métacam, médicament, Luna, à renseigner, 1 dose non renseignée. Ouvre les actions.',
    })
    applyLocale('en')
    expect(reminderRows(t, [TO_LOG], { animalNames: names })[0]).toMatchObject({
      unlogged: '3 doses not logged',
      badge: { text: 'To log' },
      ariaLabel: 'Métacam, medication, Luna, to log, 3 doses not logged. Opens actions.',
    })
    applyLocale('fr')
  })

  it('traitement illisible : ligne neutre « Donnée illisible » qui ouvre la fiche (B2)', () => {
    expect(reminderRows(t, [UNREADABLE], { animalNames: names })).toEqual([
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

    expect(reminderRows(t, [antirabique], { animalNames: names })[0]).toMatchObject({
      title: 'Vaccin antirabique',
      subtitle: 'Vaccin · Milo',
    })

    applyLocale('en')
    expect(
      reminderRows(t, [{ ...antirabique, label: 'Rabies vaccine' }], { animalNames: names })[0],
    ).toMatchObject({ title: 'Rabies vaccine', subtitle: 'Vaccine · Milo' })
    applyLocale('fr')
  })

  it('garde « type · animal » même quand un seul animal est affiché (AC-8)', () => {
    const pixel = new Map([['milo', 'Pixel']])
    const rows = reminderRows(t, [reminder(), UNREADABLE], { animalNames: pixel })

    expect(rows.map((row) => row.subtitle)).toEqual(['Vaccin · Pixel', 'Vermifuge · Pixel'])
    expect(rows[1]?.ariaLabel).toBe(
      'Panacur, vermifuge, Pixel, donnée illisible. Ouvre le traitement.',
    )
  })

  it('se contente du type quand le nom de l’animal manque', () => {
    const rows = reminderRows(t, [reminder(), UNREADABLE], { animalNames: new Map() })

    expect(rows.map((row) => row.subtitle)).toEqual(['Vaccin', 'Vermifuge'])
    expect(rows[0]?.ariaLabel).toBe('CHPPiL, vaccin, en retard de 2 jours. Ouvre les actions.')
    expect(rows[1]?.ariaLabel).toBe('Panacur, vermifuge, donnée illisible. Ouvre le traitement.')
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
