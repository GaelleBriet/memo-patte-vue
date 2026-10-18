// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  treatmentView,
  type Line,
  type Setting,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { setting, WEEK } from './dose-calendar.v2.aides'

// #882, #883 : la règle de #867 (« le plus récent l'emporte ») vaut à chaque contradiction entre un
// report et la réécriture de son réglage faite sur un autre téléphone (décision du 17 octobre 2026).

const MATIN = '2026-04-08T09:00:00.000Z'
const SOIR = '2026-04-08T18:00:00.000Z'
const THREE_DAYS = { value: 3, unit: 'day' as const }
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
    shifts = false,
  ) {
    const s1 = setting('s1', '2026-04-10', WEEK, ['08:00'], {
      startsOn: '2026-04-03',
      createdAt: '2026-04-03T08:00:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-04-08' }
    const parA = moved(base, from, '08:00', to, shifts)
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

  // Le décalage d'un report gagnant parti après la première échéance garde la lecture d'avant (§11).
  it('avec « Décaler aussi les doses suivantes », A plus récent : le report tient, son décalage reste dépassé : le 9, le 12, puis le 16', () => {
    const { merged, report } = luna(
      '2026-04-10',
      '2026-04-12',
      '2026-04-09',
      { reportAt: SOIR, rewrittenAt: MATIN },
      true,
    )
    const shift = merged.lines.find(({ status }) => status === 'shift')!
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-04-12' })
    expect(effectOf(merged, shift.id)).toEqual({ kind: 'idle', reason: 'overtaken' })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-09 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-09 08:00', '2026-04-12 08:00', '2026-04-16 08:00'],
      }),
    )
  })

  it('avec « Décaler aussi les doses suivantes », B plus récent : le report et son décalage sont sans effet, puis le 9, le 16 et le 23', () => {
    const { merged, report } = luna(
      '2026-04-10',
      '2026-04-12',
      '2026-04-09',
      { reportAt: MATIN, rewrittenAt: SOIR },
      true,
    )
    const shift = merged.lines.find(({ status }) => status === 'shift')!
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(effectOf(merged, shift.id)).toEqual({ kind: 'idle', reason: 'overtaken' })
    expect(readings(merged).moteur.ensuite).toEqual([
      '2026-04-09 08:00',
      '2026-04-16 08:00',
      '2026-04-23 08:00',
    ])
    expect(readings(merged).reference).toEqual(readings(merged).moteur)
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

describe('#882, sens inverse (graine 8710000057) : « Prochaine dose » a ôté la journée de départ après la nouvelle première échéance', () => {
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

  // Un seul téléphone ne distingue pas ce report d'un report dont la journée n'existait que par une
  // ligne supprimée ensuite : la lecture d'avant reste (§11, relecture de la PR #934).
  it('A plus récent : la lecture d’avant, le report reste sans effet', () => {
    const { merged, report } = deuxSemaines({ reportAt: SOIR, rewrittenAt: MATIN })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(treatmentView(merged).slots('2026-03-15', '2026-03-27')).toEqual([])
  })

  it('B plus récent : le report est sans effet, rien le 16', () => {
    const { merged, report } = deuxSemaines({ reportAt: MATIN, rewrittenAt: SOIR })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(treatmentView(merged).slots('2026-03-15', '2026-03-27')).toEqual([])
  })
})

describe('#883 (graine 8710000013) : un report plus récent dont seule l’heure disparaît du réglage réécrit garde son jour et son heure', () => {
  // Tous les 3 jours à 8 h, 14 h et 20 h depuis le 3 avril, fin le 28 mai ; le 3, 8 h marquée oubliée,
  // 20 h donnée d'avance le 1er ; A reporte 14 h au 6 mai avec « Décaler aussi les doses suivantes » ;
  // B, sans voir ce report, passe à 8 h et 20 h.
  function troisJours(stamps: { reportAt: string; rewrittenAt: string }) {
    const HOURS = ['08:00', '14:00', '20:00']
    const facts = { endsOn: '2026-05-28', createdAt: '2026-04-01T08:00:00.000Z' }
    const s1 = setting('s1', '2026-04-03', THREE_DAYS, HOURS, facts)
    const notes: Line[] = [
      {
        id: 'l1',
        settingId: 's1',
        dueOn: '2026-04-03',
        dueTime: '08:00',
        status: 'missed',
        givenOn: null,
        targetOn: null,
        updatedAt: '2026-04-01T09:00:00.000Z',
      },
      {
        id: 'l2',
        settingId: 's1',
        dueOn: '2026-04-03',
        dueTime: '20:00',
        status: 'given',
        givenOn: '2026-04-01',
        targetOn: null,
        updatedAt: '2026-04-01T10:00:00.000Z',
      },
    ]
    const s2 = setting('s2', '2026-04-03', THREE_DAYS, HOURS, {
      ...facts,
      gridOriginOn: null,
      firstDueChosen: false,
      createdAt: '2026-04-02T08:00:00.000Z',
    })
    const base: TreatmentViewInput = { settings: [s1, s2], lines: notes, today: '2026-04-03' }
    const parA = moved(base, '2026-04-03', '14:00', '2026-05-06', true)
    const parB = edited(base, {
      frequency: THREE_DAYS,
      times: ['08:00', '20:00'],
      endsOn: '2026-05-28',
    })
    return synchronises(base, parA, parB, stamps)
  }

  it('B réécrit le réglage sur place, à 8 h et 20 h, première dose le 3 avril', () => {
    const { merged } = troisJours({ reportAt: SOIR, rewrittenAt: MATIN })
    expect(merged.settings).toHaveLength(2)
    expect(merged.settings[1]).toMatchObject({ times: ['08:00', '20:00'], updatedAt: MATIN })
  })

  it('A plus récent : le 6 mai à 14 h, puis le 9 mai à 8 h et 20 h', () => {
    const { merged, report } = troisJours({ reportAt: SOIR, rewrittenAt: MATIN })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-05-06 14:00'],
        aRenseigner: [],
        ensuite: ['2026-05-06 14:00', '2026-05-09 08:00', '2026-05-09 20:00'],
      }),
    )
    expect(effectOf(merged, report.id)).toMatchObject({ kind: 'moves', arrival: '2026-05-06' })
  })

  it('B plus récent : le report est sans effet, la dose de 14 h n’arrive pas le 6 mai', () => {
    const { merged, report } = troisJours({ reportAt: MATIN, rewrittenAt: SOIR })
    expect(effectOf(merged, report.id)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(treatmentView(merged).slots('2026-05-06', '2026-05-06')).toEqual([])
  })
})
