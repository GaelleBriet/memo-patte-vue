// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'

const THREE_DAYS = { value: 3, unit: 'day' } as const

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
