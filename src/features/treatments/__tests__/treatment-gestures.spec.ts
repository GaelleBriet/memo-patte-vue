import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import { doseActionTexts, hasSeveralTimes } from '../logic/treatment-gestures'
import { dateChangeOf, lineAction } from '../logic/treatment-line-actions'
import type { DoseAction, NoteGesture } from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-09-28'
const SOIR = { settingId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' }
const UNE_HEURE = { name: 'Panacur', animal: 'Pixel', today: TODAY, severalTimes: false }
const DEUX_HEURES = { name: 'Métacam', animal: 'Luna', today: TODAY, severalTimes: true }
const RIEN = { followed: [], moved: null, shiftKept: false }

function texts(
  context: typeof UNE_HEURE,
  action: DoseAction,
  line = dose('2026-09-27', '2026-09-28'),
) {
  const { done, undo, already } = doseActionTexts(t, context, action, line)
  return {
    done: (applied: Parameters<typeof done>[0] = RIEN) => plain(done(applied)),
    undo: plain(undo),
    already: (givenOn: string) => plain(already(givenOn)),
  }
}

afterEach(() => applyLocale('fr'))

describe('doseActionTexts — noter une prise (TR-23 bis)', () => {
  const given = (givenOn: string): DoseAction => ({
    kind: 'note',
    gesture: { kind: 'note', status: 'given', due: SOIR, givenOn, shiftsFollowing: false },
  })

  it('nomme le traitement et l’animal', () => {
    const { done, undo } = texts(UNE_HEURE, given(TODAY))

    expect(done()).toBe('Prise de Panacur notée pour Pixel')
    expect(undo).toBe('Annuler la prise de Panacur')
  })

  it('dit l’heure d’un traitement à plusieurs heures', () => {
    expect(texts(DEUX_HEURES, given(TODAY)).done()).toBe('Prise de 20 h de Métacam notée pour Luna')
  })

  it('dit le jour d’une prise notée à une autre date', () => {
    expect(texts(UNE_HEURE, given('2026-09-26')).done()).toBe(
      'Prise de Panacur du 26 sept. notée pour Pixel',
    )
    expect(texts(DEUX_HEURES, given('2026-09-26')).done()).toBe(
      'Prise de 20 h de Métacam du 26 sept. notée pour Luna',
    )
  })

  it('dit où retrouver le traitement quand cette prise le termine (TR-31)', () => {
    const { done } = texts(DEUX_HEURES, given(TODAY))

    expect(done({ ...RIEN, finishes: true })).toBe(
      'Dernière dose de Métacam notée, à retrouver dans Traitements terminés.',
    )
    applyLocale('en')
    expect(texts(DEUX_HEURES, given(TODAY)).done({ ...RIEN, finishes: true })).toBe(
      'Last Métacam dose logged, now in Finished treatments.',
    )
  })

  it('dit qu’une échéance est déjà notée, aujourd’hui ou un autre jour', () => {
    const { already } = texts(UNE_HEURE, given(TODAY))

    expect(already(TODAY)).toBe('Prise de Panacur déjà notée aujourd’hui pour Pixel')
    expect(already('2026-09-26')).toBe('Prise de Panacur du 26 sept. déjà notée pour Pixel')
  })

  it('s’écrit en anglais, comme sur la planche', () => {
    applyLocale('en')

    expect(texts(DEUX_HEURES, given(TODAY)).done()).toBe('8 pm Métacam dose logged for Luna')
  })
})

describe('doseActionTexts — corriger une prise', () => {
  const HIER_SOIR = dose('2026-09-27', '2026-09-28', { dueTime: '20:00' })

  it('annonce la suppression, avec l’heure à plusieurs heures', () => {
    const action: DoseAction = { kind: 'remove', lineId: HIER_SOIR.id }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done()).toBe('Prise du 27 sept. supprimée')
    expect(texts(DEUX_HEURES, action, HIER_SOIR)).toMatchObject({
      undo: 'Annuler la suppression de la prise du 27 septembre 2026',
    })
    expect(texts(DEUX_HEURES, action, HIER_SOIR).done()).toBe('Prise du 27 sept. à 20 h supprimée')
  })

  it('dit que les doses suivantes restent décalées quand la prise laisse son décalage (N6)', () => {
    const action: DoseAction = { kind: 'remove', lineId: HIER_SOIR.id }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done({ ...RIEN, shiftKept: true })).toBe(
      'Prise du 27 sept. supprimée. Les doses suivantes restent décalées.',
    )
  })

  it('dit que les doses suivantes restent décalées quand la prise oubliée garde son décalage', () => {
    const action: DoseAction = {
      kind: 'note',
      gesture: {
        kind: 'note',
        status: 'missed',
        due: { settingId: 'p-1', dueOn: '2026-09-27', dueTime: null },
        givenOn: '2026-09-27',
        shiftsFollowing: false,
      },
    }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done({ ...RIEN, shiftKept: true })).toBe(
      'Prise du 27 sept. marquée comme oubliée. Les doses suivantes restent décalées.',
    )
  })

  it('annonce la prise marquée oubliée', () => {
    const action: DoseAction = {
      kind: 'note',
      gesture: {
        kind: 'note',
        status: 'missed',
        due: { settingId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' },
        givenOn: '2026-09-27',
        shiftsFollowing: false,
      },
    }

    expect(texts(DEUX_HEURES, action, HIER_SOIR).done()).toBe(
      'Prise du 27 sept. à 20 h marquée comme oubliée',
    )
    expect(texts(UNE_HEURE, action, HIER_SOIR).undo).toBe(
      'Annuler le changement de la prise du 27 septembre 2026',
    )
  })

  it('annonce le changement de date, et le report qui suit (TR-24 bis, G19)', () => {
    const { done, undo } = texts(UNE_HEURE, {
      kind: 'redate',
      lineId: HIER_SOIR.id,
      givenOn: '2026-08-28',
      shiftsFollowing: true,
    })

    expect(done()).toBe('Prise déplacée au 28 août')
    expect(done({ ...RIEN, followed: [{ from: '2026-10-08', to: '2026-10-10' }] })).toBe(
      'Prise déplacée au 28 août. Le report suit : dose reportée au 10 oct.',
    )
    expect(undo).toBe('Annuler le changement de date de la prise')
  })

  it('ne double pas le point d’une date abrégée', () => {
    const { done } = texts(UNE_HEURE, {
      kind: 'redate',
      lineId: 'x',
      givenOn: '2026-07-08',
      shiftsFollowing: true,
    })

    expect(done({ ...RIEN, followed: [{ from: '2027-01-10', to: '2027-01-15' }] })).toBe(
      'Prise déplacée au 8 juil. Le report suit : dose reportée au 15 janv. 2027.',
    )
  })
})

describe('doseActionTexts — ligne « Reportée »', () => {
  const REPORT = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })

  it('annonce le report supprimé', () => {
    expect(texts(UNE_HEURE, { kind: 'remove', lineId: REPORT.id }, REPORT)).toMatchObject({
      undo: 'Annuler la suppression du report',
    })
    expect(texts(UNE_HEURE, { kind: 'remove', lineId: REPORT.id }, REPORT).done()).toBe(
      'Report supprimé',
    )
    expect(
      texts(UNE_HEURE, { kind: 'remove', lineId: REPORT.id }, REPORT).done({
        ...RIEN,
        shiftKept: true,
      }),
    ).toBe('Report supprimé. Les doses suivantes restent décalées.')
  })

  it('annonce ce que le moteur a écrit : reportée, avancée, ou report disparu', () => {
    const { done, undo } = texts(UNE_HEURE, {
      kind: 'move',
      due: { settingId: 'p-1', dueOn: '2026-10-14', dueTime: null },
      to: '2026-10-16',
      shiftsFollowing: true,
    })
    const ligne = (dueOn: string, nextDueDate: string) => ({
      ...RIEN,
      moved: {
        settingId: 'p-1',
        dueOn,
        dueTime: null,
        givenOn: null,
        status: 'postponed' as const,
        targetOn: nextDueDate,
      },
    })

    expect(done(ligne('2026-10-10', '2026-10-16'))).toBe('Dose reportée au 16 oct.')
    expect(done(ligne('2026-10-10', '2026-10-08'))).toBe('Dose avancée au 8 oct.')
    expect(done(ligne('2026-10-20', '2026-10-16'))).toBe('Dose avancée au 16 oct.')
    expect(done({ ...RIEN, moved: 'removed' })).toBe('Report supprimé')
    expect(undo).toBe('Annuler le changement de date du report')
  })
})

describe('hasSeveralTimes', () => {
  it('dit si la période d’une échéance a plusieurs heures', () => {
    const book = treatment([
      period({ times: ['08:00'] }),
      period({ id: 'p-2', times: ['08:00', '20:00'] }),
    ])

    expect(hasSeveralTimes(book, 'p-1')).toBe(false)
    expect(hasSeveralTimes(book, 'p-2')).toBe(true)
    expect(hasSeveralTimes(book, 'inconnue')).toBe(false)
  })
})

describe('lineAction — menu ⋮ d’une ligne de l’historique', () => {
  const PRISE = dose('2026-09-27', '2026-09-28', { dueTime: '20:00' })
  const DUE = { settingId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' }
  const note = (status: 'given' | 'missed', givenOn: string): NoteGesture => ({
    kind: 'note',
    status,
    due: DUE,
    givenOn,
    shiftsFollowing: false,
  })

  it('traduit chaque choix du menu en geste ; un report, un décalage ou une prise se suppriment par la ligne', () => {
    const remove = { kind: 'remove', lineId: PRISE.id }

    expect(lineAction(PRISE, 'remove', TODAY)).toEqual(remove)
    expect(lineAction(PRISE, 'remove-move', TODAY)).toEqual(remove)
    expect(lineAction(PRISE, 'remove-shift', TODAY)).toEqual(remove)
    expect(lineAction(PRISE, 'mark-missed', TODAY)).toEqual({
      kind: 'note',
      gesture: note('missed', '2026-09-27'),
    })
  })

  it('« Marquer comme donnée » note la prise au jour de son échéance', () => {
    expect(lineAction(PRISE, 'mark-given', TODAY)).toEqual({
      kind: 'note',
      gesture: note('given', '2026-09-27'),
    })
  })

  it('« Marquer comme donnée » une dose à venir marquée oubliée la note aujourd’hui, jamais dans le futur', () => {
    const aVenir = dose('2026-10-05', '2026-10-06', { givenOn: null, status: 'missed' })

    expect(lineAction(aVenir, 'mark-given', TODAY)).toMatchObject({
      gesture: { status: 'given', givenOn: TODAY },
    })
  })

  it('« Changer la date » attend le jour choisi', () => {
    expect(lineAction(PRISE, 'change-date', TODAY)).toBeNull()
  })
})

describe('doseActionTexts — la correction fait suivre un report seul (I2)', () => {
  it('le toast dit la nouvelle date du report', () => {
    const { done } = doseActionTexts(
      t,
      UNE_HEURE,
      { kind: 'redate', lineId: 'prise', givenOn: '2026-09-16', shiftsFollowing: true },
      null,
    )

    expect(plain(done({ ...RIEN, followed: [{ from: '2026-09-24', to: '2026-09-29' }] }))).toBe(
      'Prise déplacée au 16 sept. Le report suit : dose reportée au 29 sept.',
    )
  })
})

describe('doseActionTexts — supprimer une prise en plus', () => {
  it('le toast et « Annuler » disent « prise en plus »', () => {
    const enPlus = { dueOn: '2026-10-05', dueTime: null, status: 'extra' as const }
    const action: DoseAction = { kind: 'remove', lineId: 'en plus' }

    const fr = doseActionTexts(t, UNE_HEURE, action, enPlus)
    expect(plain(fr.done(RIEN))).toBe('Prise en plus du 5 oct. supprimée')
    expect(plain(fr.undo)).toBe('Annuler la suppression de la prise en plus du 5 octobre 2026')

    applyLocale('en')
    const en = doseActionTexts(t, UNE_HEURE, action, enPlus)
    expect(plain(en.done(RIEN))).toBe('Extra dose on Oct 5 deleted')
    expect(plain(en.undo)).toBe('Undo deleting the extra dose on October 5, 2026')
  })
})

describe('doseActionTexts — prise en retard dont le décalage fait sauter des doses (Q4, #506)', () => {
  const due = { settingId: 'p-1', dueOn: '2026-09-25', dueTime: null }
  const action: DoseAction = {
    kind: 'note',
    gesture: { kind: 'note', status: 'given', due, givenOn: TODAY, shiftsFollowing: true },
  }

  it('le toast dit la dose qui n’est plus prévue', () => {
    const { done } = doseActionTexts(t, UNE_HEURE, action, null)

    expect(plain(done({ ...RIEN, lostToEnd: ['2026-10-30'] }))).toBe(
      'Prise de Panacur notée pour Pixel. La dose du 30 oct. n’est plus prévue (date de fin).',
    )
    expect(plain(done({ ...RIEN, lostToEnd: ['2026-10-23', '2026-10-30'] }))).toBe(
      'Prise de Panacur notée pour Pixel. Les doses du 23, 30 oct. ne sont plus prévues (date de fin).',
    )
    applyLocale('en')
    expect(
      plain(
        doseActionTexts(t, UNE_HEURE, action, null).done({ ...RIEN, lostToEnd: ['2026-10-30'] }),
      ),
    ).toBe('Panacur dose logged for Pixel. The Oct 30 dose is no longer scheduled (end date).')
  })

  it('le traitement terminé, le toast de la dernière dose l’emporte', () => {
    const { done } = doseActionTexts(t, UNE_HEURE, action, null)

    expect(plain(done({ ...RIEN, finishes: true, lostToEnd: ['2026-10-30'] }))).toBe(
      'Dernière dose de Panacur notée, à retrouver dans Traitements terminés.',
    )
  })
})

describe('doseActionTexts — « Supprimer ce décalage » (V31 quater)', () => {
  const action: DoseAction = { kind: 'remove', lineId: 'décalage' }
  const SHIFT = { dueOn: '2026-10-16', dueTime: null, status: 'shift' as const }

  function done(restored: { nextOn: string | null; weekly: boolean } | null) {
    return plain(doseActionTexts(t, UNE_HEURE, action, SHIFT, restored).done(RIEN))
  }

  it('dit le jour où reviennent les doses suivantes, avec « Annuler »', () => {
    expect(done({ nextOn: '2026-10-23', weekly: true })).toBe(
      'Décalage supprimé. Les doses suivantes reviennent au vendredi.',
    )
    expect(doseActionTexts(t, UNE_HEURE, action, SHIFT).undo).toBe(
      'Annuler la suppression du décalage',
    )
  })

  it('hors d’un rythme en semaines, la prochaine dose ; sans elle, le geste seul', () => {
    expect(done({ nextOn: '2026-10-22', weekly: false })).toBe(
      'Décalage supprimé. Prochaine dose le 22 oct.',
    )
    expect(done(null)).toBe('Décalage supprimé')
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(done({ nextOn: '2026-10-23', weekly: true })).toBe(
      'Move deleted. The following doses go back to Friday.',
    )
  })
})

describe('dateChangeOf', () => {
  const view = (today: string, book = treatment([period()])) => treatmentReadingOf(book, today).view

  it('« Décaler aussi les doses suivantes » : le geste porte l’état de la case', () => {
    const prise = dose('2026-09-06', '2026-09-07', { givenOn: '2026-09-07' })
    const change = dateChangeOf(t, prise, null, {
      today: TODAY,
      earliest: null,
      view: view(TODAY),
    })!

    expect(change.action('2026-09-08', false)).toEqual({
      kind: 'redate',
      lineId: prise.id,
      givenOn: '2026-09-08',
      shiftsFollowing: false,
    })
    expect(change.action('2026-09-08')).toMatchObject({ shiftsFollowing: true })
  })

  it('d’une prise : sa date réelle, de son échéance (R5) jusqu’à aujourd’hui', () => {
    const prise = dose('2026-09-06', '2026-09-07', { givenOn: '2026-09-07' })

    const change = dateChangeOf(t, prise, null, {
      today: TODAY,
      earliest: '2022-04-10',
      view: view(TODAY),
    })

    expect(plain(change)).toMatchObject({
      subtitle: 'Prise du 7 sept. 2026',
      date: '2026-09-07',
      min: '2026-09-06',
      max: TODAY,
    })
  })

  it('d’une prise en plus : sa date réelle, avec son nom', () => {
    const prise = dose('2026-09-09', '2026-09-16', { status: 'extra' })

    expect(
      plain(dateChangeOf(t, prise, null, { today: TODAY, earliest: null, view: view(TODAY) })),
    ).toMatchObject({
      subtitle: 'Prise en plus du 9 sept. 2026',
      date: '2026-09-09',
      max: TODAY,
      hint: null,
    })
  })

  it('d’une prise donnée : jamais un intervalle ou plus avant son échéance (R5)', () => {
    const weekly = period({ frequency: { value: 1, unit: 'week' } })
    const prise = dose('2026-09-16', '2026-09-23')
    const book = treatment([weekly], [prise])

    expect(
      dateChangeOf(t, prise, null, {
        today: TODAY,
        earliest: '2022-04-10',
        view: view(TODAY, book),
      }),
    ).toMatchObject({ min: '2026-09-10' })
  })

  it('Q30 : Métacam tous les jours à 8 h et 20 h, prise d’hier 20 h : hier ou aujourd’hui', () => {
    const daily = period({
      startsOn: '2026-10-05',
      firstDueOn: '2026-10-05',
      times: ['08:00', '20:00'],
    })
    const hierSoir = dose('2026-10-23', '', { dueTime: '20:00' })
    const book = treatment([daily], [hierSoir])

    expect(
      plain(
        dateChangeOf(t, hierSoir, null, {
          today: '2026-10-24',
          earliest: '2022-04-10',
          view: view('2026-10-24', book),
        }),
      ),
    ).toMatchObject({
      min: '2026-10-23',
      max: '2026-10-24',
      hint: 'Choisis une date à partir du 23 oct.',
    })
  })

  it('Q30 : Bravecto tous les 3 mois, prise du 1er nov. : du 2 août à aujourd’hui', () => {
    const quarterly = period({
      startsOn: '2026-05-01',
      firstDueOn: '2026-05-01',
      frequency: { value: 3, unit: 'month' },
    })
    const nov = dose('2026-11-01', '')
    const book = treatment([quarterly], [dose('2026-05-01', ''), dose('2026-08-01', ''), nov])

    expect(
      plain(
        dateChangeOf(t, nov, null, {
          today: '2026-11-10',
          earliest: '2022-04-10',
          view: view('2026-11-10', book),
        }),
      ),
    ).toMatchObject({
      min: '2026-08-02',
      max: '2026-11-10',
      hint: 'Choisis une date à partir du 2 août.',
    })
  })

  it('d’un report : sa nouvelle date, entre les bornes du moteur, sans les jours d’un autre report', () => {
    const report = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })
    const bounds = { earliest: '2026-09-28', latest: '2026-12-31', excluded: ['2026-11-02'] }

    const change = dateChangeOf(t, report, bounds, {
      today: TODAY,
      earliest: null,
      view: view(TODAY),
    })

    expect(plain(change)).toMatchObject({
      subtitle: 'Reportée au 14 oct. 2026 (prévue le 10 oct.)',
      date: '2026-10-14',
      min: '2026-09-28',
      max: '2026-12-31',
      excluded: ['2026-11-02'],
    })
    expect(change!.action('2026-10-16', true)).toEqual({
      kind: 'move',
      due: { settingId: 'p-1', dueOn: '2026-10-14', dueTime: null },
      to: '2026-10-16',
      shiftsFollowing: true,
    })
  })

  it('ne propose rien pour un report qui ne se déplace pas', () => {
    const report = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })

    expect(
      dateChangeOf(t, report, null, { today: TODAY, earliest: null, view: view(TODAY) }),
    ).toBeNull()
  })
})

describe('doseActionTexts — renseigner des doses en un lot', () => {
  const due = (dueOn: string) => ({ settingId: 'p-1', dueOn, dueTime: null })
  const note = (dueOn: string, status: 'given' | 'missed'): NoteGesture => ({
    kind: 'note',
    status,
    due: due(dueOn),
    givenOn: dueOn,
    shiftsFollowing: false,
  })
  const given = (dueOn: string) => note(dueOn, 'given')
  const missed = (dueOn: string) => note(dueOn, 'missed')
  const log = (gestures: NoteGesture[]) => texts(UNE_HEURE, { kind: 'log', gestures })

  it('compte les prises et les oublis notés', () => {
    const { done, undo } = log([
      given('2026-09-03'),
      given('2026-09-04'),
      given('2026-09-05'),
      given('2026-09-06'),
      missed('2026-09-07'),
    ])

    expect(done()).toBe('Panacur : 4 prises et 1 oubli notés')
    expect(undo).toBe('Annuler les doses renseignées de Panacur')
  })

  it('ne cite que ce qui a été noté', () => {
    expect(log([given('2026-09-03')]).done()).toBe('Panacur : 1 prise notée')
    expect(log([given('2026-09-03'), given('2026-09-04')]).done()).toBe('Panacur : 2 prises notées')
    expect(log([missed('2026-09-03')]).done()).toBe('Panacur : 1 oubli noté')
    expect(log([missed('2026-09-03'), missed('2026-09-04')]).done()).toBe(
      'Panacur : 2 oublis notés',
    )
  })

  it('dit où retrouver le traitement quand renseigner le termine (Q16)', () => {
    const TERMINE = { ...RIEN, finishes: true }
    const both = log([
      given('2026-09-03'),
      given('2026-09-04'),
      given('2026-09-05'),
      given('2026-09-06'),
      missed('2026-09-07'),
    ])

    expect(both.done(TERMINE)).toBe(
      'Panacur : 4 prises et 1 oubli notés, à retrouver dans Traitements terminés.',
    )
    expect(log([given('2026-09-03')]).done(TERMINE)).toBe(
      'Panacur : 1 prise notée, à retrouver dans Traitements terminés.',
    )
    expect(log([missed('2026-09-03'), missed('2026-09-04')]).done(TERMINE)).toBe(
      'Panacur : 2 oublis notés, à retrouver dans Traitements terminés.',
    )
  })

  it('en anglais', () => {
    applyLocale('en')
    const mixed = log([given('2026-09-03'), given('2026-09-04'), missed('2026-09-05')])

    expect(mixed.done()).toBe('Panacur: 2 doses and 1 missed dose logged')
    expect(mixed.done({ ...RIEN, finishes: true })).toBe(
      'Panacur: 2 doses and 1 missed dose logged, now in Finished treatments.',
    )
  })
})

describe('doseActionTexts — la suite ne bouge pas : un report est prévu (G19, G20)', () => {
  const action: DoseAction = {
    kind: 'note',
    gesture: { kind: 'note', status: 'given', due: SOIR, givenOn: TODAY, shiftsFollowing: false },
    heldBy: '2026-10-28',
  }

  it('le toast nomme le report, en français puis en anglais', () => {
    expect(texts(UNE_HEURE, action).done({ ...RIEN, heldBy: '2026-10-28' })).toBe(
      'Prise de Panacur notée pour Pixel. La suite ne bouge pas : un report est prévu le 28 oct.',
    )
    applyLocale('en')
    expect(texts(UNE_HEURE, action).done({ ...RIEN, heldBy: '2026-10-28' })).toBe(
      'Panacur dose logged for Pixel. The schedule doesn’t move: a postponement is planned on Oct 28.',
    )
  })
})
