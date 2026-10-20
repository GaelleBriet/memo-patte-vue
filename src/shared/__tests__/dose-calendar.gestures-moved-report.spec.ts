// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Line } from '../domain/dose-calendar'
import { reportToRewrite } from '../domain/dose-calendar/gestures/moved-report'
import { line, setting, WEEK } from './dose-calendar.v2.aides'

// Jeudis de mars : 5, 12, 19, 26.
const p1 = setting('p1', '2026-03-05', WEEK, ['08:00', '14:00', '20:00'])
const report = line('p1', 'postponed', '2026-03-12', '08:00', '2026-03-14')
const shift = line('p1', 'shift', '2026-03-12', '08:00', '2026-03-14')
const episode = new Set(['p1'])
const nothingNoted = () => false

function rewritten(lines: Line[], dueTime: string, carried = false) {
  const input = { settings: [p1], lines, today: '2026-03-08' }
  const due = { settingId: 'p1', dueOn: '2026-03-14', dueTime }
  return reportToRewrite(input, treatmentView(input), episode, due, nothingNoted, carried)
}

describe('le report que reprend « Prochaine dose » sur son arrivée (R7, #989)', () => {
  it('la dose du report, redéplacée depuis son arrivée, réécrit sa ligne', () => {
    expect(rewritten([report, shift], '08:00')).toBe(report)
  })

  it('une heure suivante de l’arrivée d’un décalage part de cette journée : aucune ligne réécrite', () => {
    expect(rewritten([report, shift], '14:00')).toBeUndefined()
  })

  it('emmenée par « Modifier » (#796), l’heure suivante reprend le report de son arrivée', () => {
    expect(rewritten([report, shift], '14:00', true)).toBe(report)
  })

  it('sans décalage, l’heure suivante touchée sur l’arrivée réécrit le report (Q-a)', () => {
    expect(rewritten([report], '14:00')).toBe(report)
  })
})
