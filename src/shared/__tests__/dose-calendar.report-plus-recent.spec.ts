// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Setting, type TreatmentViewInput } from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { setting, WEEK } from './dose-calendar.v2.aides'

// #882, #883 : la règle de #867 (« le plus récent l'emporte ») vaut à chaque contradiction entre un
// report et la réécriture de son réglage faite sur un autre téléphone (décision du 17 octobre 2026).

const MATIN = '2026-04-08T09:00:00.000Z'
const SOIR = '2026-04-08T18:00:00.000Z'
const TWO_WEEKS = { value: 2, unit: 'week' as const }

// Le report écrit par A et le réglage réécrit par B, chacun daté de son écriture.
function synchronises(
  base: TreatmentViewInput,
  parA: TreatmentViewInput,
  parB: TreatmentViewInput,
  { reportAt, rewrittenAt }: { reportAt: string; rewrittenAt: string },
) {
  const added = parA.lines.filter(({ id }) => !base.lines.some((line) => line.id === id))
  const rewritten = (each: Setting) => {
    const next = parB.settings.find(({ id }) => id === each.id)!
    return next.updatedAt === undefined ? next : { ...next, updatedAt: rewrittenAt }
  }
  const merged: TreatmentViewInput = {
    ...base,
    settings: base.settings.map(rewritten),
    lines: [...base.lines, ...added.map((line) => ({ ...line, updatedAt: reportAt }))],
  }
  return { merged, report: added.find(({ status }) => status === 'postponed')! }
}

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

describe('#882 : Luna, chaque semaine à 8 h, première dose le 10 avril, sans prise ; le 8, A reporte une dose, B choisit « Prochaine dose » plus tôt', () => {
  function luna(
    from: string,
    to: string,
    chosen: string,
    stamps: { reportAt: string; rewrittenAt: string },
  ) {
    const s1 = setting('s1', '2026-04-10', WEEK, ['08:00'], {
      startsOn: '2026-04-03',
      createdAt: '2026-04-03T08:00:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-04-08' }
    const parA = moved(base, from, '08:00', to, false)
    const parB = edited(base, {
      frequency: WEEK,
      times: ['08:00'],
      endsOn: null,
      firstDueOn: chosen,
    })
    return synchronises(base, parA, parB, stamps)
  }

  it('A reporte la dose du 10 au 12, B, plus récent, choisit le 9 : rien le 12, puis le 9 et le 16', () => {
    const { merged, report } = luna('2026-04-10', '2026-04-12', '2026-04-09', {
      reportAt: MATIN,
      rewrittenAt: SOIR,
    })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-09 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-09 08:00', '2026-04-16 08:00', '2026-04-23 08:00'],
      }),
    )
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
  })

  it('A, plus récent, reporte la dose du 10 au 12 et B choisit le 9 : le 9, le 12 à 8 h, puis le 16', () => {
    const { merged, report } = luna('2026-04-10', '2026-04-12', '2026-04-09', {
      reportAt: SOIR,
      rewrittenAt: MATIN,
    })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-09 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-09 08:00', '2026-04-12 08:00', '2026-04-16 08:00'],
      }),
    )
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-04-12' })
  })

  it('A reporte la dose du 17 au 19, B, plus récent, choisit le 11 : rien le 19, le 11, le 18, puis le 25', () => {
    const { merged, report } = luna('2026-04-17', '2026-04-19', '2026-04-11', {
      reportAt: MATIN,
      rewrittenAt: SOIR,
    })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-11 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-11 08:00', '2026-04-18 08:00', '2026-04-25 08:00'],
      }),
    )
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
  })
})

describe('#882, sens inverse (graine 8710000057) : un report plus récent tient quand « Prochaine dose » a ôté sa journée de départ après la nouvelle première échéance', () => {
  // Toutes les 2 semaines à 6 h, 12 h, 18 h et 23 h depuis le 11 mars, 12 h du 11 donnée ; le 14,
  // « Modifier » sans changement de rythme ; A avance la dose du 25 à 6 h au 16, B choisit
  // « Prochaine dose » le 14.
  function deuxSemaines(stamps: { reportAt: string; rewrittenAt: string }) {
    const FOUR = ['06:00', '12:00', '18:00', '23:00']
    const s1 = setting('s1', '2026-03-11', TWO_WEEKS, FOUR, {
      createdAt: '2026-03-01T08:00:00.000Z',
    })
    let base: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-03-11' }
    base = given(base, '2026-03-11', '12:00')
    base = edited(on(base, '2026-03-14'), { frequency: TWO_WEEKS, times: FOUR, endsOn: null })
    const parA = moved(base, '2026-03-25', '06:00', '2026-03-16', false)
    const parB = edited(base, {
      frequency: TWO_WEEKS,
      times: FOUR,
      endsOn: null,
      firstDueOn: '2026-03-14',
    })
    return synchronises(base, parA, parB, stamps)
  }

  it('A plus récent : le 16 porte la dose de 6 h reportée, entre le 14 et le 28', () => {
    const { merged, report } = deuxSemaines({ reportAt: SOIR, rewrittenAt: MATIN })
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-03-16' })
    const upcoming = (input: TreatmentViewInput) =>
      treatmentView(input)
        .upcoming({ limit: 7 })
        .map(({ dueOn, dueTime }) => `${dueOn} ${dueTime}`)
    expect(upcoming(merged)).toEqual([
      '2026-03-14 06:00',
      '2026-03-14 12:00',
      '2026-03-14 18:00',
      '2026-03-14 23:00',
      '2026-03-16 06:00',
      '2026-03-28 06:00',
      '2026-03-28 12:00',
    ])
  })

  it('B plus récent : le report est sans effet, rien le 16', () => {
    const { merged, report } = deuxSemaines({ reportAt: MATIN, rewrittenAt: SOIR })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(treatmentView(merged).slots('2026-03-15', '2026-03-27')).toEqual([])
  })
})
