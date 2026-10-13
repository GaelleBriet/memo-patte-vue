import { describe, expect, it } from 'vitest'

import { dose, shifted, treatment, period } from './treatment-fixtures'
import { doseFieldsOf, doseWritesOf } from '../logic/treatment-dose-writes'
import type { LineChange } from '@/shared/domain/dose-calendar'

const OWNER = { treatmentId: 'metacam', animalId: 'luna' }
const HISTORY = treatment(
  [period()],
  [dose('2026-09-01', '2026-09-01'), shifted('2026-09-01', '2026-09-03')],
)
const LINE = {
  settingId: 'p-1',
  dueOn: '2026-09-02',
  dueTime: null,
  status: 'given' as const,
  givenOn: '2026-09-03',
  targetOn: null,
}

describe('doseFieldsOf', () => {
  it('une prise n’a pas de jour d’arrivée', () => {
    expect(doseFieldsOf(LINE)).toEqual({
      periodId: 'p-1',
      dueOn: '2026-09-02',
      dueTime: null,
      givenOn: '2026-09-03',
      status: 'given',
      targetOn: null,
    })
  })

  it('un report et un décalage rangent leur jour d’arrivée ou d’ancrage', () => {
    const report = { ...LINE, status: 'postponed' as const, givenOn: null, targetOn: '2026-09-09' }

    expect(doseFieldsOf(report)).toMatchObject({ status: 'postponed', targetOn: '2026-09-09' })
  })
})

describe('doseWritesOf — la traduction des lignes du moteur en écritures', () => {
  let count = 0
  const newId = () => `nouvelle-${(count += 1)}`

  it('crée, réécrit et supprime ce que le moteur demande', () => {
    const changes: LineChange[] = [
      { action: 'create', line: LINE },
      { action: 'rewrite', id: '2026-09-01', line: { ...LINE, dueOn: '2026-09-01' } },
      { action: 'delete', id: 'décalage 2026-09-01' },
    ]

    expect(doseWritesOf(HISTORY, changes, newId)).toEqual([
      { action: 'create', id: 'nouvelle-1', ...OWNER, dose: doseFieldsOf(LINE) },
      {
        action: 'rewrite',
        id: '2026-09-01',
        dose: doseFieldsOf({ ...LINE, dueOn: '2026-09-01' }),
      },
      { action: 'delete', id: 'décalage 2026-09-01' },
    ])
  })

  it('n’écrit rien pour une ligne réécrite à l’identique', () => {
    const same: LineChange = {
      action: 'rewrite',
      id: '2026-09-01',
      line: {
        settingId: 'p-1',
        dueOn: '2026-09-01',
        dueTime: null,
        status: 'given',
        givenOn: '2026-09-01',
        targetOn: null,
      },
    }

    expect(doseWritesOf(HISTORY, [same], newId)).toEqual([])
  })
})
