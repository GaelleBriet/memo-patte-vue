// @vitest-environment node
import { expect, it } from 'vitest'

import { newSettings, treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { isOnGrid } from '../domain/dose-calendar/grid'
import { TIMES } from '../../../scripts/dose-engine/carnet'
import { startV2Walk, v2Step } from '../../../scripts/dose-engine/v2-walk'
import { settingsWritten } from '../../../scripts/dose-engine/v2-walk-settings'

const FROM = 8_000_000_000
const CARNETS = 30
const STEPS = 40

function correctedToday(input: TreatmentViewInput, times: readonly string[]): string | null {
  const view = treatmentView(input)
  const current = view.currentSetting
  if (current === null || view.phase === 'stopped') return null
  const { frequency, endsOn } = current
  const asked = newSettings(input, { frequency, times: [...times], endsOn })
  if (!('question' in asked) || 'refusal' in asked.question.correct) return null
  const { today } = input
  if (isOnGrid(current.gridOriginOn ?? current.firstDueOn, frequency, today)) return ''
  const after = settingsWritten(
    { input, random: () => 0, log: [], stamp: () => '2026-12-31T00:00:00.000Z' },
    asked.question.correct,
  )
  const before = view.slots(today, today).length
  const now = treatmentView(after).slots(today, today).length
  return now > before ? `${today} ${JSON.stringify(times)} : ${before} → ${now} doses` : ''
}

it(`#872 : à fréquence gardée, « Elles n’étaient pas à donner » acceptée ne fait apparaître aucune dose aujourd’hui hors de la grille (${CARNETS} carnets × ${STEPS} gestes, graines ${FROM} et suivantes)`, () => {
  const appeared: string[] = []
  let answered = 0
  for (let seed = FROM; seed < FROM + CARNETS; seed += 1) {
    const walk = startV2Walk(seed)
    for (let step = 0; step < STEPS; step += 1) {
      const current = treatmentView(walk.input).currentSetting
      for (const times of current === null ? [] : [current.times, ...TIMES]) {
        const found = correctedToday(walk.input, times)
        if (found === null) continue
        answered += 1
        if (found !== '') appeared.push(`graine ${seed}, pas ${step}, ${found}`)
      }
      v2Step(walk, () => {})
    }
  }
  expect(answered).toBeGreaterThan(CARNETS)
  expect(appeared).toEqual([])
}, 120_000)
