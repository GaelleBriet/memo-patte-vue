// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings } from '../domain/dose-calendar'
import { settingsApplied } from '../domain/dose-calendar/gestures/changes'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import type { TreatmentViewInput } from '../domain/dose-calendar/types'
import { buildView } from '../domain/dose-calendar/view'
import * as R from './dose-calendar.reference.aides'
import * as V from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' as const }

function moteur(input: TreatmentViewInput) {
  const view = buildView(input)
  return {
    phase: view.phase,
    moment: V.keys(view.currentDoses),
    aRenseigner: V.keys(view.unloggedDoses),
    ensuite: V.keys(view.upcoming().slice(0, 2)),
  }
}

function reference(input: Parameters<typeof referenceReading>[0]) {
  const { phase, current, unlogged, upcoming } = referenceReading(input)
  return { phase, moment: current, aRenseigner: unlogged, ensuite: upcoming.slice(0, 2) }
}

describe('#836, R9 : une première échéance et une origine proposées par l’app ne remplacent pas la dose du moment', () => {
  it('Milo tous les 3 jours à 8 h depuis le 3 oct., dose du 6 non donnée ; réglage du 7 à 9 h, 10 proposé : le 8, la dose du 6 est en retard', () => {
    const attendu = {
      phase: 'overdue',
      moment: ['2026-10-06 08:00'],
      aRenseigner: [],
      ensuite: ['2026-10-10 09:00', '2026-10-13 09:00'],
    }
    const extra = { startsOn: '2026-10-07' }
    const settings = [
      V.setting('p1', '2026-10-03', THREE_DAYS, ['08:00']),
      V.proposedSetting('p2', '2026-10-10', THREE_DAYS, ['09:00'], extra),
    ]
    const lines = [V.line('p1', 'given', '2026-10-03', '08:00')]
    expect(moteur({ settings, lines, today: '2026-10-08' })).toEqual(attendu)
    const parLaReference = reference({
      settings: [
        R.setting('p1', '2026-10-03', THREE_DAYS, ['08:00']),
        R.proposedSetting('p2', '2026-10-10', THREE_DAYS, ['09:00'], extra),
      ],
      lines: [R.line('p1', 'given', '2026-10-03', '08:00')],
      today: '2026-10-08',
      until: '2026-12-31',
    })
    expect(parLaReference).toEqual(attendu)
  })

  it('chaque lundi à 8 h depuis le 5 oct., dose du 12 non donnée ; réglage du 13 à 9 h, lundi 19 proposé, sur la même grille : le 14, la dose du 12 est en retard', () => {
    const attendu = {
      phase: 'overdue',
      moment: ['2026-10-12 08:00'],
      aRenseigner: [],
      ensuite: ['2026-10-19 09:00', '2026-10-26 09:00'],
    }
    const extra = { startsOn: '2026-10-13' }
    const settings = [
      V.setting('p1', '2026-10-05', V.WEEK, ['08:00']),
      V.proposedSetting('p2', '2026-10-19', V.WEEK, ['09:00'], extra),
    ]
    const lines = [V.line('p1', 'given', '2026-10-05', '08:00')]
    expect(moteur({ settings, lines, today: '2026-10-14' })).toEqual(attendu)
    const parLaReference = reference({
      settings: [
        R.setting('p1', '2026-10-05', R.WEEK, ['08:00']),
        R.proposedSetting('p2', '2026-10-19', R.WEEK, ['09:00'], extra),
      ],
      lines: [R.line('p1', 'given', '2026-10-05', '08:00')],
      today: '2026-10-14',
      until: '2026-12-31',
    })
    expect(parLaReference).toEqual(attendu)
  })

  it('même carnet que Milo ; le 8, heure passée à 10 h sans toucher la date : le réglage reste proposé, la dose du 6 reste en retard', () => {
    const input = {
      settings: [
        V.setting('p1', '2026-10-03', THREE_DAYS, ['08:00']),
        V.proposedSetting('p2', '2026-10-10', THREE_DAYS, ['09:00'], { startsOn: '2026-10-07' }),
      ],
      lines: [V.line('p1', 'given', '2026-10-03', '08:00')],
      today: '2026-10-08',
    }
    const result = newSettings(input, { frequency: THREE_DAYS, times: ['10:00'], endsOn: null })
    if (!('plan' in result)) throw new Error(JSON.stringify(result))
    expect(result.plan).toMatchObject({
      action: 'create',
      setting: { startsOn: '2026-10-08', gridOriginOn: null, firstDueChosen: false },
    })
    const after = settingsApplied(input, result.plan)
    const attendu = {
      phase: 'overdue',
      moment: ['2026-10-06 08:00'],
      aRenseigner: [],
      ensuite: ['2026-10-10 10:00', '2026-10-13 10:00'],
    }
    expect(moteur(after)).toEqual(attendu)
    expect(reference({ ...after, until: '2026-12-31' })).toEqual(attendu)
  })
})
