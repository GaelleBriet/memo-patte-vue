import { afterEach, describe, expect, it } from 'vitest'

import { dose, period, plain, shifted, treatment, written } from './treatment-fixtures'
import type { DoseAction } from '../logic/treatment-dose-writes'
import { revealedDues, revealedDuesText } from '../logic/treatment-revealed-dues'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import { dateChangeBox, otherDateBox, shiftHelpText } from '../logic/treatment-shift-box'
import { dateChangeOf, doseActionTexts } from '../logic/treatment-gestures'
import type { DoseWrite } from '../repository/treatment-doses.repository'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { createTreatmentDosesService } from '../service/treatment-doses.service'
import i18n, { applyLocale } from '@/core/i18n'
import type { Due } from '@/shared/domain/treatment-schedule'

const t = i18n.global.t

afterEach(() => applyLocale('fr'))

// Vendredis : 9, 16, 23, 30 oct.
const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
// Le 30 de chaque mois depuis le 30 août.
const LE_30 = period({
  startsOn: '2026-08-30',
  firstDueOn: '2026-08-30',
  frequency: { value: 1, unit: 'month' },
})

function due(dueOn: string, dueTime: string | null = null): Due {
  return { periodId: 'p-1', dueOn, dueTime }
}

const days = (dues: readonly Due[]) => dues.map(({ dueOn }) => dueOn)

// Le service réel, sur un carnet en mémoire que chaque lot réécrit.
async function saved(history: TreatmentWithHistory, action: DoseAction, today: string) {
  let current = history
  const service = createTreatmentDosesService({
    treatments: () => ({ getWithHistory: () => Promise.resolve(current) }),
    doses: () => ({
      applyBatch: (writes: readonly DoseWrite[]) => {
        current = written(current, writes)
        return Promise.resolve([...writes])
      },
    }),
    reminders: { reschedule: () => Promise.resolve() },
    now: () => new Date(`${today}T12:00:00.000Z`),
    today: () => today,
  })
  const change = await service.apply(history.id, action)
  return { change, after: treatmentScheduleOf(current, today) }
}

function pastWithoutDose(schedule: ReturnType<typeof treatmentScheduleOf>, today: string) {
  return {
    unlogged: days(schedule.unloggedDoses),
    overdue: days(schedule.currentDoses.filter(({ dueOn }) => dueOn < today)),
  }
}

type Case = {
  name: string
  history: TreatmentWithHistory
  today: string
  action: DoseAction
  help: () => string | undefined
  announced: { unlogged: string[]; overdue: string[] }
  text: string
}

const HEBDO_TODAY = '2026-10-27'
// Dose du 16 notée le lundi 19, avec son décalage : 26 oct. en retard.
const PRISE_16 = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
const HEBDO = treatment(
  [VENDREDI],
  [dose('2026-10-09', '2026-10-16'), PRISE_16, shifted('2026-10-16', '2026-10-19')],
)

const MENS_TODAY = '2026-12-20'
// Dose du 30 sept. notée le 25 oct., avec son décalage : 25 nov. en retard.
const PRISE_30 = dose('2026-09-30', '2026-11-25', { givenOn: '2026-10-25' })
const MENSUEL = treatment(
  [LE_30],
  [dose('2026-08-30', '2026-09-30'), PRISE_30, shifted('2026-09-30', '2026-10-25')],
)

// Dose du 16 donnée le jour ; la dose du 23 est en retard.
const AUTRE = treatment(
  [VENDREDI],
  [dose('2026-10-09', '2026-10-16'), dose('2026-10-16', '2026-10-23')],
)

function changeDateHelp(
  history: TreatmentWithHistory,
  prise: typeof PRISE_16,
  date: string,
  today: string,
) {
  const carnet = { history, schedule: treatmentScheduleOf(history, today), today }
  const change = dateChangeOf(t, prise, null, { today, earliest: null })!
  return dateChangeBox(t, prise, carnet, change.action)!.view(date, true).help?.text
}

const CASES: Case[] = [
  {
    name: 'hebdomadaire, prise corrigée plus tôt',
    history: HEBDO,
    today: HEBDO_TODAY,
    action: { kind: 'redate', doseId: PRISE_16.id, givenOn: '2026-10-12' },
    help: () => changeDateHelp(HEBDO, PRISE_16, '2026-10-12', HEBDO_TODAY),
    announced: { unlogged: ['2026-10-19'], overdue: [] },
    text: 'La dose du 19 oct. sera à renseigner.',
  },
  {
    name: 'mensuel, prise corrigée plus tôt',
    history: MENSUEL,
    today: MENS_TODAY,
    action: { kind: 'redate', doseId: PRISE_30.id, givenOn: '2026-09-28' },
    help: () => changeDateHelp(MENSUEL, PRISE_30, '2026-09-28', MENS_TODAY),
    announced: { unlogged: ['2026-10-28'], overdue: ['2026-11-28'] },
    text: 'La dose du 28 oct. sera à renseigner ; celle du 28 nov., en retard.',
  },
  {
    name: '« Fait à une autre date », case cochée',
    history: AUTRE,
    today: HEBDO_TODAY,
    action: {
      kind: 'note',
      gesture: {
        kind: 'given',
        due: due('2026-10-23'),
        givenOn: '2026-10-19',
        shiftsFollowing: true,
      },
    },
    help: () =>
      otherDateBox(
        t,
        due('2026-10-23'),
        '2026-10-19',
        { history: AUTRE, schedule: treatmentScheduleOf(AUTRE, HEBDO_TODAY), today: HEBDO_TODAY },
        true,
      ).help?.text,
    announced: { unlogged: [], overdue: ['2026-10-26'] },
    text: 'La dose du 26 oct. sera en retard.',
  },
]

describe('revealedDues — les doses passées qu’un geste fait apparaître', () => {
  it.each(CASES)('$name : les dates annoncées sont celles du calendrier enregistré', async (c) => {
    const before = pastWithoutDose(treatmentScheduleOf(c.history, c.today), c.today)
    const { change, after } = await saved(c.history, c.action, c.today)
    const now = pastWithoutDose(after, c.today)

    const announced = {
      unlogged: days(change.revealed?.unlogged ?? []),
      overdue: days(change.revealed?.overdue ?? []),
    }
    expect(announced).toEqual(c.announced)
    expect(announced).toEqual({
      unlogged: now.unlogged.filter((day) => !before.unlogged.includes(day)),
      overdue: now.overdue.filter((day) => !before.overdue.includes(day)),
    })
  })

  it.each(CASES)('$name : l’aide sous la case l’annonce', (c) => {
    expect(plain(c.help())).toContain(c.text)
  })

  it('une dose déjà en retard avant la correction n’est pas annoncée', () => {
    const before = treatmentScheduleOf(HEBDO, HEBDO_TODAY)
    expect(days(before.currentDoses)).toEqual(['2026-10-26'])
    const after = treatmentScheduleOf(
      treatment(
        [VENDREDI],
        [
          dose('2026-10-09', '2026-10-16'),
          { ...PRISE_16, givenOn: '2026-10-12' },
          shifted('2026-10-16', '2026-10-12'),
        ],
      ),
      HEBDO_TODAY,
    )

    expect(revealedDues(before, after, HEBDO_TODAY)).toEqual({
      unlogged: [due('2026-10-19')],
      overdue: [],
    })
  })

  it.each<[string, DoseAction]>([
    [
      'prise corrigée au lendemain',
      { kind: 'redate', doseId: '2026-10-08', givenOn: '2026-10-09' },
    ],
    [
      'dose donnée le lendemain',
      {
        kind: 'note',
        gesture: {
          kind: 'given',
          due: due('2026-10-09'),
          givenOn: '2026-10-10',
          shiftsFollowing: true,
        },
      },
    ],
  ])('quotidien, %s : aucune dose passée annoncée', async (_, action) => {
    const today = '2026-10-11'
    const QUOTIDIEN = period({ startsOn: '2026-10-07', firstDueOn: '2026-10-07' })
    const history = treatment(
      [QUOTIDIEN],
      ['2026-10-07', '2026-10-08'].map((day) => dose(day, day)),
    )
    const { change, after } = await saved(history, action, today)

    expect(change.revealed).toEqual({ unlogged: [], overdue: [] })
    expect(days(after.upcoming(1))).toEqual([today])
  })
})

describe('revealedDuesText', () => {
  const one = [due('2026-10-19')]
  const two = [due('2026-10-12'), due('2026-10-19')]
  const late = [due('2026-10-26')]
  const lateHours = [due('2026-10-26', '08:00'), due('2026-10-26', '20:00')]

  it('dans l’aide, au futur', () => {
    const help = (unlogged: Due[], overdue: Due[]) =>
      plain(revealedDuesText(t, { unlogged, overdue }, 'help'))

    expect(help([], [])).toBeNull()
    expect(help(one, [])).toBe('La dose du 19 oct. sera à renseigner.')
    expect(help(two, [])).toBe('Les doses du 12, 19 oct. seront à renseigner.')
    expect(help([], late)).toBe('La dose du 26 oct. sera en retard.')
    expect(help([], lateHours)).toBe('Les doses du 26 oct. seront en retard.')
    expect(help(one, late)).toBe(
      'La dose du 19 oct. sera à renseigner ; celle du 26 oct., en retard.',
    )
    expect(help(two, lateHours)).toBe(
      'Les doses du 12, 19 oct. seront à renseigner ; celles du 26 oct., en retard.',
    )
  })

  it('dans le toast, au présent', () => {
    const toast = (unlogged: Due[], overdue: Due[]) =>
      plain(revealedDuesText(t, { unlogged, overdue }, 'toast'))

    expect(toast(one, [])).toBe('La dose du 19 oct. est à renseigner.')
    expect(toast(two, [])).toBe('Les doses du 12, 19 oct. sont à renseigner.')
    expect(toast([], late)).toBe('La dose du 26 oct. est en retard.')
    expect(toast([], lateHours)).toBe('Les doses du 26 oct. sont en retard.')
    expect(toast(one, late)).toBe(
      'La dose du 19 oct. est à renseigner ; celle du 26 oct., en retard.',
    )
    expect(toast(two, lateHours)).toBe(
      'Les doses du 12, 19 oct. sont à renseigner ; celles du 26 oct., en retard.',
    )
  })

  it('en anglais', () => {
    applyLocale('en')
    const text = (unlogged: Due[], overdue: Due[], tense: 'help' | 'toast') =>
      plain(revealedDuesText(t, { unlogged, overdue }, tense))

    expect(text(one, [], 'help')).toBe('The Oct 19 dose will need to be logged.')
    expect(text(two, [], 'help')).toBe('The Oct 12, 19 doses will need to be logged.')
    expect(text([], late, 'help')).toBe('The Oct 26 dose will be overdue.')
    expect(text([], lateHours, 'help')).toBe('The Oct 26 doses will be overdue.')
    expect(text(one, late, 'help')).toBe(
      'The Oct 19 dose will need to be logged; the Oct 26 one will be overdue.',
    )
    expect(text(two, lateHours, 'help')).toBe(
      'The Oct 12, 19 doses will need to be logged; the Oct 26 ones will be overdue.',
    )
    expect(text(one, [], 'toast')).toBe('The Oct 19 dose needs to be logged.')
    expect(text(two, [], 'toast')).toBe('The Oct 12, 19 doses need to be logged.')
    expect(text([], late, 'toast')).toBe('The Oct 26 dose is overdue.')
    expect(text([], lateHours, 'toast')).toBe('The Oct 26 doses are overdue.')
    expect(text(one, late, 'toast')).toBe(
      'The Oct 19 dose needs to be logged; the Oct 26 one is overdue.',
    )
  })
})

describe('le toast du geste annonce les doses passées', () => {
  const context = { name: 'Panacur', animal: 'Pixel', today: '2026-10-27', severalTimes: false }
  const applied = {
    postponement: null,
    moved: null,
    shiftKept: false,
    revealed: { unlogged: [due('2026-10-19')], overdue: [due('2026-10-26')] },
  }

  it('après « Changer la date »', () => {
    const texts = doseActionTexts(
      t,
      context,
      { kind: 'redate', doseId: 'prise', givenOn: '2026-10-12' },
      null,
    )

    expect(plain(texts.done(applied))).toBe(
      'Prise déplacée au 12 oct. La dose du 19 oct. est à renseigner ; celle du 26 oct., en retard.',
    )
  })

  it('après « Fait à une autre date »', () => {
    const texts = doseActionTexts(
      t,
      context,
      { kind: 'note', gesture: { kind: 'given', due: due('2026-10-23'), givenOn: '2026-10-19' } },
      null,
    )

    expect(
      plain(texts.done({ ...applied, revealed: { unlogged: [], overdue: [due('2026-10-26')] } })),
    ).toBe('Prise de Panacur du 19 oct. notée pour Pixel. La dose du 26 oct. est en retard.')
  })

  it('sans dose passée, le toast ne change pas', () => {
    const texts = doseActionTexts(
      t,
      context,
      { kind: 'redate', doseId: 'prise', givenOn: '2026-10-12' },
      null,
    )

    expect(plain(texts.done({ ...applied, revealed: { unlogged: [], overdue: [] } }))).toBe(
      'Prise déplacée au 12 oct.',
    )
  })
})

describe('l’aide sous la case ne cite que des dates à venir', () => {
  it('hebdomadaire : les doses passées sont dans la phrase des doses passées', () => {
    expect(plain(changeDateHelp(HEBDO, PRISE_16, '2026-10-12', HEBDO_TODAY))).toBe(
      'Les doses suivantes passeront au 2 nov., puis toutes les semaines. La dose du 19 oct. sera à renseigner.',
    )
  })

  it('mensuel', () => {
    expect(plain(changeDateHelp(MENSUEL, PRISE_30, '2026-09-28', MENS_TODAY))).toBe(
      'Les doses suivantes passeront au 28 déc., puis tous les mois. La dose du 28 oct. sera à renseigner ; celle du 28 nov., en retard.',
    )
  })

  it('« Fait à une autre date »', () => {
    const help = otherDateBox(
      t,
      due('2026-10-23'),
      '2026-10-19',
      { history: AUTRE, schedule: treatmentScheduleOf(AUTRE, HEBDO_TODAY), today: HEBDO_TODAY },
      true,
    ).help?.text

    expect(plain(help)).toBe(
      'Les doses suivantes passeront au 2 nov., puis toutes les semaines. La dose du 26 oct. sera en retard.',
    )
  })
})

describe('finitions de la revue', () => {
  it('le jour même de l’échéance, sans case, l’aide annonce aussi les doses passées', () => {
    const carnet = {
      history: HEBDO,
      schedule: treatmentScheduleOf(HEBDO, HEBDO_TODAY),
      today: HEBDO_TODAY,
    }
    const change = dateChangeOf(t, PRISE_16, null, { today: HEBDO_TODAY, earliest: null })!
    const view = dateChangeBox(t, PRISE_16, carnet, change.action)!.view('2026-10-16', true)

    expect(view.shown).toBe(false)
    expect(plain(view.help)).toEqual({ text: 'La dose du 23 oct. sera en retard.', warning: false })
  })

  it.each([
    ['2026-06', 'juin'],
    ['2026-10', 'oct.'],
  ])('un report nommé après la date finit la phrase par un seul point (%s)', (month, name) => {
    const weekly = { frequency: { value: 1, unit: 'week' as const } }
    const options = {
      following: [`${month}-26`, `${month}-30`],
      lost: [],
      arrivals: [`${month}-30`],
    }
    const end = name.replace(/\.$/, '')

    expect(plain(shiftHelpText(t, weekly, { ...options, shifts: true }, `${month}-20`)!.text)).toBe(
      `Les doses suivantes passeront au 26 ${name}, puis dose reportée le 30 ${end}.`,
    )
    expect(
      plain(shiftHelpText(t, weekly, { ...options, shifts: false }, `${month}-20`)!.text),
    ).toBe(
      `Seule cette dose change. Les suivantes restent prévues le 26 ${name}, puis dose reportée le 30 ${end}.`,
    )
  })

  it('une dose en retard avant le geste, à renseigner après, n’est pas annoncée', () => {
    expect(
      revealedDues(
        { unloggedDoses: [], currentDoses: [due('2026-10-23')] },
        { unloggedDoses: [due('2026-10-23')], currentDoses: [due('2026-10-26')] },
        '2026-10-27',
      ),
    ).toEqual({ unlogged: [], overdue: [due('2026-10-26')] })
  })
})
