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
const RIEN = { postponement: null }

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
    expect(done({ postponement: { kept: true, nextDueDate: '2026-10-10' } })).toBe(
      'Prise déplacée au 28 août. Prochaine dose gardée au 10 oct., que tu avais reportée.',
    )
    expect(done({ postponement: { kept: false } })).toBe(
      'Prise déplacée au 28 août. Ton report de la prochaine dose ne s’applique plus.',
    )
    expect(undo).toBe('Annuler le changement de date de la prise')
  })

  it('ne double pas le point d’une date abrégée', () => {
    const { done } = texts(UNE_HEURE, { kind: 'redate', doseId: 'x', givenOn: '2026-07-08' })

    expect(done({ postponement: { kept: true, nextDueDate: '2027-01-15' } })).toBe(
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
  })

  it('annonce la nouvelle date, reportée, avancée ou revenue à l’échéance', () => {
    const to = (date: string) =>
      texts(UNE_HEURE, { kind: 'move', doseId: REPORT.id, to: date }, REPORT).done()

    expect(to('2026-10-16')).toBe('Dose reportée au 16 oct.')
    expect(to('2026-10-08')).toBe('Dose avancée au 8 oct.')
    expect(to('2026-10-10')).toBe('Report supprimé')
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
    expect(lineAction(PRISE, 'remove')).toEqual({ kind: 'remove', doseId: PRISE.id })
    expect(lineAction(PRISE, 'remove-move')).toEqual({ kind: 'remove-move', doseId: PRISE.id })
    expect(lineAction(PRISE, 'mark-missed')).toEqual({
      kind: 'note',
      gesture: { kind: 'missed', due: DUE },
    })
  })

  it('« Marquer comme donnée » note la prise au jour de son échéance', () => {
    expect(lineAction(PRISE, 'mark-given')).toEqual({
      kind: 'note',
      gesture: { kind: 'given', due: DUE, givenOn: '2026-09-27' },
    })
  })

  it('« Changer la date » attend le jour choisi', () => {
    expect(lineAction(PRISE, 'change-date')).toBeNull()
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
