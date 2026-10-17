// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { both, edited, given, on, readings } from './dose-calendar.reglage-corrige.aides'
import { proposedSetting, setting, TWO_DAYS } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' } as const
const TWO_WEEKS = { value: 2, unit: 'week' } as const
const MATIN = '2026-04-07T09:00:00.000Z'
const SOIR = '2026-04-07T18:00:00.000Z'

const stampOf = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`

const L = (
  id: string,
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string | null,
  n: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  settingId,
  status,
  dueOn,
  dueTime,
  givenOn: status === 'given' || status === 'extra' ? dueOn : null,
  targetOn: null,
  updatedAt: stampOf(n),
  ...extra,
})

const S = (id: string, n: number, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-03-17',
  firstDueOn: '2026-03-17',
  gridOriginOn: '2026-03-17',
  firstDueChosen: false,
  pastDosesStayUnlogged: false,
  endsOn: null,
  stoppedOn: null,
  frequency: THREE_DAYS,
  times: [],
  createdAt: stampOf(n),
  ...fields,
})

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

describe('R4, #847 : les journées laissées avant une première échéance posée plus loin se lisent sur la grille décalée (principe du 17 octobre 2026)', () => {
  // Graine 7830000046 : tous les 3 jours depuis le 17 mars ; le 31, la dose du 1er avril donnée
  // d'avance avec « Décaler aussi les doses suivantes » (la suite : 3, 6, 9 avril) ; le même jour,
  // « Prochaine dose » le 9 avril. Un autre téléphone avait noté la dose du 3 avril, donnée le 31.
  function luna(extra: Line[]): TreatmentViewInput {
    return {
      today: '2026-04-01',
      settings: [
        S('s1', 0, { firstDueChosen: true }),
        S('s2', 3, { startsOn: '2026-03-24', firstDueOn: '2026-03-23', gridOriginOn: null }),
        S('s3', 21, {
          startsOn: '2026-03-31',
          firstDueOn: '2026-04-09',
          gridOriginOn: '2026-04-09',
          firstDueChosen: true,
          endsOn: '2026-04-28',
        }),
      ],
      lines: [
        L('l19', 's2', 'given', '2026-04-01', null, 19, { givenOn: '2026-03-31' }),
        L('l20', 's2', 'shift', '2026-04-01', null, 20, { targetOn: '2026-03-31' }),
        ...extra,
      ],
    }
  }

  it('la prise du 1er avril garde son échéance, comme avant', () => {
    expect(effectOf(luna([]), 'l19')).toEqual({ kind: 'covers', key: '2026-04-01' })
  })

  it('la prise du 3 avril, journée de la grille décalée, garde son échéance au lieu d’être sans effet', () => {
    const third = L('l30', 's2', 'given', '2026-04-03', null, 30, { givenOn: '2026-03-31' })
    expect(effectOf(luna([third]), 'l30')).toEqual({ kind: 'covers', key: '2026-04-03' })
    expect(treatmentView(luna([third])).currentDoses.map(({ dueOn }) => dueOn)).toEqual([
      '2026-04-09',
    ])
  })
})

// Milo, tous les 3 jours (ou tous les 2 jours) à 20 h depuis le 26 mars, doses données ; le 3 avril,
// toutes les 2 semaines, première dose le 3 ; le 7, la dose du 3 est en retard (#867).
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

function milo({ frequency, donnees }: Rythme): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-26', frequency, ['20:00'])],
    lines: [],
    today: '2026-03-26',
  }
  for (const day of donnees) input = given(on(input, day), day, '20:00')
  const s2 = proposedSetting('s2', '2026-04-03', TWO_WEEKS, ['20:00'], {
    createdAt: '2026-04-03T08:00:00.000Z',
  })
  return { ...input, settings: [...input.settings, s2], today: '2026-04-07' }
}

// La synchro : le réglage réécrit par B, les lignes écrites par A, chacun à son heure.
function synchronises(
  base: TreatmentViewInput,
  parA: TreatmentViewInput,
  parB: TreatmentViewInput,
  { linesAt, correctedAt }: { linesAt: string; correctedAt: string },
): TreatmentViewInput {
  const added = parA.lines.filter(({ id }) => !base.lines.some((line) => line.id === id))
  const corrected = { ...parB.settings.find(({ id }) => id === 's2')!, updatedAt: correctedAt }
  return {
    ...base,
    settings: base.settings.map((each) => (each.id === 's2' ? corrected : each)),
    lines: [...base.lines, ...added.map((line) => ({ ...line, updatedAt: linesAt }))],
  }
}

const passeA6h = (base: TreatmentViewInput) =>
  edited(base, { frequency: TWO_WEEKS, times: ['06:00'], endsOn: null }, 'correct')

const noteOf = (input: TreatmentViewInput, dueOn: string) =>
  input.lines.find((line) => line.dueOn === dueOn && line.status === 'given')!

describe.each(RYTHMES)(
  '#892 : la prise de A tient face à « Elles n’étaient pas à donner » de B et garde son échéance (décision du 17 octobre 2026), ancien rythme %s',
  (_, rythme) => {
    it.each([
      ['plus ancienne', MATIN, SOIR],
      ['plus récente', SOIR, MATIN],
    ])(
      'le 7, A note donnée la dose du 3 à 20 h, B passe à 6 h et répond « Elles n’étaient pas à donner » ; prise %s : « donnée le 7, en retard » sur le 3, puis le 17 à 6 h',
      (_, linesAt, correctedAt) => {
        const base = milo(rythme)
        const parA = given(base, '2026-04-03', '20:00')
        const merged = synchronises(base, parA, passeA6h(base), { linesAt, correctedAt })
        const note = noteOf(merged, '2026-04-03')
        expect(note.givenOn).toBe('2026-04-07')
        expect(effectOf(merged, note.id)).toEqual({ kind: 'covers', key: '2026-04-03 20:00' })
        expect(readings(merged)).toEqual(
          both({
            phase: 'upcoming',
            moment: ['2026-04-17 06:00'],
            aRenseigner: [],
            ensuite: ['2026-04-17 06:00', '2026-05-01 06:00', '2026-05-15 06:00'],
          }),
        )
      },
    )
  },
)
