// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { staysExtra } from '../../../scripts/dose-engine/v2-invariants-extra'
import type { V2Step } from '../../../scripts/dose-engine/v2-walk'
import {
  applied,
  play,
  type Frequency,
  type Gesture,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { H, line, setting, WEEK } from './dose-calendar.v2.aides'

const THREE_MONTHS: Frequency = { value: 3, unit: 'month' }

function stepOf(before: TreatmentViewInput, gesture: Gesture, played: Gesture = gesture): V2Step {
  const result = play(before, played)
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  const outcome = result as GestureOutcome
  return {
    label: JSON.stringify(gesture),
    before,
    after: applied(before, outcome.changes),
    gesture,
    outcome,
    plan: null,
  }
}

describe('invariant « une réponse En plus reste une prise en plus » (R5, Q27, Q37)', () => {
  // Luna, Bravecto tous les 3 mois à 8 h et 20 h, première prise le 1er nov. ; le 24 oct.
  const bravecto: TreatmentViewInput = {
    settings: [setting('p1', '2026-11-01', THREE_MONTHS, H)],
    lines: [],
    today: '2026-10-24',
  }
  const avance: Gesture = {
    kind: 'note',
    due: { settingId: 'p1', dueOn: '2026-11-01', dueTime: '08:00' },
    status: 'given',
    givenOn: '2026-10-24',
    shiftsFollowing: false,
    answer: 'extra',
  }

  it('Bravecto à plusieurs heures, « Fait à une autre date » au 24 oct. répondu « En plus » : tient', () => {
    expect(staysExtra(stepOf(bravecto, avance))).toBeNull()
  })

  it('la réponse « En plus » écrite comme une prise qui couvre la dose du 1er nov. à 8 h : ne tient pas', () => {
    const { answer: _ignored, ...sansReponse } = avance as Extract<Gesture, { kind: 'note' }>
    expect(staysExtra(stepOf(bravecto, avance, sansReponse))?.invariant).toBe('en plus')
  })

  // Milbemax chaque vendredi : 2, 9, 16, 23 ; le 16, la dose donnée puis une prise « En plus ».
  const milbemax = setting('p1', '2026-10-02', WEEK)
  const donnees = ['2026-10-02', '2026-10-09', '2026-10-16'].map((day) => line('p1', 'given', day))
  const enPlus = line('p1', 'extra', '2026-10-16')
  const vendredis: TreatmentViewInput = {
    settings: [milbemax],
    lines: [...donnees, enPlus],
    today: '2026-10-17',
  }
  const changer = (answer?: 'extra' | 'replaces'): Gesture => ({
    kind: 'redate',
    lineId: enPlus.id,
    givenOn: '2026-10-17',
    shiftsFollowing: false,
    ...(answer === undefined ? {} : { answer }),
  })

  it('« Changer la date » de la prise en plus au 17 répondu « En plus » : tient', () => {
    expect(staysExtra(stepOf(vendredis, changer('extra')))).toBeNull()
  })

  it('« Changer la date » répondu « Remplace celle du 23 oct. », ou sans réponse (règle d’avant Q27) : tient', () => {
    expect(staysExtra(stepOf(vendredis, changer('replaces')))).toBeNull()
    expect(staysExtra(stepOf(vendredis, changer()))).toBeNull()
  })

  it('« Changer la date » répondu « En plus » qui couvre quand même la dose du 23 : ne tient pas', () => {
    expect(staysExtra(stepOf(vendredis, changer('extra'), changer('replaces')))?.invariant).toBe(
      'en plus',
    )
  })

  it('une prise en plus devenue une prise donnée par un autre geste : ne tient pas', () => {
    const autre: V2Step = {
      label: 'Modifier',
      before: vendredis,
      after: {
        ...vendredis,
        lines: [...donnees, { ...enPlus, status: 'given', dueOn: '2026-10-23' }],
      },
      gesture: null,
      outcome: null,
      plan: null,
    }
    expect(staysExtra(autre)?.invariant).toBe('en plus')
  })
})
