import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, postponed, shifted, treatment } from './treatment-fixtures'
import { doseChange } from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { restoredSuiteFor } from '../logic/treatment-restored-suite'
import {
  dateChangeBox,
  doneGesture,
  otherDateBox,
  otherDateNote,
  otherDateRecap,
} from '../logic/treatment-shift-box'
import { shiftHelpText } from '../logic/treatment-shift-help'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

// Pixel, vermifuge tous les vendredis : 16, 23, 30 oct.
const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const PIXEL = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
const DUE_16 = { settingId: 'p-1', dueOn: '2026-10-16', dueTime: null }

function carnet(withPeriods: TreatmentWithPeriods, today: string) {
  return { treatment: withPeriods, reading: treatmentReadingOf(withPeriods, today), today }
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
      plain(
        shiftHelpText(
          t,
          every3Days,
          { shifts: true, following: ['2026-10-22'], lost: [] },
          '2026-10-19',
        )!.text,
      ),
    ).toBe('Les doses suivantes passeront au 22 oct., puis tous les 3 jours.')
  })

  it('devient un avertissement discret quand la date de fin ferait perdre une dose (V28 bis)', () => {
    expect(
      plain(
        shiftHelpText(
          t,
          weekly,
          { shifts: true, following: ['2026-10-26'], lost: ['2026-11-02'] },
          '2026-10-19',
        ),
      ),
    ).toEqual({
      text: 'Avec le décalage, la dose du 2 nov. ne sera plus prévue (date de fin).',
      warning: true,
    })
  })

  it('en anglais', () => {
    applyLocale('en')

    expect(
      plain(
        shiftHelpText(
          t,
          weekly,
          { shifts: true, following: ['2026-10-26', '2026-11-02'], lost: [] },
          '2026-10-19',
        )!.text,
      ),
    ).toBe('The following doses will move to Monday: Oct 26, Nov 2.')
    expect(
      plain(
        shiftHelpText(
          t,
          weekly,
          { shifts: false, following: ['2026-10-23', '2026-10-30'], lost: [] },
          '2026-10-19',
        )!.text,
      ),
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

  it('avec une date de fin, la case avertit de la dose perdue, même loin de la suivante (V28 bis)', () => {
    const ended = treatment(
      [{ ...VENDREDI, endsOn: '2026-10-30' }],
      [dose('2026-10-09', '2026-10-16')],
    )

    expect(help(otherDateBox(t, DUE_16, '2026-10-19', carnet(ended, '2026-10-19'), true))).toEqual({
      text: 'Avec le décalage, la dose du 30 oct. ne sera plus prévue (date de fin).',
      warning: true,
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

  function boxOf(withPeriods: TreatmentWithPeriods) {
    return dateChangeBox(t, report, carnet(withPeriods, today))!
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
    const withPeriods = treatment(
      [VENDREDI],
      [...PIXEL.doses, prise, shifted('2026-10-16', '2026-10-19')],
    )
    const box = dateChangeBox(t, prise, carnet(withPeriods, '2026-10-21'))!

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

describe('G19 : les jours qui ne laisseraient aucune date au report seul sont refusés', () => {
  // Vendredis ; le 16 donnée le lundi 19 avec décalage, le 26 reporté seul au 30 ; aujourd’hui le 8 nov.
  const prise = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
  const withPeriods = treatment(
    [VENDREDI],
    [
      dose('2026-10-09', '2026-10-16'),
      prise,
      shifted('2026-10-16', '2026-10-19'),
      postponed('2026-10-26', '2026-10-30'),
    ],
  )
  const today = '2026-11-08'

  it('« Changer la date » grise ces jours et le dit', () => {
    const box = dateChangeBox(t, prise, carnet(withPeriods, today))!

    expect(box.refusedDays(true)).toContain('2026-10-17')
    expect(box.view('2026-10-17', true)).toMatchObject({ blocked: true })
    expect(plain(box.view('2026-10-17', true).help!.text)).toBe(
      'Avec ce jour, la dose que tu avais reportée au 30 oct. ne pourrait plus tomber au bon moment. Change d’abord la date de ce report.',
    )
  })

  it('« Fait à une autre date » coché : un report seul après la prise suit, rien n’est refusé (#786)', () => {
    const held = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), postponed('2026-10-23', '2026-10-27')],
    )
    const view = otherDateBox(t, DUE_16, '2026-10-19', carnet(held, '2026-10-19'), true)

    expect(view.shown).toBe(true)
    expect(view.blocked).toBeUndefined()
  })
})

describe('otherDateNote — ce que « Fait à une autre date » enregistre', () => {
  const due9 = { settingId: 'p-1', dueOn: '2026-10-09', dueTime: null }
  const note = (givenOn: string, shiftsFollowing: boolean) => ({
    kind: 'note' as const,
    status: 'given' as const,
    due: due9,
    givenOn,
    shiftsFollowing,
  })

  it('refusé, rien ne s’enregistre ; la case montrée, son état part au moteur', () => {
    const shown = { shown: true, help: null }

    expect(otherDateNote(due9, '2026-10-14', { ...shown, blocked: true }, true)).toBeNull()
    expect(otherDateNote(due9, '2026-10-14', shown, true)).toEqual(note('2026-10-14', true))
    expect(otherDateNote(due9, '2026-10-14', shown, false)).toEqual(note('2026-10-14', false))
    expect(otherDateNote(due9, '2026-10-14', { shown: false, help: null }, true)).toEqual(
      note('2026-10-14', false),
    )
    expect(otherDateNote(null, '2026-10-14', shown, true)).toBeNull()
  })
})

describe('G19 : la correction fait suivre le report seul, et l’aide dit le calendrier enregistré', () => {
  // Vendredis ; le 16 donnée le lundi 19 avec décalage (26, 2 nov.), le 26 reporté seul au 30.
  const prise = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
  const withPeriods = treatment(
    [VENDREDI],
    [
      dose('2026-10-09', '2026-10-16'),
      prise,
      shifted('2026-10-16', '2026-10-19'),
      postponed('2026-10-26', '2026-10-30'),
    ],
  )
  const today = '2026-10-27'
  const reading = treatmentReadingOf(withPeriods, today)
  const box = dateChangeBox(t, prise, carnet(withPeriods, today))!

  function saved(date: string, shifts: boolean) {
    const { writes } = doseChange(
      withPeriods,
      reading,
      { kind: 'redate', lineId: prise.id, givenOn: date, shiftsFollowing: shifts },
      () => 'n',
    )
    const lines = writes.reduce(
      (all, write) =>
        write.action === 'rewrite'
          ? all.map((line) => (line.id === write.id ? { ...line, ...write.dose } : line))
          : write.action === 'delete'
            ? all.filter(({ id }) => id !== write.id)
            : all,
      withPeriods.doses,
    )
    return treatmentReadingOf({ ...withPeriods, doses: lines }, today).view
  }

  it.each(['2026-10-12', '2026-10-15', '2026-10-17', '2026-10-18'])(
    'au %s, case cochée : le report suit, l’aide dit le calendrier enregistré',
    (date) => {
      const after = saved(date, true)
      const moves = after.history.filter(({ line }) => line.status === 'postponed')
      expect(moves.every(({ line }) => line.targetOn! >= today)).toBe(true)
      const pending = [
        ...new Set(
          [...after.currentDoses, ...after.upcoming({ limit: 6 })].map((due) => due.dueOn),
        ),
      ].sort()
      const [first] = pending.filter((day) => day > date)
      const text = plain(box.view(date, true).help!.text)

      expect(text).toContain(String(Number(first!.slice(8))))
      expect(text.match(/30 oct\./g)?.length ?? 0).toBeLessThanOrEqual(1)
    },
  )

  it.each([true, false])(
    'au 16, case %s : le report retombe sur la dose du 30, annoncé',
    (shifts) => {
      const after = saved('2026-10-16', shifts)

      expect(after.history.some(({ line }) => line.status === 'postponed')).toBe(false)
      expect(after.upcoming({ limit: 2 }).map(({ dueOn }) => dueOn)).toEqual([
        '2026-10-30',
        '2026-11-06',
      ])
      expect(after.currentDoses.map(({ dueOn }) => dueOn)).toEqual(['2026-10-23'])
      expect(plain(box.view('2026-10-16', shifts).help!.text)).toBe(
        'La dose du 23 oct. sera en retard. La dose que tu avais reportée au 30 oct. reste prévue ce jour-là.',
      )
    },
  )

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
    const withPeriods = treatment(
      [VENDREDI],
      [...PIXEL.doses, shifted('2026-10-16', '2026-10-19'), postponed('2026-10-16', '2026-10-19')],
    )
    const book = carnet(withPeriods, '2026-10-15')

    expect(restoredSuiteFor(book, { kind: 'remove', lineId: 'décalage 2026-10-16' })).toEqual({
      nextOn: '2026-10-23',
      weekly: true,
    })
    expect(restoredSuiteFor(book, { kind: 'remove', lineId: '2026-10-09' })).toBeNull()
  })
})

describe('doneGesture — « C’est fait » de la fiche : rien ne se décale sans l’aval (2026-10-06)', () => {
  const note = (
    due: { settingId: string; dueOn: string; dueTime: string | null },
    givenOn: string,
  ) => ({
    kind: 'note' as const,
    status: 'given' as const,
    due,
    givenOn,
    shiftsFollowing: false,
  })

  it('une dose du jour se note d’un tap', () => {
    expect(doneGesture(treatmentReadingOf(PIXEL, '2026-10-16'), DUE_16, '2026-10-16')).toEqual({
      confirm: false,
      gesture: note(DUE_16, '2026-10-16'),
    })
  })

  it('une dose en retard demande la confirmation', () => {
    expect(doneGesture(treatmentReadingOf(PIXEL, '2026-10-19'), DUE_16, '2026-10-19')).toEqual({
      confirm: true,
    })
  })

  it('une dose donnée en avance aussi', () => {
    expect(doneGesture(treatmentReadingOf(PIXEL, '2026-10-14'), DUE_16, '2026-10-14')).toEqual({
      confirm: true,
    })
  })

  it('avec une date de fin, même loin de la dose suivante (V28 bis)', () => {
    const ended = treatment([{ ...VENDREDI, endsOn: '2026-10-30' }], PIXEL.doses)

    expect(doneGesture(treatmentReadingOf(ended, '2026-10-19'), DUE_16, '2026-10-19')).toEqual({
      confirm: true,
    })
  })

  it('tous les jours, pas de case : un tap qui ne décale rien (N3)', () => {
    const daily = treatment([period({ startsOn: '2026-10-14', firstDueOn: '2026-10-14' })])
    const due14 = { settingId: 'p-1', dueOn: '2026-10-14', dueTime: null }

    expect(doneGesture(treatmentReadingOf(daily, '2026-10-15'), due14, '2026-10-15')).toEqual({
      confirm: false,
      gesture: note(due14, '2026-10-15'),
    })
  })

  it('un report seul que le décalage fait passer suit le décalage (G19) : la confirmation est demandée', () => {
    const held = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), postponed('2026-10-23', '2026-10-29')],
    )

    expect(doneGesture(treatmentReadingOf(held, '2026-10-21'), DUE_16, '2026-10-21')).toEqual({
      confirm: true,
    })
  })

  it('un report avancé seul que le décalage ferait passer : un tap, la prise seule, le report est nommé (G19, G20)', () => {
    const held = treatment(
      [
        period({
          startsOn: '2027-03-27',
          firstDueOn: '2027-03-27',
          frequency: { value: 6, unit: 'week' },
          times: ['20:00'],
          endsOn: '2027-05-10',
        }),
      ],
      [postponed('2027-05-08', '2027-04-23', { dueTime: '20:00' })],
    )
    const due = { settingId: 'p-1', dueOn: '2027-03-27', dueTime: '20:00' }

    expect(doneGesture(treatmentReadingOf(held, '2027-04-10'), due, '2027-04-10')).toEqual({
      confirm: false,
      gesture: note(due, '2027-04-10'),
      heldBy: '2027-04-23',
    })
  })
})
