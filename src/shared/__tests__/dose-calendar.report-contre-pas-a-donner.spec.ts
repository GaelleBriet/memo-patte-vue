// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { proposedSetting, setting, TWO_DAYS } from './dose-calendar.v2.aides'

// #867 : deux téléphones ; A reporte une dose en retard, B, qui ne voit pas ce report, répond
// « Elles n'étaient pas à donner » : la plus récente des deux intentions l'emporte.

const THREE_DAYS = { value: 3, unit: 'day' as const }
const TWO_WEEKS = { value: 2, unit: 'week' as const }
const MATIN = '2026-04-07T09:00:00.000Z'
const SOIR = '2026-04-07T18:00:00.000Z'

// Milo, tous les 3 jours à 20 h depuis le 26 mars, doses du 26, du 29 et du 1er avril données ; le 3,
// toutes les 2 semaines, première dose le 3 ; le 7, la dose du 3 est en retard. Tous les 2 jours, le 3
// est aussi une journée de l'ancien rythme, celle où il cède la place (graine 8010002409).
type Rythme = { frequency: Frequency; donnees: string[] }

const RYTHMES: [string, Rythme][] = [
  [
    'tous les 3 jours',
    { frequency: THREE_DAYS, donnees: ['2026-03-26', '2026-03-29', '2026-04-01'] },
  ],
  [
    'tous les 2 jours',
    { frequency: TWO_DAYS, donnees: ['2026-03-26', '2026-03-28', '2026-03-30', '2026-04-01'] },
  ],
]

function milo({ frequency, donnees }: Rythme, times: string[]): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-26', frequency, ['20:00'])],
    lines: [],
    today: '2026-03-26',
  }
  for (const day of donnees) {
    input = given(on(input, day), day, '20:00')
  }
  const s2 = proposedSetting('s2', '2026-04-03', TWO_WEEKS, times, {
    createdAt: '2026-04-03T08:00:00.000Z',
  })
  return { ...input, settings: [...input.settings, s2], today: '2026-04-07' }
}

// La synchro : le réglage réécrit par B, la ligne de report écrite par A, chacun à son heure.
function synchronises(
  base: TreatmentViewInput,
  parA: TreatmentViewInput,
  parB: TreatmentViewInput,
  { reportAt, correctedAt }: { reportAt: string; correctedAt: string | undefined },
): TreatmentViewInput {
  const report = parA.lines.find(({ id }) => !base.lines.some((line) => line.id === id))!
  const corrected = parB.settings.find(({ id }) => id === 's2')!
  const { updatedAt: _, ...withoutDate } = corrected
  const s2 = correctedAt === undefined ? withoutDate : { ...corrected, updatedAt: correctedAt }
  return {
    ...base,
    settings: base.settings.map((each) => (each.id === 's2' ? s2 : each)),
    lines: [...base.lines, { ...report, updatedAt: reportAt }],
  }
}

function conflitSous(rythme: Rythme, times: string[], reported: string, corrections: string[]) {
  const base = milo(rythme, times)
  const parA = moved(base, '2026-04-03', reported, '2026-04-10', false)
  const request = { frequency: TWO_WEEKS, times: corrections, endsOn: null }
  const parB = edited(base, request, 'correct')
  const report = parA.lines.find(({ id }) => !base.lines.some((line) => line.id === id))!
  return { base, parA, parB, reportId: report.id }
}

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

describe.each(RYTHMES)(
  '#867 : report de A contre « Elles n’étaient pas à donner » de B (décision de Gaelle du 16 octobre 2026), ancien rythme %s',
  (_, rythme) => {
    const conflit = (times: string[], reported: string, corrections: string[]) =>
      conflitSous(rythme, times, reported, corrections)

    it('B passe à 6 h et répond « Elles n’étaient pas à donner » : le réglage corrigé part du 17 avril', () => {
      const { parB } = conflit(['20:00'], '20:00', ['06:00'])
      expect(parB.settings.find(({ id }) => id === 's2')).toMatchObject({
        firstDueOn: '2026-04-17',
        times: ['06:00'],
      })
    })

    it('la réponse de B est la plus récente : le report est sans effet, visible, et le 10 disparaît', () => {
      const { base, parA, parB, reportId } = conflit(['20:00'], '20:00', ['06:00'])
      const merged = synchronises(base, parA, parB, { reportAt: MATIN, correctedAt: SOIR })
      expect(readings(merged)).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-17 06:00'],
          aRenseigner: [],
          ensuite: ['2026-04-17 06:00', '2026-05-01 06:00', '2026-05-15 06:00'],
        }),
      )
      expect(effectOf(merged, reportId)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    })

    it('le report de A est le plus récent : il tient, le 10 porte la dose reportée à 20 h, puis le 17 à 6 h', () => {
      const { base, parA, parB, reportId } = conflit(['20:00'], '20:00', ['06:00'])
      const merged = synchronises(base, parA, parB, { reportAt: SOIR, correctedAt: MATIN })
      expect(readings(merged)).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-10 20:00'],
          aRenseigner: [],
          ensuite: ['2026-04-10 20:00', '2026-04-17 06:00', '2026-05-01 06:00'],
        }),
      )
      expect(effectOf(merged, reportId)).toMatchObject({ kind: 'moves', arrival: '2026-04-10' })
    })

    it('le report de A est le plus récent et B passe à 21 h : le 10 garde 20 h, l’heure du report', () => {
      const { base, parA, parB } = conflit(['20:00'], '20:00', ['21:00'])
      const merged = synchronises(base, parA, parB, { reportAt: SOIR, correctedAt: MATIN })
      expect(readings(merged).moteur.ensuite).toEqual([
        '2026-04-10 20:00',
        '2026-04-17 21:00',
        '2026-05-01 21:00',
      ])
      expect(readings(merged).reference.ensuite).toEqual(readings(merged).moteur.ensuite)
    })

    it('la réponse de B est la plus récente et B passe à 21 h : le report reste sans effet, rien le 10', () => {
      const { base, parA, parB, reportId } = conflit(['20:00'], '20:00', ['21:00'])
      const merged = synchronises(base, parA, parB, { reportAt: MATIN, correctedAt: SOIR })
      expect(readings(merged)).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-17 21:00'],
          aRenseigner: [],
          ensuite: ['2026-04-17 21:00', '2026-05-01 21:00', '2026-05-15 21:00'],
        }),
      )
      expect(effectOf(merged, reportId)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    })

    it('la prise de A du 10 à 20 h couvre la dose reportée, et la suite reste au 17 à 6 h', () => {
      const { base, parA, parB } = conflit(['20:00'], '20:00', ['06:00'])
      const merged = synchronises(base, parA, parB, { reportAt: SOIR, correctedAt: MATIN })
      const done = given(on(merged, '2026-04-10'), '2026-04-10', '20:00')
      expect(readings(on(done, '2026-04-11'))).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-17 06:00'],
          aRenseigner: [],
          ensuite: ['2026-04-17 06:00', '2026-05-01 06:00', '2026-05-15 06:00'],
        }),
      )
    })

    it('lecture à confirmer : à 8 h et 20 h, A reporte la dose de 8 h (qui emmène 20 h) ; B passe à 9 h ; A plus récent : le 10 ne reçoit que 8 h, l’heure écrite dans le report', () => {
      const { base, parA, parB } = conflit(['08:00', '20:00'], '08:00', ['09:00'])
      const merged = synchronises(base, parA, parB, { reportAt: SOIR, correctedAt: MATIN })
      expect(readings(merged)).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-10 08:00'],
          aRenseigner: [],
          ensuite: ['2026-04-10 08:00', '2026-04-17 09:00', '2026-05-01 09:00'],
        }),
      )
    })

    it('sans date de réécriture du réglage : la lecture d’avant, le report sans effet', () => {
      const { base, parA, parB, reportId } = conflit(['20:00'], '20:00', ['06:00'])
      const merged = synchronises(base, parA, parB, { reportAt: SOIR, correctedAt: undefined })
      expect(readings(merged).moteur.ensuite).toEqual([
        '2026-04-17 06:00',
        '2026-05-01 06:00',
        '2026-05-15 06:00',
      ])
      expect(effectOf(merged, reportId)).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    })
  },
)
