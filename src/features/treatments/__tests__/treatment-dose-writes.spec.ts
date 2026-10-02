import { describe, expect, it } from 'vitest'

import { dose, missed, period, postponed, treatment } from './treatment-fixtures'
import { doseChange, movedDueOf, type DoseAction } from '../logic/treatment-dose-writes'
import { treatmentScheduleOf } from '../logic/treatment-schedule'
import type { TreatmentWithHistory } from '../repository/treatments.repository'

const OWNER = { treatmentId: 'metacam', animalId: 'luna' }
const MATIN_ET_SOIR = period({ times: ['08:00', '20:00'] })

function change(history: TreatmentWithHistory, today: string, action: DoseAction) {
  return doseChange(history, treatmentScheduleOf(history, today), action, () => 'nouvelle')
}

describe('doseChange — noter une prise', () => {
  it('crée la prise du jour avec les champs du moteur', () => {
    const history = treatment([period()], [dose('2026-09-01', '2026-09-02')])
    const due = { periodId: 'p-1', dueOn: '2026-09-02', dueTime: null }

    expect(
      change(history, '2026-09-02', {
        kind: 'note',
        gesture: { kind: 'given', due, givenOn: '2026-09-02' },
      }),
    ).toEqual({
      writes: [
        {
          action: 'create',
          id: 'nouvelle',
          ...OWNER,
          dose: { ...due, givenOn: '2026-09-02', status: 'given', nextDueDate: '2026-09-03' },
        },
      ],
      alreadyGivenOn: null,
      postponement: null,
    })
  })

  it('note chaque heure d’un jour comme une échéance à part', () => {
    const history = treatment(
      [MATIN_ET_SOIR],
      [dose('2026-09-01', '2026-09-01', { dueTime: '08:00' })],
    )
    const soir = { periodId: 'p-1', dueOn: '2026-09-01', dueTime: '20:00' }

    const { writes } = change(history, '2026-09-01', {
      kind: 'note',
      gesture: { kind: 'given', due: soir, givenOn: '2026-09-01' },
    })

    expect(writes).toEqual([
      {
        action: 'create',
        id: 'nouvelle',
        ...OWNER,
        dose: { ...soir, givenOn: '2026-09-01', status: 'given', nextDueDate: '2026-09-02' },
      },
    ])
  })

  it('n’écrit rien pour une échéance déjà donnée, et dit quand', () => {
    const history = treatment([period()], [dose('2026-09-01', '2026-09-02')])
    const due = { periodId: 'p-1', dueOn: '2026-09-01', dueTime: null }

    expect(
      change(history, '2026-09-02', {
        kind: 'note',
        gesture: { kind: 'given', due, givenOn: '2026-09-02' },
      }),
    ).toEqual({ writes: [], alreadyGivenOn: '2026-09-01', postponement: null })
  })

  it('repasse en « donnée » toutes les lignes d’une échéance notée oubliée', () => {
    const history = treatment(
      [period()],
      [
        missed('2026-09-01', '2026-09-02', { id: 'ici' }),
        missed('2026-09-01', '2026-09-02', { id: 'ailleurs' }),
      ],
    )
    const due = { periodId: 'p-1', dueOn: '2026-09-01', dueTime: null }
    const given = { ...due, givenOn: '2026-09-01', status: 'given', nextDueDate: '2026-09-02' }

    const { writes } = change(history, '2026-09-02', {
      kind: 'note',
      gesture: { kind: 'given', due, givenOn: '2026-09-01' },
    })

    expect(writes).toEqual([
      { action: 'rewrite', id: 'ici', dose: given },
      { action: 'rewrite', id: 'ailleurs', dose: given },
    ])
  })

  it('marque oubliée la seule prise donnée, sans la supprimer', () => {
    const history = treatment([period()], [dose('2026-09-01', '2026-09-02')])
    const due = { periodId: 'p-1', dueOn: '2026-09-01', dueTime: null }

    const { writes } = change(history, '2026-09-02', {
      kind: 'note',
      gesture: { kind: 'missed', due },
    })

    expect(writes).toEqual([
      {
        action: 'rewrite',
        id: '2026-09-01',
        dose: { ...due, givenOn: null, status: 'missed', nextDueDate: '2026-09-02' },
      },
    ])
  })
})

describe('doseChange — supprimer une prise', () => {
  it('supprime la seule prise du traitement', () => {
    const history = treatment([period()], [dose('2026-09-01', '2026-09-02')])

    expect(change(history, '2026-09-02', { kind: 'remove', doseId: '2026-09-01' }).writes).toEqual([
      { action: 'delete', id: '2026-09-01' },
    ])
  })

  it('supprime toutes les lignes de la même échéance', () => {
    const history = treatment(
      [period()],
      [
        dose('2026-09-01', '2026-09-02', { id: 'ici' }),
        dose('2026-09-01', '2026-09-02', { id: 'ailleurs', updatedAt: '2026-09-01T09:00:00.000Z' }),
        dose('2026-09-02', '2026-09-03'),
      ],
    )

    expect(change(history, '2026-09-03', { kind: 'remove', doseId: 'ici' }).writes).toEqual([
      { action: 'delete', id: 'ici' },
      { action: 'delete', id: 'ailleurs' },
    ])
  })

  it('lève pour une prise inconnue', () => {
    const history = treatment([period()], [dose('2026-09-01', '2026-09-02')])

    expect(() => change(history, '2026-09-02', { kind: 'remove', doseId: 'inconnue' })).toThrow(
      'Prise introuvable',
    )
  })
})

describe('doseChange — changer la date d’une prise', () => {
  const MENSUEL = period({ frequency: { value: 1, unit: 'month' }, firstDueOn: '2026-08-05' })

  it('réécrit la prise et la prochaine dose qu’elle fixe', () => {
    const history = treatment([MENSUEL], [dose('2026-08-05', '2026-09-05')])

    expect(
      change(history, '2026-08-20', {
        kind: 'redate',
        doseId: '2026-08-05',
        givenOn: '2026-08-07',
      }),
    ).toEqual({
      writes: [
        {
          action: 'rewrite',
          id: '2026-08-05',
          dose: {
            periodId: 'p-1',
            dueOn: '2026-08-05',
            dueTime: null,
            givenOn: '2026-08-07',
            status: 'given',
            nextDueDate: '2026-09-07',
          },
        },
      ],
      alreadyGivenOn: null,
      postponement: null,
    })
  })

  it('garde un report placé après la prise, réécrit pour viser la dose qu’elle fixe', () => {
    const history = treatment(
      [MENSUEL],
      [
        dose('2026-08-05', '2026-09-05'),
        postponed('2026-09-05', '2026-09-20', { createdAt: '2026-09-02T08:00:00.000Z' }),
      ],
    )

    const { writes, postponement } = change(history, '2026-08-20', {
      kind: 'redate',
      doseId: '2026-08-05',
      givenOn: '2026-08-07',
    })

    expect(postponement).toEqual({ kept: true, nextDueDate: '2026-09-20' })
    expect(writes).toEqual([
      expect.objectContaining({ action: 'rewrite', id: '2026-08-05' }),
      {
        action: 'rewrite',
        id: 'report 2026-09-05',
        dose: {
          periodId: 'p-1',
          dueOn: '2026-09-07',
          dueTime: null,
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-09-20',
        },
      },
    ])
  })

  it('supprime un report que la nouvelle date dépasse', () => {
    const history = treatment(
      [MENSUEL],
      [
        dose('2026-08-05', '2026-09-05'),
        postponed('2026-09-05', '2026-09-10', { createdAt: '2026-09-02T08:00:00.000Z' }),
      ],
    )

    const { writes, postponement } = change(history, '2026-09-20', {
      kind: 'redate',
      doseId: '2026-08-05',
      givenOn: '2026-09-12',
    })

    expect(postponement).toEqual({ kept: false })
    expect(writes).toEqual([
      expect.objectContaining({ action: 'rewrite', id: '2026-08-05' }),
      { action: 'delete', id: 'report 2026-09-05' },
    ])
  })
})

describe('doseChange — ligne « Reportée »', () => {
  const HEBDO = period({ frequency: { value: 1, unit: 'week' } })
  const REPORTEE = treatment(
    [HEBDO],
    [
      dose('2026-09-01', '2026-09-08'),
      postponed('2026-09-08', '2026-09-10', { createdAt: '2026-09-02T08:00:00.000Z' }),
    ],
  )

  it('vise la dose à sa nouvelle date', () => {
    expect(movedDueOf(REPORTEE.doses[1]!)).toEqual({
      periodId: 'p-1',
      dueOn: '2026-09-10',
      dueTime: null,
    })
  })

  it('supprime le report', () => {
    expect(
      change(REPORTEE, '2026-09-05', { kind: 'remove-move', doseId: 'report 2026-09-08' }).writes,
    ).toEqual([{ action: 'delete', id: 'report 2026-09-08' }])
  })

  it('change sa date en réécrivant la ligne, avec son échéance d’origine', () => {
    expect(
      change(REPORTEE, '2026-09-05', {
        kind: 'move',
        doseId: 'report 2026-09-08',
        to: '2026-09-12',
      }).writes,
    ).toEqual([
      {
        action: 'rewrite',
        id: 'report 2026-09-08',
        dose: {
          periodId: 'p-1',
          dueOn: '2026-09-08',
          dueTime: null,
          givenOn: null,
          status: 'postponed',
          nextDueDate: '2026-09-12',
        },
      },
    ])
  })

  it('remise à sa date d’origine, la dose n’a plus de ligne', () => {
    expect(
      change(REPORTEE, '2026-09-05', {
        kind: 'move',
        doseId: 'report 2026-09-08',
        to: '2026-09-08',
      }).writes,
    ).toEqual([{ action: 'delete', id: 'report 2026-09-08' }])
  })
})

describe('doseChange — déplacements sans effet', () => {
  const SANS_EFFET = treatment(
    [period({ frequency: { value: 1, unit: 'week' } })],
    [
      dose('2026-09-01', '2026-09-08'),
      postponed('2026-09-08', '2026-09-08', { createdAt: '2026-09-02T08:00:00.000Z' }),
    ],
  )

  it('les supprime avec la prochaine écriture', () => {
    expect(treatmentScheduleOf(SANS_EFFET, '2026-09-08').staleDoseIds).toEqual([
      'report 2026-09-08',
    ])
    expect(
      change(SANS_EFFET, '2026-09-08', { kind: 'remove', doseId: '2026-09-01' }).writes,
    ).toEqual([
      { action: 'delete', id: '2026-09-01' },
      { action: 'delete', id: 'report 2026-09-08' },
    ])
  })

  it('réécrit celui de l’échéance notée : une seule ligne par échéance', () => {
    const due = { periodId: 'p-1', dueOn: '2026-09-08', dueTime: null }

    expect(
      change(SANS_EFFET, '2026-09-08', {
        kind: 'note',
        gesture: { kind: 'given', due, givenOn: '2026-09-08' },
      }).writes,
    ).toEqual([
      {
        action: 'rewrite',
        id: 'report 2026-09-08',
        dose: { ...due, givenOn: '2026-09-08', status: 'given', nextDueDate: '2026-09-15' },
      },
    ])
  })
})
