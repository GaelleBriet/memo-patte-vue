import { describe, expect, it } from 'vitest'

import { dose, extra, period, postponed, shifted, treatment, written } from './treatment-fixtures'
import {
  DoseAlreadyLoggedError,
  doseChange,
  GestureRefusedError,
  type DoseAction,
  type NoteGesture,
} from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'

const VENDREDI = period({
  startsOn: '2026-10-09',
  firstDueOn: '2026-10-09',
  frequency: { value: 1, unit: 'week' },
})
const DUE_16 = { settingId: 'p-1', dueOn: '2026-10-16', dueTime: null }
const PIXEL = treatment([VENDREDI], [dose('2026-10-09', '2026-10-16')])

const note = (
  givenOn: string,
  shiftsFollowing = false,
  status: 'given' | 'missed' = 'given',
  due = DUE_16,
): NoteGesture => ({ kind: 'note', due, status, givenOn, shiftsFollowing })

function change(history: TreatmentWithHistory, today: string, action: DoseAction) {
  let count = 0
  return doseChange(history, treatmentReadingOf(history, today), action, () => `n-${(count += 1)}`)
}

describe('doseChange — « C’est fait » et « Fait à une autre date »', () => {
  it('écrit une prise à son jour, sans décalage', () => {
    const { writes, alreadyGivenOn } = change(PIXEL, '2026-10-16', {
      kind: 'note',
      gesture: note('2026-10-16'),
    })

    expect(alreadyGivenOn).toBeNull()
    expect(writes).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-16', status: 'given' } },
    ])
  })

  it('case cochée : la prise et sa ligne de décalage ancrée à la date réelle', () => {
    const { writes } = change(PIXEL, '2026-10-19', {
      kind: 'note',
      gesture: note('2026-10-19', true),
    })

    expect(writes).toMatchObject([
      { action: 'create', dose: { dueOn: '2026-10-16', status: 'given', givenOn: '2026-10-19' } },
      {
        action: 'create',
        dose: { dueOn: '2026-10-16', status: 'shift', nextDueDate: '2026-10-19' },
      },
    ])
  })

  it('une échéance déjà donnée : rien n’est écrit, le jour est rendu', () => {
    const { writes, alreadyGivenOn } = change(PIXEL, '2026-10-19', {
      kind: 'note',
      gesture: { ...note('2026-10-19'), due: { ...DUE_16, dueOn: '2026-10-09' } },
    })

    expect(writes).toEqual([])
    expect(alreadyGivenOn).toBe('2026-10-09')
  })

  it('une seconde prise en plus le même jour : rien n’est écrit', () => {
    const history = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), extra('2026-10-12', '2026-10-16')],
    )

    const { writes, alreadyGivenOn } = change(history, '2026-10-12', {
      kind: 'note',
      gesture: { ...note('2026-10-12'), due: { ...DUE_16, dueOn: '2026-10-23' } },
    })

    expect(writes).toEqual([])
    expect(alreadyGivenOn).toBe('2026-10-12')
  })

  it('oublier une dose dont le décalage reste : les doses suivantes restent décalées', () => {
    const history = treatment(
      [VENDREDI],
      [
        dose('2026-10-09', '2026-10-16'),
        dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' }),
        shifted('2026-10-16', '2026-10-19'),
      ],
    )

    const { shiftKept } = change(history, '2026-10-20', {
      kind: 'note',
      gesture: note('2026-10-16', false, 'missed'),
    })

    expect(shiftKept).toBe(true)
  })

  it('refuse un geste que le moteur refuse', () => {
    expect(() =>
      change(PIXEL, '2026-10-12', {
        kind: 'move',
        due: DUE_16,
        to: '2026-10-01',
        shiftsFollowing: false,
      }),
    ).toThrow(GestureRefusedError)
  })
})

describe('doseChange — corriger, déplacer, supprimer', () => {
  const REPORT = postponed('2026-10-16', '2026-10-22')

  it('« Prochaine dose » écrit le report et le rend', () => {
    const { writes, moved } = change(PIXEL, '2026-10-12', {
      kind: 'move',
      due: DUE_16,
      to: '2026-10-20',
      shiftsFollowing: false,
    })

    expect(writes).toMatchObject([
      { action: 'create', dose: { status: 'postponed', nextDueDate: '2026-10-20' } },
    ])
    expect(moved).toMatchObject({ status: 'postponed', targetOn: '2026-10-20' })
  })

  it('supprimer un report dont le décalage reste le dit', () => {
    const history = treatment(
      [VENDREDI],
      [...PIXEL.doses, shifted('2026-10-16', '2026-10-19'), postponed('2026-10-16', '2026-10-19')],
    )

    const { writes, shiftKept } = change(history, '2026-10-15', {
      kind: 'remove',
      lineId: 'report 2026-10-16',
    })

    expect(writes).toEqual([{ action: 'delete', id: 'report 2026-10-16' }])
    expect(shiftKept).toBe(true)
  })

  it('changer la date d’une prise annonce les doses passées qu’elle fait apparaître', () => {
    const prise = dose('2026-10-16', '2026-10-26', { givenOn: '2026-10-19' })
    const history = treatment(
      [VENDREDI],
      [dose('2026-10-09', '2026-10-16'), prise, shifted('2026-10-16', '2026-10-19')],
    )

    const { revealed } = change(history, '2026-10-27', {
      kind: 'redate',
      lineId: prise.id,
      givenOn: '2026-10-12',
      shiftsFollowing: true,
    })

    expect(revealed?.unlogged).toEqual([{ settingId: 'p-1', dueOn: '2026-10-19', dueTime: null }])
  })

  it('une ligne introuvable lève', () => {
    expect(() => change(PIXEL, '2026-10-12', { kind: 'remove', lineId: 'inconnue' })).toThrow(
      'Prise introuvable',
    )
    expect(REPORT.status).toBe('postponed')
  })
})

describe('doseChange — renseigner des doses en un lot', () => {
  const lot = (...days: string[]): DoseAction => ({
    kind: 'log',
    gestures: days.map((dueOn) => note(dueOn, false, 'given', { ...DUE_16, dueOn })),
  })

  it('refuse le lot quand une dose est déjà notée, ou n’est pas au calendrier', () => {
    expect(() => change(PIXEL, '2026-10-30', lot('2026-10-16', '2026-10-09'))).toThrow(
      DoseAlreadyLoggedError,
    )
    expect(() => change(PIXEL, '2026-10-30', lot('2026-10-17'))).toThrow(GestureRefusedError)
  })

  it('écrit une ligne par dose et les relit comme notées', () => {
    const { writes } = change(PIXEL, '2026-10-30', lot('2026-10-16', '2026-10-23'))

    expect(writes).toHaveLength(2)
    const after = treatmentReadingOf(written(PIXEL, writes), '2026-10-30').view
    expect(after.unloggedDoses).toEqual([])
  })
})

describe('doseChange — le report nommé quand la suite ne bouge pas (G19, G20)', () => {
  const HELD = treatment(PIXEL.periods, [...PIXEL.doses, postponed('2026-10-23', '2026-10-29')])

  it('garde dans le résultat le report que « C’est fait » a laissé en place', () => {
    const noted = change(HELD, '2026-10-21', {
      kind: 'note',
      gesture: note('2026-10-21'),
      heldBy: '2026-10-29',
    })

    expect(noted.heldBy).toBe('2026-10-29')
    expect(noted.writes.map(({ action }) => action)).toEqual(['create'])
  })

  it('n’en dit rien sans report à nommer', () => {
    expect(change(PIXEL, '2026-10-16', { kind: 'note', gesture: note('2026-10-16') }).heldBy).toBe(
      undefined,
    )
  })
})
