// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { newSettings, treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import type { Setting } from '../domain/dose-calendar/types'
import { WEEK, line, setting } from './dose-calendar.v2.aides'

// Milo, chaque lundi à 8 h depuis le 2 mars, rien de noté ; le 9 et le 16 répondus « pas à donner ».
function milo(today: string, weekly: Setting = setting('m1', '2026-03-02', WEEK, ['08:00'])) {
  return {
    settings: [weekly],
    lines: [
      line('m1', 'not-due', '2026-03-09', '08:00'),
      line('m1', 'not-due', '2026-03-16', '08:00'),
    ],
    today,
  } satisfies TreatmentViewInput
}

describe('#873 : une ligne « pas à donner » n’est jamais une prise (décision a du 18 octobre 2026)', () => {
  it('arrêté avant la première échéance avec seulement des lignes « pas à donner » : « Arrêté avant la première prise »', () => {
    const corrected = setting('m1', '2026-03-23', WEEK, ['08:00'], {
      startsOn: '2026-03-02',
      stoppedOn: '2026-03-18',
    })
    const view = treatmentView({
      settings: [corrected],
      lines: [
        line('m1', 'not-due', '2026-03-02', '08:00'),
        line('m1', 'not-due', '2026-03-09', '08:00'),
        line('m1', 'not-due', '2026-03-16', '08:00'),
      ],
      today: '2026-03-19',
    })
    expect(view.phase).toBe('stopped')
    expect(view.stoppedBeforeFirstDose).toBe(true)
  })

  it('la dose du 9, « pas à donner », n’est pas « déjà notée » pour les rappels', () => {
    expect(treatmentView(milo('2026-03-18')).isNoted('2026-03-09', '08:00')).toBe(false)
  })

  it('une date choisie avant la ligne du 16 n’est pas refusée pour « dose plus lointaine déjà notée »', () => {
    const result = newSettings(milo('2026-03-18'), {
      frequency: WEEK,
      times: ['08:00'],
      endsOn: null,
      firstDueOn: '2026-03-19',
    })
    expect(result).not.toHaveProperty('refusal')
  })

  it('le carnet reste « jamais noté » : la correction garde une date proposée, pas choisie (#836)', () => {
    const chosen = setting('m1', '2026-03-02', WEEK, ['08:00'], { firstDueChosen: true })
    const result = newSettings(milo('2026-03-18', chosen), {
      frequency: WEEK,
      times: ['09:00'],
      endsOn: null,
    })
    if (!('question' in result) || 'refusal' in result.question.correct) {
      throw new Error(JSON.stringify(result))
    }
    expect(result.question.correct.setting.firstDueChosen).toBe(false)
  })

  it('R9.3 : la journée du 16, « pas à donner », n’est pas la dernière journée notée pour la date proposée', () => {
    const result = newSettings(milo('2026-03-17'), {
      frequency: { value: 3, unit: 'day' },
      times: ['08:00'],
      endsOn: null,
    })
    if (!('question' in result)) throw new Error(JSON.stringify(result))
    expect(result.question.keep.setting.firstDueOn).toBe('2026-03-17')
  })
})
