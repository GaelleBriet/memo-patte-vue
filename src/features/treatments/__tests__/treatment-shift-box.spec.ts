import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, postponed, shifted, treatment } from './treatment-fixtures'
import { doseChange } from '../logic/treatment-dose-writes'
import { dateChangeOf } from '../logic/treatment-gestures'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import {
  dateChangeBox,
  dosesAfter,
  otherDateBox,
  otherDateNote,
  otherDateRecap,
  restoredSuiteFor,
  shiftHelpText,
} from '../logic/treatment-shift-box'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import i18n, { applyLocale } from '@/core/i18n'
import { formatDayMonth } from '@/shared/utils/format'

const t = i18n.global.t

// Pixel, vermifuge tous les vendredis : 16, 23, 30 oct.
const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const PIXEL = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
const DUE_16 = { periodId: 'p-1', dueOn: '2026-10-16', dueTime: null }

function carnet(history: TreatmentWithHistory, today: string) {
  return { history, schedule: treatmentScheduleOf(history, today), today }
}

function help(view: { help: { text: string; warning: boolean } | null }) {
  return view.help === null ? null : { ...view.help, text: plain(view.help.text) }
}

afterEach(() => applyLocale('fr'))

describe('shiftHelpText — l’aide sous la case (V28)', () => {
  const weekly = { frequency: { value: 1, unit: 'week' as const } }

  it('cochée, dit le nouveau jour et les deux doses suivantes', () => {
    const text = shiftHelpText(
      t,
      weekly,
      { shifts: true, following: ['2026-10-26', '2026-11-02', '2026-11-09'], lost: [] },
      '2026-10-19',
    )

    expect(plain(text!.text)).toBe('Les doses suivantes passeront au lundi : 26 oct., 2 nov.')
  })

  it('décochée, dit que seule cette dose change', () => {
    const text = shiftHelpText(
      t,
      weekly,
      { shifts: false, following: ['2026-10-23', '2026-10-30'], lost: [] },
      '2026-10-19',
    )

    expect(plain(text!.text)).toBe(
      'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
    )
  })

  it('pour un rythme de plusieurs jours, la date puis le rythme', () => {
    const every3Days = { frequency: { value: 3, unit: 'day' as const } }

    expect(
      shiftHelpText(
        t,
        every3Days,
        { shifts: true, following: ['2026-10-22'], lost: [] },
        '2026-10-19',
      )!.text,
    ).toBe('Les doses suivantes passeront au 22 oct., puis tous les 3 jours.')
  })

  it('devient un avertissement discret quand la date de fin ferait perdre une dose (V28 bis)', () => {
    expect(
      shiftHelpText(
        t,
        weekly,
        { shifts: true, following: ['2026-10-26'], lost: ['2026-11-02'] },
        '2026-10-19',
      ),
    ).toEqual({
      text: 'Avec le décalage, la dose du 2 nov. ne sera plus prévue (date de fin).',
      warning: true,
    })
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(
      shiftHelpText(
        t,
        weekly,
        { shifts: true, following: ['2026-10-26', '2026-11-02'], lost: [] },
        '2026-10-19',
      )!.text,
    ).toBe('The following doses will move to Monday: Oct 26, Nov 2.')
    expect(
      shiftHelpText(
        t,
        weekly,
        { shifts: false, following: ['2026-10-23', '2026-10-30'], lost: [] },
        '2026-10-19',
      )!.text,
    ).toBe('Only this dose changes. The following ones stay on Friday: Oct 23, 30.')
  })
})

describe('otherDateBox — « Fait à une autre date » (V29)', () => {
  it('pour la dose du moment donnée un autre jour : la case, et où vont les suivantes', () => {
    const today = '2026-10-19'

    expect(otherDateBox(t, DUE_16, '2026-10-19', carnet(PIXEL, today), true)).toMatchObject({
      shown: true,
    })
    expect(help(otherDateBox(t, DUE_16, '2026-10-19', carnet(PIXEL, today), true))).toEqual({
      text: 'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
      warning: false,
    })
    expect(help(otherDateBox(t, DUE_16, '2026-10-19', carnet(PIXEL, today), false))).toEqual({
      text: 'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
      warning: false,
    })
  })

  it('pas de case pour une prise à son jour, ni pour une dose non renseignée (N1)', () => {
    expect(otherDateBox(t, DUE_16, '2026-10-16', carnet(PIXEL, '2026-10-19'), true).shown).toBe(
      false,
    )
    expect(otherDateBox(t, DUE_16, '2026-10-17', carnet(PIXEL, '2026-10-24'), true).shown).toBe(
      false,
    )
  })

  it('récapitule la dose et le jour de la prise', () => {
    expect(plain(otherDateRecap(t, DUE_16, '2026-10-19', false)!)).toBe(
      'Dose du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(plain(otherDateRecap(t, { ...DUE_16, dueTime: '20:00' }, '2026-10-19', true)!)).toBe(
      'Dose de 20 h du vendredi 16 oct., donnée le lundi 19 oct.',
    )
    expect(otherDateRecap(t, DUE_16, '2026-10-16', false)).toBeNull()
  })
})

describe('dateChangeBox — « Changer la date » (V30, N2)', () => {
  const today = '2026-10-15'
  const report = postponed('2026-10-16', '2026-10-19')
  const avecDecalage = treatment(
    [VENDREDI],
    [...PIXEL.doses, shifted('2026-10-16', '2026-10-19'), report],
  )
  const seul = treatment([VENDREDI], [...PIXEL.doses, report])

  function boxOf(history: TreatmentWithHistory) {
    const bounds = { earliest: today, latest: null }
    const change = dateChangeOf(t, report, bounds, { today, earliest: null })!
    return dateChangeBox(t, report, carnet(history, today), change.action)!
  }

  it('se rouvre telle qu’elle a été laissée', () => {
    expect(boxOf(avecDecalage).initial).toBe(true)
    expect(boxOf(seul).initial).toBe(false)
  })

  it('décochée, un report seul va au plus la veille de la dose suivante (Q2 a)', () => {
    const box = boxOf(seul)

    expect(box.aloneMax).toBe('2026-10-22')
    expect(box.view('2026-10-24', false)).toMatchObject({ blocked: true })
    expect(plain(box.view('2026-10-24', false).help!.text)).toBe(
      'Seule, cette dose va au plus tard au 22 oct. Coche « Décaler aussi les doses suivantes » pour aller plus loin.',
    )
    expect(help(box.view('2026-10-20', false))).toEqual({
      text: 'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
      warning: false,
    })
    expect(help(box.view('2026-10-20', true))).toEqual({
      text: 'Les doses suivantes passeront au mardi : 27 oct., 3 nov.',
      warning: false,
    })
  })

  it('d’une prise : la case pour une prise qui a décalé la suite, cochée si son décalage existe', () => {
    const prise = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
    const history = treatment(
      [VENDREDI],
      [...PIXEL.doses, prise, shifted('2026-10-16', '2026-10-19')],
    )
    const change = dateChangeOf(t, prise, null, { today: '2026-10-21', earliest: null })!
    const box = dateChangeBox(t, prise, carnet(history, '2026-10-21'), change.action)!

    expect(box.initial).toBe(true)
    expect(box.view('2026-10-19', true).shown).toBe(false)
    expect(box.view('2026-10-16', true).shown).toBe(false)
    expect(box.view('2026-10-20', true).shown).toBe(true)
    expect(help(box.view('2026-10-20', false))).toEqual({
      text: 'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
      warning: false,
    })
  })
})

describe('Q2 a : les jours qui feraient passer un report seul sont refusés', () => {
  // Vendredis ; prise du 9 oct., dose du 16 reportée seule au jeudi 22.
  const SEUL = treatment(
    [VENDREDI],
    [
      dose('2026-10-09', '2026-10-16', { createdAt: '2026-10-09T08:00:00.000Z' }),
      postponed('2026-10-16', '2026-10-22'),
    ],
  )
  const today = '2026-10-12'

  it('« Changer la date » grise ces jours et le dit', () => {
    const prise = SEUL.doses[0]!
    const change = dateChangeOf(t, prise, null, { today, earliest: null })!
    const box = dateChangeBox(t, prise, carnet(SEUL, today), change.action)!

    expect(box.refusedDays(true)).toContain('2026-10-07')
    expect(box.refusedDays(false)).not.toContain('2026-10-07')
    expect(box.view('2026-10-07', true)).toMatchObject({ blocked: true })
    expect(plain(box.view('2026-10-07', true).help!.text)).toBe(
      'Ce jour ferait passer le report du 22 oct. après la dose suivante : change d’abord la date du report.',
    )
  })

  it('« Fait à une autre date » coché le refuse, décoché le permet', () => {
    const late = treatment([VENDREDI], [...PIXEL.doses, postponed('2026-10-16', '2026-10-22')])
    const due9 = { periodId: 'p-1', dueOn: '2026-10-09', dueTime: null }

    expect(otherDateBox(t, due9, '2026-10-14', carnet(late, '2026-10-14'), true)).toMatchObject({
      shown: true,
      blocked: true,
    })
    expect(
      otherDateBox(t, due9, '2026-10-14', carnet(late, '2026-10-14'), false).blocked,
    ).toBeUndefined()
    expect(
      plain(otherDateBox(t, due9, '2026-10-14', carnet(late, '2026-10-14'), true).help!.text),
    ).toBe(
      'Ce jour ferait passer le report du 22 oct. après la dose suivante : décoche la case, ou change d’abord la date du report.',
    )
  })
})

describe('otherDateNote — ce que « Fait à une autre date » enregistre', () => {
  const due9 = { periodId: 'p-1', dueOn: '2026-10-09', dueTime: null }

  it('refusé, rien ne s’enregistre ; la case montrée, son état part au moteur', () => {
    const shown = { shown: true, help: null }

    expect(otherDateNote(due9, '2026-10-14', { ...shown, blocked: true }, true)).toBeNull()
    expect(otherDateNote(due9, '2026-10-14', shown, true)).toEqual({
      kind: 'given',
      due: due9,
      givenOn: '2026-10-14',
      shiftsFollowing: true,
    })
    expect(otherDateNote(due9, '2026-10-14', shown, false)).toMatchObject({
      shiftsFollowing: false,
    })
    expect(otherDateNote(due9, '2026-10-14', { shown: false, help: null }, false)).toEqual({
      kind: 'given',
      due: due9,
      givenOn: '2026-10-14',
    })
    expect(otherDateNote(null, '2026-10-14', shown, true)).toBeNull()
  })
})

describe('I2 : la correction fait suivre le report seul, et l’aide dit le calendrier enregistré', () => {
  // Vendredis ; le 16 donnée le lundi 19 avec décalage (26, 2 nov.), le 26 reporté seul au 30.
  const prise = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
  const history = treatment(
    [VENDREDI],
    [
      dose('2026-10-09', '2026-10-16'),
      prise,
      shifted('2026-10-16', '2026-10-19'),
      postponed('2026-10-26', '2026-10-30'),
    ],
  )
  const today = '2026-10-27'
  const schedule = treatmentScheduleOf(history, today)
  const change = dateChangeOf(t, prise, null, { today, earliest: null })!
  const box = dateChangeBox(t, prise, carnet(history, today), change.action)!

  function saved(date: string, shifts: boolean) {
    const { writes } = doseChange(history, schedule, change.action(date, shifts), () => 'n')
    return treatmentScheduleOf({ ...history, doses: dosesAfter(history.doses, writes) }, today)
  }

  function follows(date: string, shifts: boolean): boolean {
    const { postponement } = schedule.redate(prise.id, date, shifts)
    if (postponement === null) return false
    return postponement.kept
      ? postponement.followed === true
      : postponement.followedOn !== undefined
  }

  it.each(['2026-10-12', '2026-10-15', '2026-10-17', '2026-10-18'])(
    'au %s, case décochée : refusé dans cet état seul, le jour est grisé',
    (date) => {
      expect(schedule.redateRefusal(prise.id, date, false)).toEqual({
        on: '2026-10-30',
        reason: 'passes',
      })
      expect(schedule.redateRefusal(prise.id, date, true)).toBeNull()
      expect(box.view(date, false).blocked).toBe(true)
      expect(plain(box.view(date, false).help!.text)).toBe(
        'Avec ce jour, la dose que tu avais reportée au 30 oct. tomberait après la suivante. Coche « Décaler aussi les doses suivantes », ou change d’abord la date de ce report.',
      )
      expect(box.refusedDays(false)).toContain(date)
    },
  )

  it.each(['2026-10-12', '2026-10-15', '2026-10-17', '2026-10-18'])(
    'au %s, case cochée : le report suit, l’aide dit le calendrier enregistré',
    (date) => {
      const after = saved(date, true)
      const moves = after.doses.filter(({ status }) => status === 'postponed')
      expect(moves.every(({ nextDueDate }) => nextDueDate >= today)).toBe(true)
      const pending = [
        ...new Set([...after.currentDoses, ...after.upcoming(6)].map(({ dueOn }) => dueOn)),
      ].sort()
      const [first, second] = pending.filter((day) => day > date)
      const text = plain(box.view(date, true).help!.text)

      expect(text).toContain(plain(formatDayMonth(first!)).split(' ')[0]!)
      expect(text).toContain(String(Number(second!.slice(8))))
      expect(
        text.includes('La dose que tu avais reportée au 30 oct. reste prévue ce jour-là.'),
      ).toBe(follows(date, true))
    },
  )

  it.each([true, false])(
    'au 16, case %s : le report retombe sur la dose du 30, annoncé',
    (shifts) => {
      const after = saved('2026-10-16', shifts)

      expect(after.doses.some(({ status }) => status === 'postponed')).toBe(false)
      expect(after.upcoming(2).map(({ dueOn }) => dueOn)).toEqual(['2026-10-30', '2026-11-06'])
      expect(plain(box.view('2026-10-16', shifts).help!.text)).toBe(
        'La dose que tu avais reportée au 30 oct. reste prévue ce jour-là.',
      )
    },
  )

  it('au 17, case cochée : le report garde le 30 et vise le samedi 31 ; l’aide suit le calendrier', () => {
    expect(plain(box.view('2026-10-17', true).help!.text)).toBe(
      'Dose reportée le 30 oct., puis le 7 nov. et toutes les semaines. La dose du 24 oct. sera en retard. La dose que tu avais reportée au 30 oct. reste prévue ce jour-là.',
    )
    const after = saved('2026-10-17', true)
    expect(after.currentDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-10-24'])
    expect(after.upcoming(2).map(({ dueOn }) => dueOn)).toEqual(['2026-10-30', '2026-11-07'])
  })

  it('l’aide nomme à part un report qui précède le rythme', () => {
    const weekly = { frequency: { value: 1, unit: 'week' as const } }

    expect(
      plain(
        shiftHelpText(
          t,
          weekly,
          {
            shifts: true,
            following: ['2026-10-30', '2026-10-31', '2026-11-07'],
            lost: [],
            weekdayOn: '2026-10-17',
            arrivals: ['2026-10-30'],
          },
          '2026-10-27',
        )!.text,
      ),
    ).toBe('Dose reportée le 30 oct., puis le 31 oct. et toutes les semaines.')
  })

  it('cochée, le jour vient de l’ancrage', () => {
    const weekly = { frequency: { value: 1, unit: 'week' as const } }

    expect(
      plain(
        shiftHelpText(
          t,
          weekly,
          {
            shifts: true,
            following: ['2026-10-26', '2026-11-02'],
            lost: [],
            weekdayOn: '2026-10-19',
          },
          '2026-10-19',
        )!.text,
      ),
    ).toBe('Les doses suivantes passeront au lundi : 26 oct., 2 nov.')
  })
})

describe('restoredSuiteFor — le toast de « Supprimer ce décalage » (V31 quater)', () => {
  it('la prochaine dose après la dose déplacée, sans le décalage', () => {
    const history = treatment(
      [VENDREDI],
      [...PIXEL.doses, shifted('2026-10-16', '2026-10-19'), postponed('2026-10-16', '2026-10-19')],
    )

    expect(
      restoredSuiteFor(
        history,
        { kind: 'remove-shift', doseId: 'décalage 2026-10-16' },
        '2026-10-15',
      ),
    ).toEqual({ nextOn: '2026-10-23', weekly: true })
    expect(restoredSuiteFor(history, { kind: 'remove', doseId: '2026-10-09' }, '2026-10-15')).toBe(
      null,
    )
  })
})
