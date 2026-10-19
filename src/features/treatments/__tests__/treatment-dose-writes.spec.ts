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
      previousTargetOn: null,
      previousTargetTime: null,
      dueRank: null,
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

describe('doseWritesOf — l’arrivée d’avant et le rang d’un report', () => {
  const newId = () => 'nouvelle'
  const HOURS = treatment([period({ times: ['08:00', '14:00', '20:00'] })], [])
  const REPORT = {
    settingId: 'p-1',
    dueOn: '2026-09-04',
    dueTime: '14:00',
    status: 'postponed' as const,
    givenOn: null,
    targetOn: '2026-09-05',
  }

  it('un report écrit pour la première fois : son rang dans les heures de son réglage, pas d’arrivée d’avant', () => {
    expect(doseWritesOf(HOURS, [{ action: 'create', line: REPORT }], newId)).toMatchObject([
      { dose: { dueRank: 2, previousTargetOn: null, previousTargetTime: null } },
    ])
  })

  it('déplacé de nouveau, il garde son arrivée d’avant, jour et heure, et son rang', () => {
    const written = treatment(HOURS.periods, [
      dose('2026-09-04', '2026-09-05', {
        id: 'r1',
        dueTime: '14:00',
        status: 'postponed',
        givenOn: null,
        dueRank: 2,
      }),
    ])
    const moved: LineChange = {
      action: 'rewrite',
      id: 'r1',
      line: { ...REPORT, targetOn: '2026-09-07' },
    }

    expect(doseWritesOf(written, [moved], newId)).toMatchObject([
      {
        action: 'rewrite',
        dose: {
          targetOn: '2026-09-07',
          previousTargetOn: '2026-09-05',
          previousTargetTime: '14:00',
          dueRank: 2,
        },
      },
    ])
  })

  it('réécrit sans changer d’arrivée, il garde l’arrivée d’avant qu’il portait', () => {
    const written = treatment(HOURS.periods, [
      dose('2026-09-04', '2026-09-07', {
        id: 'r1',
        dueTime: '14:00',
        status: 'postponed',
        givenOn: null,
        previousTargetOn: '2026-09-05',
        previousTargetTime: '14:00',
        dueRank: 2,
      }),
    ])
    const same: LineChange = {
      action: 'rewrite',
      id: 'r1',
      line: { ...REPORT, targetOn: '2026-09-07' },
    }

    expect(doseWritesOf(written, [same], newId)).toEqual([])
  })

  it('une heure absente des heures de son réglage : rang inconnu', () => {
    const line = { ...REPORT, dueTime: '09:00' }
    expect(doseWritesOf(HOURS, [{ action: 'create', line }], newId)).toMatchObject([
      { dose: { dueRank: null } },
    ])
  })
})
