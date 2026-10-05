import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, treatment } from './treatment-fixtures'
import {
  dateChangeOf,
  doseActionTexts,
  hasSeveralTimes,
  lineAction,
} from '../logic/treatment-gestures'
import type { DoseAction } from '../logic/treatment-dose-writes'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-09-28'
const SOIR = { periodId: 'p-1', dueOn: '2026-09-28', dueTime: '20:00' }
const UNE_HEURE = { name: 'Panacur', animal: 'Pixel', today: TODAY, severalTimes: false }
const DEUX_HEURES = { name: 'Métacam', animal: 'Luna', today: TODAY, severalTimes: true }
const RIEN = { postponement: null, moved: null, shiftKept: false }

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
    gesture: { kind: 'given', due: SOIR, givenOn },
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
    const action: DoseAction = { kind: 'remove', doseId: HIER_SOIR.id }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done()).toBe('Prise du 27 sept. supprimée')
    expect(texts(DEUX_HEURES, action, HIER_SOIR)).toMatchObject({
      undo: 'Annuler la suppression de la prise du 27 septembre 2026',
    })
    expect(texts(DEUX_HEURES, action, HIER_SOIR).done()).toBe('Prise du 27 sept. à 20 h supprimée')
  })

  it('dit que les doses suivantes restent décalées quand la prise laisse son décalage (N6)', () => {
    const action: DoseAction = { kind: 'remove', doseId: HIER_SOIR.id }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done({ ...RIEN, shiftKept: true })).toBe(
      'Prise du 27 sept. supprimée. Les doses suivantes restent décalées.',
    )
  })

  it('dit que les doses suivantes restent décalées quand la prise oubliée garde son décalage', () => {
    const action: DoseAction = {
      kind: 'note',
      gesture: { kind: 'missed', due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: null } },
    }

    expect(texts(UNE_HEURE, action, HIER_SOIR).done({ ...RIEN, shiftKept: true })).toBe(
      'Prise du 27 sept. marquée comme oubliée. Les doses suivantes restent décalées.',
    )
  })

  it('annonce la prise marquée oubliée', () => {
    const action: DoseAction = {
      kind: 'note',
      gesture: { kind: 'missed', due: { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' } },
    }

    expect(texts(DEUX_HEURES, action, HIER_SOIR).done()).toBe(
      'Prise du 27 sept. à 20 h marquée comme oubliée',
    )
    expect(texts(UNE_HEURE, action, HIER_SOIR).undo).toBe(
      'Annuler le changement de la prise du 27 septembre 2026',
    )
  })

  it('annonce le changement de date, et le report gardé ou perdu (TR-24 bis)', () => {
    const { done, undo } = texts(UNE_HEURE, {
      kind: 'redate',
      doseId: HIER_SOIR.id,
      givenOn: '2026-08-28',
    })

    expect(done()).toBe('Prise déplacée au 28 août')
    expect(done({ ...RIEN, postponement: { kept: true, nextDueDate: '2026-10-10' } })).toBe(
      'Prise déplacée au 28 août. Prochaine dose gardée au 10 oct., que tu avais reportée.',
    )
    expect(done({ ...RIEN, postponement: { kept: false } })).toBe(
      'Prise déplacée au 28 août. Ton report de la prochaine dose ne s’applique plus.',
    )
    expect(undo).toBe('Annuler le changement de date de la prise')
  })

  it('ne double pas le point d’une date abrégée', () => {
    const { done } = texts(UNE_HEURE, { kind: 'redate', doseId: 'x', givenOn: '2026-07-08' })

    expect(done({ ...RIEN, postponement: { kept: true, nextDueDate: '2027-01-15' } })).toBe(
      'Prise déplacée au 8 juil. Prochaine dose gardée au 15 janv. 2027, que tu avais reportée.',
    )
  })
})

describe('doseActionTexts — ligne « Reportée »', () => {
  const REPORT = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })

  it('annonce le report supprimé', () => {
    expect(texts(UNE_HEURE, { kind: 'remove-move', doseId: REPORT.id }, REPORT)).toMatchObject({
      undo: 'Annuler la suppression du report',
    })
    expect(texts(UNE_HEURE, { kind: 'remove-move', doseId: REPORT.id }, REPORT).done()).toBe(
      'Report supprimé',
    )
    expect(
      texts(UNE_HEURE, { kind: 'remove-move', doseId: REPORT.id }, REPORT).done({
        ...RIEN,
        shiftKept: true,
      }),
    ).toBe('Report supprimé. Les doses suivantes restent décalées.')
  })

  it('annonce ce que le moteur a écrit : reportée, avancée, ou report disparu', () => {
    const { done, undo } = texts(UNE_HEURE, { kind: 'move', doseId: REPORT.id, to: '2026-10-16' })
    const ligne = (dueOn: string, nextDueDate: string) => ({
      ...RIEN,
      moved: {
        periodId: 'p-1',
        dueOn,
        dueTime: null,
        givenOn: null,
        status: 'postponed' as const,
        nextDueDate,
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
  const DUE = { periodId: 'p-1', dueOn: '2026-09-27', dueTime: '20:00' }

  it('traduit chaque choix du menu en geste', () => {
    expect(lineAction(PRISE, 'remove', TODAY)).toEqual({ kind: 'remove', doseId: PRISE.id })
    expect(lineAction(PRISE, 'remove-move', TODAY)).toEqual({
      kind: 'remove-move',
      doseId: PRISE.id,
    })
    expect(lineAction(PRISE, 'mark-missed', TODAY)).toEqual({
      kind: 'note',
      gesture: { kind: 'missed', due: DUE },
    })
  })

  it('« Marquer comme donnée » note la prise au jour de son échéance', () => {
    expect(lineAction(PRISE, 'mark-given', TODAY)).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DUE, givenOn: '2026-09-27' },
    })
  })

  it('« Marquer comme donnée » une dose à venir marquée oubliée la note aujourd’hui, jamais dans le futur', () => {
    const aVenir = dose('2026-10-05', '2026-10-06', { givenOn: null, status: 'missed' })

    expect(lineAction(aVenir, 'mark-given', TODAY)).toMatchObject({
      gesture: { kind: 'given', givenOn: TODAY },
    })
  })

  it('« Changer la date » attend le jour choisi', () => {
    expect(lineAction(PRISE, 'change-date', TODAY)).toBeNull()
  })

  it('« Supprimer ce décalage » supprime la ligne de décalage seule', () => {
    expect(lineAction(PRISE, 'remove-shift', TODAY)).toEqual({
      kind: 'remove-shift',
      doseId: PRISE.id,
    })
  })
})

describe('doseActionTexts — la correction fait suivre un report seul (I2)', () => {
  it('le toast dit la nouvelle date du report', () => {
    const { done } = doseActionTexts(
      t,
      UNE_HEURE,
      { kind: 'redate', doseId: 'prise', givenOn: '2026-09-16' },
      null,
    )

    expect(
      plain(
        done({ ...RIEN, postponement: { kept: true, nextDueDate: '2026-09-29', followed: true } }),
      ),
    ).toBe('Prise déplacée au 16 sept. Le report suit : dose reportée au 29 sept.')
  })
})

describe('doseActionTexts — supprimer une prise en plus', () => {
  it('le toast et « Annuler » disent « prise en plus »', () => {
    const enPlus = { dueOn: '2026-10-05', dueTime: null, status: 'extra' as const }
    const action: DoseAction = { kind: 'remove', doseId: 'en plus' }

    const fr = doseActionTexts(t, UNE_HEURE, action, enPlus)
    expect(plain(fr.done(RIEN))).toBe('Prise en plus du 5 oct. supprimée')
    expect(fr.undo).toBe('Annuler la suppression de la prise en plus du 5 octobre 2026')

    applyLocale('en')
    const en = doseActionTexts(t, UNE_HEURE, action, enPlus)
    expect(plain(en.done(RIEN))).toBe('Extra dose of Oct 5 deleted')
    expect(en.undo).toBe('Undo deleting the extra dose of October 5, 2026')
  })
})

describe('doseActionTexts — prise notée sans son décalage, un report seul suit (M1)', () => {
  it('le toast dit que la suite ne bouge pas', () => {
    const due = { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null }
    const { done } = doseActionTexts(
      t,
      UNE_HEURE,
      { kind: 'note', gesture: { kind: 'given', due, givenOn: TODAY } },
      null,
    )

    expect(plain(done({ ...RIEN, heldBy: '2026-10-28' }))).toBe(
      'Prise de Panacur notée pour Pixel. La suite ne bouge pas : un report est prévu le 28 oct.',
    )
    applyLocale('en')
    expect(
      plain(
        doseActionTexts(
          t,
          UNE_HEURE,
          { kind: 'note', gesture: { kind: 'given', due, givenOn: TODAY } },
          null,
        ).done({ ...RIEN, heldBy: '2026-10-28' }),
      ),
    ).toBe(
      'Panacur dose logged for Pixel. The schedule doesn’t move: a postponement is planned on Oct 28.',
    )
  })
})

describe('doseActionTexts — prise en retard dont le décalage fait sauter des doses (Q4, #506)', () => {
  const due = { periodId: 'p-1', dueOn: '2026-09-25', dueTime: null }
  const action: DoseAction = { kind: 'note', gesture: { kind: 'given', due, givenOn: TODAY } }

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
  const action: DoseAction = { kind: 'remove-shift', doseId: 'décalage' }

  function done(restored: { nextOn: string | null; weekly: boolean } | null) {
    return plain(doseActionTexts(t, UNE_HEURE, action, null, restored).done(RIEN))
  }

  it('dit le jour où reviennent les doses suivantes, avec « Annuler »', () => {
    expect(done({ nextOn: '2026-10-23', weekly: true })).toBe(
      'Décalage supprimé. Les doses suivantes reviennent au vendredi.',
    )
    expect(doseActionTexts(t, UNE_HEURE, action, null).undo).toBe(
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

describe('dateChangeOf — la case « Décaler aussi les doses suivantes »', () => {
  it('décochée, le geste le dit au moteur ; cochée, rien de plus', () => {
    const prise = dose('2026-09-06', '2026-09-07', { givenOn: '2026-09-07' })
    const change = dateChangeOf(t, prise, null, { today: TODAY, earliest: null })!

    expect(change.action('2026-09-08', false)).toEqual({
      kind: 'redate',
      doseId: prise.id,
      givenOn: '2026-09-08',
      shiftsFollowing: false,
    })
    expect(change.action('2026-09-08', true)).not.toHaveProperty('shiftsFollowing')
  })
})

describe('dateChangeOf — « Changer la date »', () => {
  it('d’une prise : sa date réelle, jusqu’à aujourd’hui', () => {
    const prise = dose('2026-09-06', '2026-09-07', { givenOn: '2026-09-07' })

    const change = dateChangeOf(t, prise, null, { today: TODAY, earliest: '2022-04-10' })

    expect(change).toMatchObject({
      subtitle: 'Prise du 7 sept. 2026',
      date: '2026-09-07',
      min: '2022-04-10',
      max: TODAY,
    })
    expect(change!.action('2026-09-08')).toEqual({
      kind: 'redate',
      doseId: prise.id,
      givenOn: '2026-09-08',
    })
  })

  it('d’une prise en plus : sa date réelle, avec son nom, sans les jours qui en ont déjà une', () => {
    const prise = dose('2026-09-09', '2026-09-16', { status: 'extra' })
    const limits = { lastExtraDay: null, takenDays: ['2026-09-08'] }

    expect(dateChangeOf(t, prise, null, { today: TODAY, earliest: null, limits })).toMatchObject({
      subtitle: 'Prise en plus du 9 sept. 2026',
      date: '2026-09-09',
      max: TODAY,
      excluded: ['2026-09-08'],
    })
  })

  it('d’une prise donnée : jamais un intervalle ou plus avant son échéance', () => {
    const prise = dose('2026-09-16', '2026-09-23')
    const limits = { lastExtraDay: '2026-09-09', takenDays: [] }

    expect(
      dateChangeOf(t, prise, null, { today: TODAY, earliest: '2022-04-10', limits }),
    ).toMatchObject({ min: '2026-09-10', excluded: [] })
  })

  it('d’un report : sa nouvelle date, entre les bornes du moteur', () => {
    const report = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })
    const bounds = { earliest: '2026-09-28', latest: '2026-12-31' }

    const change = dateChangeOf(t, report, bounds, { today: TODAY, earliest: null })

    expect(change).toMatchObject({
      subtitle: 'Reportée au 14 oct. 2026 (prévue le 10 oct.)',
      date: '2026-10-14',
      min: '2026-09-28',
      max: '2026-12-31',
    })
    expect(change!.action('2026-10-16')).toEqual({
      kind: 'move',
      doseId: report.id,
      to: '2026-10-16',
    })
  })

  it('ne propose rien pour un report qui ne se déplace pas', () => {
    const report = dose('2026-10-10', '2026-10-14', { givenOn: null, status: 'postponed' })

    expect(dateChangeOf(t, report, null, { today: TODAY, earliest: null })).toBeNull()
  })
})

describe('doseActionTexts — renseigner des doses en un lot', () => {
  const due = (dueOn: string) => ({ periodId: 'p-1', dueOn, dueTime: null })
  const given = (dueOn: string) => ({ kind: 'given' as const, due: due(dueOn), givenOn: dueOn })
  const missed = (dueOn: string) => ({ kind: 'missed' as const, due: due(dueOn) })
  const log = (gestures: (ReturnType<typeof given> | ReturnType<typeof missed>)[]) =>
    texts(UNE_HEURE, { kind: 'log', gestures })

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
