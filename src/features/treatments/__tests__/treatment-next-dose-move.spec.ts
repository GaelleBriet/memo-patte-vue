import { afterEach, describe, expect, it } from 'vitest'
import { ZodError } from 'zod'

import { dose, period, plain, postponed, shifted, treatment } from './treatment-fixtures'
import { treatmentEditionSchemaFor } from '../logic/treatment-edition-checks'
import { editionDraft } from '../logic/treatment-edition-draft'
import { editionPlan } from '../logic/treatment-edition-plan'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { nextDoseShiftHelp } from '../logic/treatment-form-texts'
import type { TreatmentEditionInput } from '../schema/treatment-form.schema'
import type { TreatmentPlanWrite } from '../schema/treatment-plan.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

function ids() {
  let count = 0
  return { periodId: 'nouvelle-periode', newId: () => `nouvelle-${(count += 1)}` }
}

function saisie(
  history: TreatmentWithHistory,
  changes: Partial<TreatmentEditionInput> = {},
): TreatmentEditionInput {
  const current = history.periods.at(-1)!
  return {
    name: history.name,
    type: history.type,
    frequency: current.frequency,
    times: current.times,
    doseQuantity: current.doseQuantity,
    doseUnit: current.doseUnit,
    endsOn: current.endsOn,
    nextDoseOn: null,
    ...changes,
  }
}

function champsRefuses(
  history: TreatmentWithHistory,
  input: TreatmentEditionInput,
  today: string,
): string[] {
  const result = treatmentEditionSchemaFor(history, today).safeParse(input)
  return result.success
    ? []
    : result.error.issues.map((issue) => `${String(issue.path[0])}:${issue.message}`)
}

function dosesAfter(history: TreatmentWithHistory, { doses }: TreatmentPlanWrite) {
  return doses.reduce((lines, write) => {
    if (write.action === 'delete') return lines.filter(({ id }) => id !== write.id)
    if (write.action === 'rewrite') {
      return lines.map((line) => (line.id === write.id ? { ...line, ...write.dose } : line))
    }
    const { id, dose: fields } = write
    return [...lines, { ...dose(fields.dueOn, fields.targetOn ?? fields.dueOn), ...fields, id }]
  }, history.doses)
}

function upcomingAfter(
  history: TreatmentWithHistory,
  plan: TreatmentPlanWrite,
  today: string,
  count: number,
): string[] {
  const after = { ...history, doses: dosesAfter(history, plan) }
  return treatmentReadingOf(after, today)
    .view.upcoming({ limit: count })
    .map(({ dueOn }) => dueOn)
}

afterEach(() => applyLocale('fr'))

describe('« Prochaine dose » seule : un report, jamais un nouveau réglage (TR-9, Q17, R7)', () => {
  const MILBEMAX = treatment(
    [
      period({
        startsOn: '2026-09-07',
        firstDueOn: '2026-09-07',
        frequency: { value: 1, unit: 'week' },
      }),
    ],
    [dose('2026-09-07', '2026-09-14'), dose('2026-09-14', '2026-09-21')],
  )
  const TODAY = '2026-09-17'

  it('décochée, écrit la ligne « Reportée » seule : la suite reste', () => {
    const plan = editionPlan(
      MILBEMAX,
      saisie(MILBEMAX, { nextDoseOn: '2026-09-24', shiftsFollowing: false }),
      TODAY,
      ids(),
    )

    expect(plan.period).toBeNull()
    expect(plan.doses).toEqual([
      {
        action: 'create',
        id: 'nouvelle-1',
        dose: {
          periodId: 'p-1',
          dueOn: '2026-09-21',
          dueTime: null,
          givenOn: null,
          status: 'postponed',
          targetOn: '2026-09-24',
        },
      },
    ])
    expect(upcomingAfter(MILBEMAX, plan, TODAY, 3)).toEqual([
      '2026-09-24',
      '2026-09-28',
      '2026-10-05',
    ])
  })

  it('cochée, écrit le report et son décalage : la suite suit', () => {
    const plan = editionPlan(MILBEMAX, saisie(MILBEMAX, { nextDoseOn: '2026-09-24' }), TODAY, ids())

    expect(plan.period).toBeNull()
    expect(plan.doses.map(({ action }) => action)).toEqual(['create', 'create'])
    expect(plan.doses).toMatchObject([
      { dose: { status: 'postponed', dueOn: '2026-09-21', targetOn: '2026-09-24' } },
      { dose: { status: 'shift', targetOn: '2026-09-24' } },
    ])
    expect(upcomingAfter(MILBEMAX, plan, TODAY, 3)).toEqual([
      '2026-09-24',
      '2026-10-01',
      '2026-10-08',
    ])
  })

  it('avance la dose par la même ligne, d’après son échéance d’origine', () => {
    const plan = editionPlan(MILBEMAX, saisie(MILBEMAX, { nextDoseOn: '2026-09-18' }), TODAY, ids())

    expect(plan.period).toBeNull()
    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-09-21', targetOn: '2026-09-18' } },
      { action: 'create', dose: { status: 'shift', targetOn: '2026-09-18' } },
    ])
  })

  it('un changement de posologie avec la date ouvre un réglage (R9) : le report n’est pas écrit', () => {
    const plan = editionPlan(
      MILBEMAX,
      saisie(MILBEMAX, { nextDoseOn: '2026-09-24', doseQuantity: 2, doseUnit: 'tablet' }),
      TODAY,
      ids(),
    )

    expect(plan.period).toMatchObject({ action: 'open' })
    expect(plan.doses).toEqual([])
  })

  it('n’écrit rien quand « Prochaine dose » garde la date proposée', () => {
    expect(
      editionPlan(MILBEMAX, saisie(MILBEMAX, { nextDoseOn: '2026-09-21' }), TODAY, ids()),
    ).toEqual({
      treatment: { name: 'Métacam', type: 'medication' },
      period: null,
      doses: [],
    })
  })

  describe('une dose déjà reportée', () => {
    const REPORTEE = treatment(MILBEMAX.periods, [
      ...MILBEMAX.doses,
      postponed('2026-09-21', '2026-09-24', { updatedAt: '2026-09-16T08:00:00.000Z' }),
      shifted('2026-09-21', '2026-09-24', { updatedAt: '2026-09-16T08:00:00.000Z' }),
    ])

    it('propose la date du report et garde en aide la date calculée (Q18)', () => {
      expect(editionDraft(REPORTEE, null, TODAY).nextDose).toMatchObject({
        change: 'move',
        proposedOn: '2026-09-24',
        help: { kind: 'calculated', on: '2026-09-21' },
      })
    })

    it('réécrit sa ligne et son décalage à la nouvelle date', () => {
      const plan = editionPlan(
        REPORTEE,
        saisie(REPORTEE, { nextDoseOn: '2026-09-26' }),
        TODAY,
        ids(),
      )

      expect(plan.doses).toMatchObject([
        {
          action: 'rewrite',
          id: 'report 2026-09-21',
          dose: { dueOn: '2026-09-21', targetOn: '2026-09-26' },
        },
        {
          action: 'rewrite',
          id: 'décalage 2026-09-21',
          dose: { status: 'shift', targetOn: '2026-09-26' },
        },
      ])
    })

    it('supprime la ligne et son décalage quand la dose revient à sa date d’origine', () => {
      const plan = editionPlan(
        REPORTEE,
        saisie(REPORTEE, { nextDoseOn: '2026-09-21' }),
        TODAY,
        ids(),
      )

      expect(plan.doses).toEqual([
        { action: 'delete', id: 'report 2026-09-21' },
        { action: 'delete', id: 'décalage 2026-09-21' },
      ])
    })
  })

  it('refuse une date avant la borne du moteur, sans rien écrire', () => {
    const input = saisie(MILBEMAX, { nextDoseOn: '2026-09-16' })

    expect(champsRefuses(MILBEMAX, input, TODAY)).toEqual(['nextDoseOn:tooEarly'])
    expect(() => editionPlan(MILBEMAX, input, TODAY, ids())).toThrow(ZodError)
  })

  it('grise le champ et donne la raison du moteur quand une dose plus lointaine est déjà reportée (Q26)', () => {
    const quotidien = treatment(
      [period({ startsOn: '2026-09-20', firstDueOn: '2026-09-20' })],
      [postponed('2026-10-05', '2026-10-07')],
    )

    expect(editionDraft(quotidien, null, '2026-09-28').nextDose).toMatchObject({
      change: 'move',
      refusal: { reason: 'later-line' },
      help: { kind: 'refused', refusal: { reason: 'later-line' } },
    })
    expect(
      champsRefuses(quotidien, saisie(quotidien, { nextDoseOn: '2026-09-30' }), '2026-09-28'),
    ).toEqual(['nextDoseOn:refused'])
  })
})

describe('« Prochaine dose » et la date de fin', () => {
  const HEBDO = period({
    startsOn: '2026-09-26',
    firstDueOn: '2026-09-26',
    frequency: { value: 1, unit: 'week' },
    endsOn: '2026-10-10',
  })
  const HISTORY = treatment([HEBDO], [dose('2026-09-26', '2026-10-03')])

  it('refuse une prochaine dose après la date de fin (Q20)', () => {
    const input = saisie(HISTORY, { nextDoseOn: '2026-11-01' })

    expect(champsRefuses(HISTORY, input, '2026-09-28')).toEqual(['nextDoseOn:afterEnd'])
    expect(() => editionPlan(HISTORY, input, '2026-09-28', ids())).toThrow(ZodError)
  })

  it('accepte une prochaine dose au-delà de l’ancienne fin quand la date de fin change dans la même saisie', () => {
    const plan = editionPlan(
      HISTORY,
      saisie(HISTORY, { endsOn: '2026-11-05', nextDoseOn: '2026-10-12' }),
      '2026-09-28',
      ids(),
    )

    expect(plan.period).toMatchObject({ action: 'correct', settings: { endsOn: '2026-11-05' } })
    expect(plan.doses).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-03', targetOn: '2026-10-12' } },
      { action: 'create', dose: { status: 'shift', targetOn: '2026-10-12' } },
    ])
  })

  describe('un report en vigueur (Q30)', () => {
    const MENSUEL = period({
      startsOn: '2026-09-07',
      firstDueOn: '2026-09-07',
      frequency: { value: 1, unit: 'month' },
    })
    const reported = (target: string, lines: ReturnType<typeof dose>[] = []) =>
      treatment(
        [MENSUEL],
        [dose('2026-09-07', '2026-10-07'), postponed('2026-10-07', target), ...lines],
      )
    const TODAY = '2026-10-08'

    it('refuse une date de fin avant l’arrivée du report, sans rien écrire', () => {
      const history = reported('2026-10-14')
      const input = saisie(history, { endsOn: '2026-10-12' })

      expect(champsRefuses(history, input, TODAY)).toEqual(['endsOn:beforePostponedDose'])
      expect(() => editionPlan(history, input, TODAY, ids())).toThrow(ZodError)
    })

    it('refuse de même une date de fin avant l’arrivée d’une dose avancée', () => {
      const history = reported('2026-10-05')

      expect(
        champsRefuses(history, saisie(history, { endsOn: '2026-10-04' }), '2026-10-03'),
      ).toEqual(['endsOn:beforeAdvancedDose'])
    })

    it('accepte une date de fin le jour d’arrivée du report', () => {
      const history = reported('2026-10-14')

      expect(champsRefuses(history, saisie(history, { endsOn: '2026-10-14' }), TODAY)).toEqual([])
    })

    it('accepte la date de fin quand « Prochaine dose » est remise avant elle dans la même saisie', () => {
      const history = reported('2026-10-14', [shifted('2026-10-07', '2026-10-14')])

      const plan = editionPlan(
        history,
        saisie(history, { endsOn: '2026-10-12', nextDoseOn: '2026-10-11' }),
        TODAY,
        ids(),
      )

      expect(plan.period).toMatchObject({ action: 'correct', settings: { endsOn: '2026-10-12' } })
      expect(plan.doses).toMatchObject([
        { action: 'rewrite', id: 'report 2026-10-07', dose: { targetOn: '2026-10-11' } },
        { action: 'rewrite', dose: { status: 'shift', targetOn: '2026-10-11' } },
      ])
    })

    it('compare la date de fin au report le plus lointain, même quand ce n’est pas la prochaine dose (G14)', () => {
      const hebdo = period({
        startsOn: '2026-09-25',
        firstDueOn: '2026-09-25',
        frequency: { value: 1, unit: 'week' },
      })
      const history = treatment(
        [hebdo],
        [dose('2026-09-25', '2026-10-02'), postponed('2026-10-09', '2026-10-20')],
      )

      expect(editionDraft(history, null, '2026-10-03')).toMatchObject({
        nextDose: { proposedOn: '2026-10-02' },
        farthestMove: { arrivesOn: '2026-10-20', advanced: false },
      })
      expect(
        champsRefuses(history, saisie(history, { endsOn: '2026-10-15' }), '2026-10-03'),
      ).toEqual(['endsOn:beforeFarPostponedDose'])
      expect(
        champsRefuses(history, saisie(history, { endsOn: '2026-10-20' }), '2026-10-03'),
      ).toEqual([])
    })
  })
})

describe('la case « Décaler aussi les doses suivantes » de « Prochaine dose » (V28, Q2)', () => {
  const VENDREDI = period({
    startsOn: '2026-10-09',
    firstDueOn: '2026-10-09',
    frequency: { value: 1, unit: 'week' },
  })
  const PIXEL = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])
  const TODAY = '2026-10-14'

  function helpOf(history: TreatmentWithHistory, nextDoseOn: string, shiftsFollowing: boolean) {
    const draft = editionDraft(history, null, TODAY, nextDoseOn, shiftsFollowing)
    const help = nextDoseShiftHelp(t, draft, { shiftsFollowing })
    return help === null ? null : { ...help, text: plain(help.text) }
  }

  it('n’apparaît que quand la date change', () => {
    expect(editionDraft(PIXEL, null, TODAY).nextDose?.shift).toBeNull()
    expect(editionDraft(PIXEL, null, TODAY, '2026-10-16').nextDose?.shift).toBeNull()
    expect(editionDraft(PIXEL, null, TODAY, '2026-10-19').nextDose?.shift).not.toBeNull()
  })

  it('dit où vont les doses suivantes, cochée ou non', () => {
    expect(helpOf(PIXEL, '2026-10-19', true)).toEqual({
      text: 'Les doses suivantes passeront au lundi : 26 oct., 2 nov.',
      warning: false,
    })
    expect(helpOf(PIXEL, '2026-10-19', false)).toEqual({
      text: 'Seule cette dose change. Les suivantes restent le vendredi : 23, 30 oct.',
      warning: false,
    })
  })

  it('pas de case quand la première échéance d’une période sans prise change', () => {
    const sansPrise = treatment([
      period({
        startsOn: '2026-10-10',
        firstDueOn: '2026-10-10',
        frequency: { value: 1, unit: 'week' },
      }),
    ])

    expect(editionDraft(sansPrise, null, '2026-09-28', '2026-10-17').nextDose).toMatchObject({
      change: 'first-due',
      shift: null,
    })
  })

  it('dit la dose que la date de fin ferait perdre (V28 bis)', () => {
    const fin = treatment([{ ...VENDREDI, endsOn: '2026-10-30' }], PIXEL.doses)

    expect(helpOf(fin, '2026-10-19', true)?.warning).toBe(true)
  })

  it('se rouvre telle qu’elle a été laissée (N2) : décochée sur un report sans décalage', () => {
    const seul = postponed('2026-10-16', '2026-10-19')
    const decalage = shifted('2026-10-16', '2026-10-19')
    const book = (...lines: ReturnType<typeof dose>[]) =>
      treatment([VENDREDI], [...PIXEL.doses, ...lines])

    expect(editionDraft(PIXEL, null, TODAY).nextDose?.shiftInitial).toBe(true)
    expect(editionDraft(book(seul), null, TODAY).nextDose?.shiftInitial).toBe(false)
    expect(editionDraft(book(seul, decalage), null, TODAY).nextDose?.shiftInitial).toBe(true)
  })

  it('décochée, la date va au plus la veille de la dose suivante (Q2 a)', () => {
    const seule = (nextDoseOn: string) => saisie(PIXEL, { nextDoseOn, shiftsFollowing: false })

    expect(editionDraft(PIXEL, null, TODAY, '2026-10-19', false).nextDose?.latest).toBe(
      '2026-10-22',
    )
    expect(champsRefuses(PIXEL, seule('2026-10-24'), TODAY)).toEqual(['nextDoseOn:afterNextDose'])
    expect(champsRefuses(PIXEL, seule('2026-10-22'), TODAY)).toEqual([])
  })
})
